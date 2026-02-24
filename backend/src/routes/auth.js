const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../models/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().withMessage('請輸入有效的 Email'),
  body('password').notEmpty().withMessage('請輸入密碼'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT u.*, d.name as dept_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.email = $1 AND u.is_active = true',
      [email]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Email 或密碼錯誤' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Email 或密碼錯誤' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.dept_name,
      }
    });
  } catch (err) {
    console.error('登入錯誤:', err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/auth/me - 取得目前登入使用者資訊
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT u.id, u.name, u.email, u.role, d.name as dept_name FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/auth/users - 取得所有使用者（僅管理員）
router.get('/users', authenticateToken, requireRole('super_admin', 'dept_admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, d.name as dept_name
       FROM users u LEFT JOIN departments d ON u.department_id = d.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/auth/users - 新增使用者（僅管理員）
router.post('/users', authenticateToken, requireRole('super_admin', 'dept_admin'), [
  body('name').notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['super_admin', 'dept_admin', 'manager', 'staff']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, password, role, department_id } = req.body;

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, department_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role',
      [name, email, hash, role, department_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email 已存在' });
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PUT /api/auth/users/:id - 更新使用者資訊
router.put('/users/:id', authenticateToken, requireRole('super_admin', 'dept_admin'), [
  body('name').notEmpty().withMessage('請輸入姓名').trim(),
  body('role').isIn(['super_admin', 'dept_admin', 'manager', 'staff']).withMessage('角色無效'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, role, department_id } = req.body;

  // dept_admin 無法指派 super_admin 角色
  if (req.user.role === 'dept_admin' && role === 'super_admin') {
    return res.status(403).json({ error: '權限不足，無法指派超級管理員角色' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET name=$1, role=$2, department_id=$3, updated_at=NOW()
       WHERE id=$4 RETURNING id, name, email, role, department_id, is_active`,
      [name, role, department_id || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '使用者不存在' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PATCH /api/auth/users/:id/status - 啟用或停用使用者
router.patch('/users/:id/status', authenticateToken, requireRole('super_admin', 'dept_admin'), async (req, res) => {
  // 不允許停用自己
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: '無法停用自己的帳號' });
  }

  try {
    const current = await pool.query('SELECT is_active FROM users WHERE id=$1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: '使用者不存在' });

    const newStatus = !current.rows[0].is_active;
    const result = await pool.query(
      'UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2 RETURNING id, name, is_active',
      [newStatus, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PUT /api/auth/users/:id/password - 重設使用者密碼（僅 super_admin）
router.put('/users/:id/password', authenticateToken, requireRole('super_admin'), [
  body('password').isLength({ min: 6 }).withMessage('密碼至少 6 個字元'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const hash = await bcrypt.hash(req.body.password, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2 RETURNING id',
      [hash, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '使用者不存在' });
    res.json({ message: '密碼已重設' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
