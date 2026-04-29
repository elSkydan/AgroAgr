'use strict';

/**
 * assignmentService.js
 *
 * EXECUTION ORDER (enforced, never deviate):
 *   1. BEGIN transaction
 *   2. INSERT or fetch lead  (done in controller before calling assignLead)
 *   3. SELECT lead FOR UPDATE
 *   4. Check lead.status === 'new'
 *   5. SELECT worker
 *   6. INSERT lead_assignments
 *   7. UPDATE lead.status
 *   8. COMMIT
 *   9. AFTER COMMIT → telegramService
 *
 * Telegram is NEVER called inside a transaction.
 * telegramService failure does NOT affect DB state.
 */

const pool            = require('../../db/pool');
const telegramService = require('./telegramService');
const { ACTIVE_LEAD_LIMIT, ADMIN_CHAT_ID } = require('../../config/config');

// ---------------------------------------------------------------------------
// Structured logger — never throws
// ---------------------------------------------------------------------------

function log(event, leadId, workerId = null) {
  try {
    console.log(JSON.stringify({
      event,
      leadId,
      workerId,
      timestamp: new Date().toISOString(),
    }));
  } catch (_) {}
}

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
    console.error(JSON.stringify({
      event: 'invalid_transition',
      from, to,
      timestamp: new Date().toISOString(),
    }));
    const err = new Error(`Invalid lead status transition: "${from}" -> "${to}"`);
    err.code       = 'INVALID_TRANSITION';
    err.statusCode = 409;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// pickWorker — INSIDE an open transaction (never lock workers table)
//
// Locking strategy (per spec):
//   1. Lead row locked first (caller's responsibility, done before pickWorker)
//   2. Worker selected by query — NOT locked (spec: NEVER lock worker table)
// ---------------------------------------------------------------------------

async function pickWorker(client, leadId, cityId) {
  const { rows } = await client.query(
    `SELECT w.id, w.name, w.telegram_chat_id
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
// assignLead — main entry point
// Returns { assigned, status, worker: {id, name} | null }
// ---------------------------------------------------------------------------

async function assignLead(leadId, cityId) {
  const client = await pool.connect();
  try {
    // STEP 1: BEGIN
    await client.query('BEGIN');

    // STEP 3: SELECT lead FOR UPDATE  (lead was inserted by controller — step 2)
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

    // STEP 4: check status === 'new'
    if (leadRows[0].status !== 'new') {
      await client.query('ROLLBACK');
      // Idempotent — already processed, not an error
      return { assigned: false, workerId: null, worker: null, status: leadRows[0].status };
    }

    // STEP 5: select worker
    const worker = await pickWorker(client, leadId, cityId);

    if (!worker) {
      // STEP 6 (no worker path): update lead → unassigned
      await client.query(
        `UPDATE leads SET status = 'unassigned', updated_at = NOW() WHERE id = $1`,
        [leadId]
      );
      // STEP 8: COMMIT
      await client.query('COMMIT');

      log('lead_rejected', leadId, null);

      // STEP 9: Telegram after commit
      telegramService
        .notifyAdmin(ADMIN_CHAT_ID, leadId, 'No workers available')
        .catch(err => console.error('[telegram] notifyAdmin failed:', err.message));

      return { assigned: false, workerId: null, worker: null, status: 'unassigned' };
    }

    // STEP 6: INSERT lead_assignments
    await client.query(
      `INSERT INTO lead_assignments (lead_id, worker_id, status) VALUES ($1, $2, 'sent')`,
      [leadId, worker.id]
    );

    // STEP 7: UPDATE lead.status
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

    // STEP 8: COMMIT
    await client.query('COMMIT');

    // Structured log after commit
    console.log('Assigned lead', leadId, 'to worker', worker.id);
    log('lead_assigned', leadId, worker.id);

    // STEP 9: Telegram after commit — failure never affects DB
    telegramService
      .sendLeadToWorker(worker.telegram_chat_id, leadId, worker.id)
      .catch(err => console.error(`[telegram] sendLeadToWorker failed (lead ${leadId}):`, err.message));

    return {
      assigned: true,
      workerId: worker.id,
      worker:   { id: worker.id, name: worker.name },
      status:   'assigned',
    };

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(`[assignLead] lead ${leadId}:`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// reassignLead — after rejection or timeout (max 1 attempt from timeoutService)
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

    // timeoutService may bulk-set lead to 'timeout' before calling reassignLead; in that case
    // assertTransition('timeout','timeout') would fail — only sync assignment rows and continue.
    if (lead.status === reason && reason === 'timeout') {
      await client.query(
        `UPDATE lead_assignments
         SET    status = $1
         WHERE  lead_id   = $2 AND worker_id = $3 AND status = 'sent'`,
        [reason, leadId, lead.worker_id]
      );
    } else {
      assertTransition(lead.status, reason);
      await client.query(
        `UPDATE lead_assignments
         SET    status = $1
         WHERE  lead_id   = $2 AND worker_id = $3 AND status = 'sent'`,
        [reason, leadId, lead.worker_id]
      );
      await client.query(
        `UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2`,
        [reason, leadId]
      );
    }

    const worker = await pickWorker(client, leadId, lead.city_id);

    if (!worker) {
      await client.query(
        `UPDATE leads SET status = 'unassigned', updated_at = NOW() WHERE id = $1`,
        [leadId]
      );
      await client.query('COMMIT');

      log('lead_timeout', leadId, null);

      telegramService
        .notifyAdmin(ADMIN_CHAT_ID, leadId, `Unassigned after ${reason}`)
        .catch(err => console.error('[telegram] notifyAdmin failed:', err.message));

      return { assigned: false, workerId: null, worker: null, status: 'unassigned' };
    }

    assertTransition(reason, 'assigned');

    await client.query(
      `INSERT INTO lead_assignments (lead_id, worker_id, status) VALUES ($1, $2, 'sent')`,
      [leadId, worker.id]
    );

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

    await client.query('COMMIT');

    log('lead_assigned', leadId, worker.id);

    telegramService
      .sendLeadToWorker(worker.telegram_chat_id, leadId, worker.id)
      .catch(err => console.error(`[telegram] sendLeadToWorker failed (lead ${leadId}):`, err.message));

    return {
      assigned: true,
      workerId: worker.id,
      worker:   { id: worker.id, name: worker.name },
      status:   'assigned',
    };

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(`[reassignLead] lead ${leadId} (${reason}):`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// applyWorkerResponse — Telegram inline button: accept / reject
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

    if (lead.status !== 'assigned') {
      await client.query('ROLLBACK');
      console.error(`[applyWorkerResponse] lead ${leadId} status="${lead.status}", expected "assigned"`);
      const err = new Error(`Lead is not in "assigned" state (current: "${lead.status}")`);
      err.statusCode = 409;
      err.code = 'INVALID_TRANSITION';
      throw err;
    }

    if (lead.worker_id !== workerId) {
      await client.query('ROLLBACK');
      console.error(`[applyWorkerResponse] lead ${leadId} worker mismatch: assigned=${lead.worker_id}, caller=${workerId}`);
      const err = new Error('This lead is no longer assigned to you');
      err.statusCode = 409;
      throw err;
    }

    if (action === 'accept') {
      assertTransition(lead.status, 'accepted');
      await client.query(
        `UPDATE leads SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [leadId]
      );
      await client.query(
        `UPDATE lead_assignments SET status = 'accepted'
         WHERE lead_id = $1 AND worker_id = $2 AND status = 'sent'`,
        [leadId, workerId]
      );
      await client.query('COMMIT');
      log('lead_assigned', leadId, workerId); // accepted = still same worker

    } else {
      await client.query('COMMIT');
      log('lead_rejected', leadId, workerId);
      await reassignLead(leadId, 'rejected');
    }

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(`[applyWorkerResponse] lead ${leadId} action="${action}":`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { assignLead, reassignLead, applyWorkerResponse };
