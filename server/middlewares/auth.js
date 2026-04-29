'use strict';

const { ADMIN_TOKEN } = require('../../config/config');

module.exports = function auth(req, res, next) {
  const header = req.headers['authorization'] ?? '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized', code: 'INVALID_TOKEN' });
  }
  next();
};
