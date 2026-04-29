'use strict';

module.exports = {
  DATABASE_URL:          process.env.DATABASE_URL,
  TELEGRAM_TOKEN:        process.env.TELEGRAM_BOT_TOKEN,
  ADMIN_CHAT_ID:         Number(process.env.ADMIN_CHAT_ID)          || 0,
  ADMIN_TOKEN:           process.env.ADMIN_TOKEN                    || 'change-me',
  ACTIVE_LEAD_LIMIT:     Number(process.env.ACTIVE_LEAD_LIMIT)      || 3,
  TIMEOUT_MINUTES:       Number(process.env.TIMEOUT_MINUTES)        || 3,
  ACCEPTED_TTL_MINUTES:  Number(process.env.ACCEPTED_TTL_MINUTES)   || 30,
  SPAM_WINDOW_MINUTES:   Number(process.env.SPAM_WINDOW_MINUTES)    || 10,
  RATE_LIMIT_MAX:        Number(process.env.RATE_LIMIT_MAX)         || 5,
  RATE_LIMIT_WINDOW_MS:  Number(process.env.RATE_LIMIT_WINDOW_MS)   || 60000,
  PORT:                  Number(process.env.PORT)                   || 3000,
};
