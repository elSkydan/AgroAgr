'use strict';

/**
 * timeoutService.js
 *
 * Cron job — runs every minute.
 * Handles two cases:
 *   1. 'assigned' leads past TIMEOUT_MINUTES  → mark timeout, reassign
 *   2. 'accepted' leads past ACCEPTED_TTL_MINUTES → mark failed_contact, notify admin
 *
 * Uses FOR UPDATE SKIP LOCKED so concurrent cron runs never double-process a lead.
 * Processes in batches of 20 to avoid long-running transactions.
 */

const pool            = require('../../db/pool');
const { reassignLead } = require('./assignmentService');
const telegramService  = require('./telegramService');
const {
  TIMEOUT_MINUTES,
  ACCEPTED_TTL_MINUTES,
  ADMIN_CHAT_ID,
} = require('../../config/config');

const BATCH_SIZE = 20;

// ---------------------------------------------------------------------------
// Timeout assigned leads
// ---------------------------------------------------------------------------

async function processAssignedTimeouts() {
  const client = await pool.connect();
  let timedOutIds = [];

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id
       FROM   leads
       WHERE  status     = 'assigned'
         AND  updated_at < NOW() - ($1 || ' minutes')::INTERVAL
       ORDER BY updated_at ASC
       LIMIT  $2
       FOR UPDATE SKIP LOCKED`,
      [TIMEOUT_MINUTES, BATCH_SIZE]
    );

    timedOutIds = rows.map(r => r.id);

    if (timedOutIds.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    // Mark all as timeout in one query — reassignment happens outside this tx
    await client.query(
      `UPDATE leads
       SET    status     = 'timeout',
              updated_at = NOW()
       WHERE  id = ANY($1::int[])`,
      [timedOutIds]
    );

    await client.query('COMMIT');

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[timeoutService] processAssignedTimeouts batch error:', err.message);
    return;
  } finally {
    client.release();
  }

  // Reassign each lead individually (each gets its own transaction)
  for (const leadId of timedOutIds) {
    try {
      await reassignLead(leadId, 'timeout');
    } catch (err) {
      console.error(`[timeoutService] reassignLead failed for lead ${leadId}:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Failed-contact: accepted leads that went silent
// ---------------------------------------------------------------------------

async function processAcceptedTTL() {
  const client = await pool.connect();
  let expiredIds = [];

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id
       FROM   leads
       WHERE  status     = 'accepted'
         AND  updated_at < NOW() - ($1 || ' minutes')::INTERVAL
       ORDER BY updated_at ASC
       LIMIT  $2
       FOR UPDATE SKIP LOCKED`,
      [ACCEPTED_TTL_MINUTES, BATCH_SIZE]
    );

    expiredIds = rows.map(r => r.id);

    if (expiredIds.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `UPDATE leads
       SET    status     = 'failed_contact',
              updated_at = NOW()
       WHERE  id = ANY($1::int[])`,
      [expiredIds]
    );

    await client.query('COMMIT');

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[timeoutService] processAcceptedTTL batch error:', err.message);
    return;
  } finally {
    client.release();
  }

  for (const leadId of expiredIds) {
    telegramService
      .notifyAdmin(ADMIN_CHAT_ID, leadId, 'Accepted but no contact — marked failed_contact')
      .catch(err =>
        console.error(`[timeoutService] notifyAdmin failed for lead ${leadId}:`, err.message)
      );
  }
}

// ---------------------------------------------------------------------------
// Start cron
// ---------------------------------------------------------------------------

function startTimeoutCron() {
  // node-cron: every minute
  const cron = require('node-cron');

  cron.schedule('* * * * *', async () => {
    try {
      await processAssignedTimeouts();
      await processAcceptedTTL();
    } catch (err) {
      console.error('[timeoutService] cron tick error:', err.message);
    }
  });

  console.log('[timeoutService] Cron started (every minute)');
}

module.exports = { startTimeoutCron };
