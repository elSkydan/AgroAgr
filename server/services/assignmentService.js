'use strict';

/**
 * assignmentService.js
 *
 * All mutations run inside PostgreSQL transactions with SELECT FOR UPDATE.
 * Telegram calls happen strictly after COMMIT — never inside a transaction.
 */

const pool            = require('../../db/pool');;
const telegramService = require('./telegramService');
const { ACTIVE_LEAD_LIMIT, ADMIN_CHAT_ID } = require('../../config/config');

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS = {
  new:            ['assigned', 'unassigned'],
  assigned:       ['accepted', 'rejected', 'timeout', 'unassigned', 'canceled'],
  rejected:       ['assigned', 'unassigned'],
  timeout:        ['assigned', 'unassigned'],
  accepted:       ['completed', 'failed_contact', 'canceled'],
  completed:      ['canceled'],
  unassigned:     ['assigned', 'canceled'],
  failed_contact: ['canceled'],
  canceled:       [],
};

function assertTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    console.error(`[assignmentService] Invalid transition: "${from}" -> "${to}"`);
    const err = new Error(`Invalid lead status transition: "${from}" -> "${to}"`);
    err.code       = 'INVALID_TRANSITION';
    err.statusCode = 409;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// pickWorker — must run INSIDE an open transaction
// ---------------------------------------------------------------------------

/**
 * NOT EXISTS is used instead of NOT IN:
 *   - correctly handles edge cases with NULLs
 *   - allows the planner to use idx_la_lead index
 */
async function pickWorker(client, leadId, cityId) {
  const { rows } = await client.query(
    `SELECT w.id, w.telegram_chat_id, w.name
     FROM   workers w
     WHERE  w.city_id   = $1
       AND  w.is_active = TRUE
       AND  NOT EXISTS (
              SELECT 1
              FROM   lead_assignments la
              WHERE  la.lead_id  = $2
                AND  la.worker_id = w.id
            )
       AND  (
              SELECT COUNT(*)
              FROM   leads l
              WHERE  l.worker_id = w.id
                AND  l.status IN ('assigned', 'accepted')
            ) < $3
     ORDER BY
       w.priority         DESC,
       w.last_assigned_at ASC NULLS FIRST
     LIMIT 1`,
    [cityId, leadId, ACTIVE_LEAD_LIMIT]
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// assignLead
// ---------------------------------------------------------------------------

async function assignLead(leadId, cityId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: leadRows } = await client.query(
      `SELECT id, status FROM leads WHERE id = $1 FOR UPDATE`,
      [leadId]
    );

    if (!leadRows.length) {
      await client.query('ROLLBACK');
      const err = new Error(`Lead ${leadId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const lead = leadRows[0];

    // Only assign 'new' leads — silently skip if already processed (idempotent)
    if (lead.status !== 'new') {
      await client.query('ROLLBACK');
      return { assigned: false, workerId: null, status: lead.status };
    }

    const worker = await pickWorker(client, leadId, cityId);

    if (!worker) {
      await client.query(
        `UPDATE leads SET status = 'unassigned', updated_at = NOW() WHERE id = $1`,
        [leadId]
      );
      await client.query('COMMIT');

      telegramService
        .notifyAdmin(ADMIN_CHAT_ID, leadId, 'No workers available')
        .catch(err => console.error('[telegram] notifyAdmin failed (assignLead):', err));

      return { assigned: false, workerId: null, status: 'unassigned' };
    }

    await client.query(
      `UPDATE leads
       SET    status     = 'assigned',
              worker_id  = $1,
              updated_at = NOW()
       WHERE  id = $2`,
      [worker.id, leadId]
    );

    await client.query(
      `UPDATE workers SET last_assigned_at = NOW() WHERE id = $1`,
      [worker.id]
    );

    await client.query(
      `INSERT INTO lead_assignments (lead_id, worker_id, status)
       VALUES ($1, $2, 'sent')`,
      [leadId, worker.id]
    );

    await client.query('COMMIT');

    telegramService
      .sendLeadToWorker(worker.telegram_chat_id, leadId, worker.id)
      .catch(err => console.error(`[telegram] sendLeadToWorker failed (lead ${leadId}):`, err));

    return { assigned: true, workerId: worker.id, status: 'assigned' };

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(`[assignLead] lead ${leadId}:`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// reassignLead
// ---------------------------------------------------------------------------

async function reassignLead(leadId, reason) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: leadRows } = await client.query(
      `SELECT id, status, city_id, worker_id FROM leads WHERE id = $1 FOR UPDATE`,
      [leadId]
    );

    if (!leadRows.length) {
      await client.query('ROLLBACK');
      const err = new Error(`Lead ${leadId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const lead = leadRows[0];

    assertTransition(lead.status, reason);

    await client.query(
      `UPDATE lead_assignments
       SET    status = $1
       WHERE  lead_id   = $2
         AND  worker_id = $3
         AND  status    = 'sent'`,
      [reason, leadId, lead.worker_id]
    );

    await client.query(
      `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2`,
      [reason, leadId]
    );

    const worker = await pickWorker(client, leadId, lead.city_id);

    if (!worker) {
      await client.query(
        `UPDATE leads SET status = 'unassigned', updated_at = NOW() WHERE id = $1`,
        [leadId]
      );
      await client.query('COMMIT');

      telegramService
        .notifyAdmin(ADMIN_CHAT_ID, leadId, `Unassigned after ${reason}`)
        .catch(err => console.error('[telegram] notifyAdmin failed (reassignLead):', err));

      return { assigned: false, workerId: null, status: 'unassigned' };
    }

    assertTransition(reason, 'assigned');

    await client.query(
      `UPDATE leads
       SET    status              = 'assigned',
              worker_id           = $1,
              last_sent_worker_id = $1,
              updated_at          = NOW()
       WHERE  id = $2`,
      [worker.id, leadId]
    );

    await client.query(
      `UPDATE workers SET last_assigned_at = NOW() WHERE id = $1`,
      [worker.id]
    );

    await client.query(
      `INSERT INTO lead_assignments (lead_id, worker_id, status)
       VALUES ($1, $2, 'sent')`,
      [leadId, worker.id]
    );

    await client.query('COMMIT');

    telegramService
      .sendLeadToWorker(worker.telegram_chat_id, leadId, worker.id)
      .catch(err => console.error(`[telegram] sendLeadToWorker failed (lead ${leadId}):`, err));

    return { assigned: true, workerId: worker.id, status: 'assigned' };

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(`[reassignLead] lead ${leadId} (${reason}):`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// applyWorkerResponse — Telegram inline button handler
// ---------------------------------------------------------------------------

async function applyWorkerResponse(leadId, workerId, telegramChatId, action) {
  if (action !== 'accept' && action !== 'reject') {
    const err = new Error(`Unknown action: "${action}"`);
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify telegram_chat_id matches workerId — prevents spoofed callback_data
    const { rows: workerRows } = await client.query(
      `SELECT id FROM workers WHERE id = $1 AND telegram_chat_id = $2`,
      [workerId, telegramChatId]
    );
    if (!workerRows.length) {
      await client.query('ROLLBACK');
      const err = new Error('Worker identity mismatch');
      err.statusCode = 403;
      throw err;
    }

    // Lock lead row for update
    const { rows: leadRows } = await client.query(
      `SELECT id, status, worker_id FROM leads WHERE id = $1 FOR UPDATE`,
      [leadId]
    );
    if (!leadRows.length) {
      await client.query('ROLLBACK');
      const err = new Error(`Lead ${leadId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const lead = leadRows[0];

    // Must be 'assigned' — catches timeout races
    if (lead.status !== 'assigned') {
      await client.query('ROLLBACK');
      console.error(
        `[applyWorkerResponse] lead ${leadId} status is "${lead.status}", expected "assigned"`
      );
      const err = new Error(
        `Lead is no longer in "assigned" state (current: "${lead.status}")`
      );
      err.statusCode = 409;
      err.code = 'INVALID_TRANSITION';
      throw err;
    }

    // Must be assigned to THIS worker
    if (lead.worker_id !== workerId) {
      await client.query('ROLLBACK');
      console.error(
        `[applyWorkerResponse] lead ${leadId} worker mismatch: assigned=${lead.worker_id}, caller=${workerId}`
      );
      const err = new Error('This lead is no longer assigned to you');
      err.statusCode = 409;
      throw err;
    }

    if (action === 'accept') {
      assertTransition(lead.status, 'accepted');

      await client.query(
        `UPDATE leads SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
        [leadId]
      );
      await client.query(
        `UPDATE lead_assignments
         SET    status = 'accepted'
         WHERE  lead_id   = $1
           AND  worker_id = $2
           AND  status    = 'sent'`,
        [leadId, workerId]
      );
      await client.query('COMMIT');

    } else {
      // reject: commit the lock release, then reassign in its own transaction
      await client.query('COMMIT');
      await reassignLead(leadId, 'rejected');
    }

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(
      `[applyWorkerResponse] lead ${leadId} action "${action}":`, err.message
    );
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { assignLead, reassignLead, applyWorkerResponse };
