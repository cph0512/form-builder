const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../models/db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/departments - 取得所有部門（含成員人數）
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.id, d.name, d.created_at,
             COUNT(u.id) FILTER (WHERE u.is_active = true) as member_count
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id
      GROUP BY d.id
      ORDER BY d.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/departments - 新增部門
router.post('/', requireRole('super_admin'), [
  body('name').notEmpty().withMessage('請輸入部門名稱').trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO departments (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: '部門名稱已存在' });
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PUT /api/departments/:id - 更新部門名稱
router.put('/:id', requireRole('super_admin'), [
  body('name').notEmpty().withMessage('請輸入部門名稱').trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name } = req.body;
  try {
    const result = await pool.query(
      'UPDATE departments SET name=$1 WHERE id=$2 RETURNING *',
      [name, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '部門不存在' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: '部門名稱已存在' });
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// DELETE /api/departments/:id - 刪除部門（需無在職成員）
router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    const memberCheck = await pool.query(
      'SELECT COUNT(*) FROM users WHERE department_id = $1 AND is_active = true',
      [req.params.id]
    );
    if (parseInt(memberCheck.rows[0].count) > 0) {
      return res.status(400).json({ error: '此部門仍有在職成員，無法刪除' });
    }
    const result = await pool.query(
      'DELETE FROM departments WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '部門不存在' });
    res.json({ message: '部門已刪除' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
