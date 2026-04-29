'use strict';

const express = require('express');
const router  = express.Router();
const pool    = require('../../db/pool');
const auth    = require('../middlewares/auth');

// GET /api/workers
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT w.id, w.name, w.city_id, w.priority, w.is_active,
              c.name AS city_name
       FROM   workers w
       LEFT JOIN cities c ON c.id = w.city_id
       ORDER BY w.id`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /workers]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/workers
router.post('/', auth, async (req, res) => {
  const { name, city_id, priority = 0, is_active = true, phone, telegram_chat_id, equipment_type } = req.body;

  if (!name || !city_id) {
    return res.status(400).json({ error: 'name and city_id are required' });
  }
  if (telegram_chat_id === undefined || telegram_chat_id === null || telegram_chat_id === '') {
    return res.status(400).json({ error: 'telegram_chat_id is required' });
  }
  const tgNum = typeof telegram_chat_id === 'string' ? Number(telegram_chat_id) : telegram_chat_id;
  if (!Number.isFinite(tgNum)) {
    return res.status(400).json({ error: 'telegram_chat_id must be a numeric Telegram chat id' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO workers (name, city_id, priority, is_active, phone, telegram_chat_id, equipment_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, city_id, priority, is_active, phone ?? null, tgNum, equipment_type ?? 'motoblock']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[POST /workers]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PATCH /api/workers/:id
router.patch('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid worker id' });

  const { name, city_id, priority, is_active, phone, telegram_chat_id, equipment_type } = req.body;

  const fields = [];
  const values = [];
  let idx = 1;

  if (name             !== undefined) { fields.push(`name = $${idx++}`);              values.push(name); }
  if (city_id          !== undefined) { fields.push(`city_id = $${idx++}`);           values.push(city_id); }
  if (priority         !== undefined) { fields.push(`priority = $${idx++}`);          values.push(priority); }
  if (is_active        !== undefined) { fields.push(`is_active = $${idx++}`);         values.push(is_active); }
  if (phone            !== undefined) { fields.push(`phone = $${idx++}`);             values.push(phone); }
  if (telegram_chat_id !== undefined) {
    const tgNum = typeof telegram_chat_id === 'string' ? Number(telegram_chat_id) : telegram_chat_id;
    if (!Number.isFinite(tgNum)) {
      return res.status(400).json({ error: 'telegram_chat_id must be a numeric Telegram chat id' });
    }
    fields.push(`telegram_chat_id = $${idx++}`);
    values.push(tgNum);
  }
  if (equipment_type   !== undefined) { fields.push(`equipment_type = $${idx++}`);    values.push(equipment_type); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE workers SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ error: 'Worker not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[PATCH /workers/:id]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// DELETE /api/workers/:id
router.delete('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid worker id' });

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM workers WHERE id = $1`, [id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Worker not found' });
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /workers/:id]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
