'use strict';

const rateLimit = require('express-rate-limit');
const { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } = require('../../config/config');

module.exports = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max:      RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' },
});
