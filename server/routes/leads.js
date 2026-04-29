'use strict';

/**
 * routes/leads.js + controller
 *
 * POST   /api/leads             — public, rate-limited
 * GET    /api/leads             — admin, paginated
 * GET    /api/leads/debug/stats — admin (registered before /:id)
 * GET    /api/leads/:id         — admin
 * PATCH  /api/leads/:id/cancel  — admin, restricted statuses
 */

const express  = require('express');
const router   = express.Router();
const pool     = require('../../db/pool');
const { calcPrice }                    = require('../services/pricingService');
const { assignLead }                   = require('../services/assignmentService');
const rateLimiter                      = require('../middlewares/rateLimiter');
const { validateLead, normalizePhone } = require('../middlewares/validateLead');
const auth                             = require('../middlewares/auth');
const { SPAM_WINDOW_MINUTES }          = require('../../config/config');

// Statuses that mean the lead lifecycle is over — allow new lead from same phone
const TERMINAL_STATUSES = ['completed', 'canceled', 'failed_contact'];

// Statuses from which cancel is allowed
const CANCELABLE_STATUSES = ['new', 'assigned', 'timeout'];

// ---------------------------------------------------------------------------
// POST /api/leads
// ---------------------------------------------------------------------------

router.post('/', rateLimiter, validateLead, async (req, res) => {
  const {
    name,
    phone,
    service_type,
    area,
    city_id,
    out_of_city = false,
  } = req.body;

  // phone is already validated by validateLead middleware, but normalize here
  // for use in the DB query
  let phoneNormalized;
  try {
    phoneNormalized = normalizePhone(phone);
  } catch (e) {
    return res.status(422).json({ error: e.message, code: 'INVALID_PHONE' });
  }

  // ── Load city ────────────────────────────────────────────
  let city;
  try {
    const { rows } = await pool.query(
      `SELECT id, name, delivery_price, delivery_type
       FROM   cities
       WHERE  id = $1`,
      [city_id]
    );
    if (!rows.length) {
      return res.status(422).json({ error: 'City not found', code: 'INVALID_CITY' });
    }
    city = rows[0];
  } catch (err) {
    console.error('[POST /leads] city lookup:', err);
    return res.status(500).json({ error: 'Database error' });
  }

  // ── Server-side price calculation ───────────────────────
  let totalPrice;
  try {
    totalPrice = calcPrice(service_type, area, out_of_city, city);
  } catch (err) {
    return res.status(err.statusCode ?? 422).json({
      error: err.message,
      code:  err.code ?? 'PRICING_ERROR',
    });
  }

  // ── Anti-spam / deduplication (10-minute window) ────────
  let existingLead = null;
  try {
    const { rows } = await pool.query(
      `SELECT id, status
       FROM   leads
       WHERE  phone_normalized = $1
         AND  created_at > NOW() - ($2 || ' minutes')::INTERVAL
       ORDER BY created_at DESC
       LIMIT 1`,
      [phoneNormalized, SPAM_WINDOW_MINUTES]
    );
    existingLead = rows[0] ?? null;
  } catch (err) {
    console.error('[POST /leads] spam check:', err);
    return res.status(500).json({ error: 'Database error' });
  }

  // ── Upsert lead ─────────────────────────────────────────
  let leadId;

  if (existingLead && !TERMINAL_STATUSES.includes(existingLead.status)) {
    // Active duplicate: update fields in place, keep the same lead id
    try {
      await pool.query(
        `UPDATE leads
         SET    service_type = $1,
                area         = $2,
                total_price  = $3,
                out_of_city  = $4,
                city_id      = $5,
                updated_at   = NOW()
         WHERE  id = $6`,
        [service_type, area, totalPrice, out_of_city, city_id, existingLead.id]
      );
      leadId = existingLead.id;
    } catch (err) {
      console.error('[POST /leads] update existing lead:', err);
      return res.status(500).json({ error: 'Database error' });
    }
  } else {
    // New lead
    try {
      const { rows } = await pool.query(
        `INSERT INTO leads
           (name, phone_normalized, phone_raw, service_type,
            area, total_price, city_id, out_of_city, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new')
         RETURNING id`,
        [name, phoneNormalized, phone, service_type,
         area, totalPrice, city_id, out_of_city]
      );
      leadId = rows[0].id;
    } catch (err) {
      console.error('[POST /leads] insert lead:', err);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  // ── Assign worker (awaited — response reflects real outcome) ──
  let assignmentResult;
  try {
    assignmentResult = await assignLead(leadId, city_id);
  } catch (err) {
    console.error(`[POST /leads] assignLead failed for lead ${leadId}:`, err);
    // Lead is already persisted; return 201 but flag that assignment failed
    return res.status(201).json({
      lead_id:         leadId,
      total_price:     totalPrice,
      status:          'new',
      assigned:        false,
      assigned_worker: null,
      message:         'Lead received. Assignment failed — admin has been notified.',
    });
  }

  return res.status(201).json({
    lead_id:         leadId,
    total_price:     totalPrice,
    status:          assignmentResult.status,
    assigned:        assignmentResult.assigned,
    assigned_worker: assignmentResult.worker
      ? { id: assignmentResult.worker.id, name: assignmentResult.worker.name }
      : null,
    message:         assignmentResult.assigned
      ? 'Lead received. A specialist will contact you shortly.'
      : 'Lead received. No specialists available right now — we will call you back.',
  });
});

// ---------------------------------------------------------------------------
// GET /api/leads  (admin, paginated)
// ---------------------------------------------------------------------------

router.get('/', auth, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit, 10)  || 50, 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0,  0);
  const status = req.query.status ?? null;

  const SORT_MAP = {
    'created_at_desc': 'l.created_at DESC',
    'created_at_asc':  'l.created_at ASC',
  };
  const orderBy = SORT_MAP[req.query.sort] ?? 'l.created_at DESC';

  const conditions = [];
  const values     = [];
  let   idx        = 1;

  if (status) {
    conditions.push(`l.status = $${idx++}`);
    values.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM leads l ${where}`,
      values
    );
    const total = parseInt(countRes.rows[0].count, 10);

    values.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.phone_normalized, l.service_type,
              l.area, l.total_price, l.city_id, l.status,
              l.created_at, l.updated_at,
              w.id   AS worker_id,
              w.name AS worker_name
       FROM   leads l
       LEFT JOIN workers w ON w.id = l.worker_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${idx++} OFFSET $${idx++}`,
      values
    );

    res.json({
      total,
      limit,
      offset,
      data: rows,
    });
  } catch (err) {
    console.error('[GET /leads]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/leads/debug/stats  (admin) — must be before /:id
// ---------------------------------------------------------------------------

router.get('/debug/stats', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM leads)                                    AS total_leads,
         (SELECT COUNT(*) FROM workers WHERE is_active = TRUE)          AS active_workers,
         (SELECT COUNT(*) FROM leads WHERE status IN ('new','assigned')) AS pending_leads`
    );
    const r = rows[0];
    res.json({
      total_leads:    parseInt(r.total_leads, 10),
      active_workers: parseInt(r.active_workers, 10),
      pending_leads:  parseInt(r.pending_leads, 10),
    });
  } catch (err) {
    console.error('[GET /debug/stats]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/leads/:id  (admin)
// ---------------------------------------------------------------------------

router.get('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid lead id' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         l.*,
         c.name AS city_name,
         w.name AS worker_name,
         w.phone AS worker_phone,
         COALESCE(
           json_agg(
             json_build_object(
               'worker_id',  la.worker_id,
               'status',     la.status,
               'created_at', la.created_at
             ) ORDER BY la.created_at
           ) FILTER (WHERE la.id IS NOT NULL),
           '[]'
         ) AS assignment_history
       FROM   leads l
       LEFT JOIN cities           c  ON c.id = l.city_id
       LEFT JOIN workers          w  ON w.id = l.worker_id
       LEFT JOIN lead_assignments la ON la.lead_id = l.id
       WHERE  l.id = $1
       GROUP BY l.id, c.name, w.name, w.phone`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    return res.json(rows[0]);

  } catch (err) {
    console.error('[GET /leads/:id]', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/leads/:id/cancel  (admin)
// Cancel only allowed from: new, assigned, timeout
// ---------------------------------------------------------------------------

router.patch('/:id/cancel', auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid lead id' });
  }

  try {
    // First read current status
    const { rows: readRows } = await pool.query(
      `SELECT id, status FROM leads WHERE id = $1`,
      [id]
    );

    if (!readRows.length) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const current = readRows[0].status;

    if (!CANCELABLE_STATUSES.includes(current)) {
      return res.status(400).json({
        error: `Cannot cancel a lead with status "${current}". Allowed: ${CANCELABLE_STATUSES.join(', ')}.`,
        code:  'INVALID_TRANSITION',
      });
    }

    await pool.query(
      `UPDATE leads
       SET    status     = 'canceled',
              updated_at = NOW()
       WHERE  id = $1`,
      [id]
    );

    return res.json({ lead_id: id, status: 'canceled' });

  } catch (err) {
    console.error('[PATCH /leads/:id/cancel]', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
