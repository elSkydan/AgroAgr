'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../../db/pool');
const auth    = require('../middlewares/auth');

// GET /api/cities
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, delivery_type, delivery_price, base_radius, created_at
       FROM   cities
       ORDER BY id`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /cities]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/cities
router.post('/', auth, async (req, res) => {
  const { name, delivery_type = 'fixed', delivery_price = 0, base_radius } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO cities (name, delivery_type, delivery_price, base_radius)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, delivery_type, delivery_price, base_radius ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /cities]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/cities/:id
router.patch('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid city id' });

  const { name, delivery_type, delivery_price, base_radius } = req.body;

  const fields = [];
  const values = [];
  let idx = 1;

  if (name           !== undefined) { fields.push(`name = $${idx++}`);           values.push(name); }
  if (delivery_type  !== undefined) { fields.push(`delivery_type = $${idx++}`);  values.push(delivery_type); }
  if (delivery_price !== undefined) { fields.push(`delivery_price = $${idx++}`); values.push(delivery_price); }
  if (base_radius    !== undefined) { fields.push(`base_radius = $${idx++}`);    values.push(base_radius); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE cities SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'City not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /cities/:id]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
