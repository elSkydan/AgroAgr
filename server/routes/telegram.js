'use strict';

const express = require('express');
const router = express.Router();

// временный заглушка
router.post('/webhook', (req, res) => {
  console.log('[telegram webhook]', req.body);
  res.sendStatus(200);
});

module.exports = router;