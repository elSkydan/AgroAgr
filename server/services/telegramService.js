'use strict';

/**
 * telegramService.js
 *
 * All outbound Telegram calls use withRetry() — 3 attempts, 700ms delay.
 * Failures are logged but never throw to callers (Telegram must not break DB logic).
 */

const { TELEGRAM_TOKEN } = require('../../config/config');

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 700;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * POST to Telegram Bot API with automatic retry.
 *
 * @param {string} method   - e.g. 'sendMessage'
 * @param {object} payload
 * @returns {Promise<object>} parsed response body
 * @throws {Error} after all retries exhausted
 */
async function telegramPost(method, payload) {
  let lastErr;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${TELEGRAM_API}/${method}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const body = await res.json();

      if (!body.ok) {
        throw new Error(
          `Telegram API error [${method}]: ${body.description} (code ${body.error_code})`
        );
      }

      return body.result;

    } catch (err) {
      lastErr = err;
      console.error(
        `[telegram] ${method} attempt ${attempt}/${RETRY_ATTEMPTS} failed:`,
        err.message
      );

      if (attempt < RETRY_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // All retries exhausted — log and re-throw so the caller's .catch() handles it
  console.error(`[telegram] ${method} failed after ${RETRY_ATTEMPTS} attempts:`, lastErr.message);
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a new lead notification to a worker with Accept / Reject inline buttons.
 *
 * callback_data is kept short (JSON, under 64 bytes) using single-char keys.
 *
 * @param {number} chatId
 * @param {number} leadId
 * @param {number} workerId
 */
async function sendLeadToWorker(chatId, leadId, workerId) {
  const acceptData = JSON.stringify({ l: leadId, w: workerId, a: 'accept' });
  const rejectData = JSON.stringify({ l: leadId, w: workerId, a: 'reject' });

  await telegramPost('sendMessage', {
    chat_id:    chatId,
    text:       `New lead #${leadId}\n\nPlease respond within 3 minutes.`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: 'Accept', callback_data: acceptData },
        { text: 'Reject', callback_data: rejectData },
      ]],
    },
  });
}

/**
 * Notify the admin about an important event (unassigned lead, failed_contact, etc.).
 *
 * @param {number} adminChatId
 * @param {number} leadId
 * @param {string} reason
 */
async function notifyAdmin(adminChatId, leadId, reason) {
  await telegramPost('sendMessage', {
    chat_id: adminChatId,
    text:    `Admin alert — Lead #${leadId}: ${reason}`,
  });
}

/**
 * Answer a callback query (removes the loading spinner on the button).
 *
 * @param {string} callbackQueryId
 * @param {string} [text]
 */
async function answerCallback(callbackQueryId, text = '') {
  await telegramPost('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
  });
}

/**
 * Edit a worker message and clear inline keyboard after decision.
 *
 * @param {number} chatId
 * @param {number} messageId
 * @param {string} text
 */
async function editMessageText(chatId, messageId, text) {
  await telegramPost('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: { inline_keyboard: [] },
  });
}

module.exports = { sendLeadToWorker, notifyAdmin, answerCallback, editMessageText };
