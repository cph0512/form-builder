const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const pool = require('../models/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../services/emailService');

const router = express.Router();

// 每個角色的預設功能權限
const ROLE_DEFAULT_FEATURES = {
  super_admin: ['form_create', 'form_status', 'submissions', 'submissions_export', 'users_manage', 'dept_manage', 'crm_connections', 'crm_mapping', 'crm_jobs', 'linebot_manage'],
  dept_admin:  ['form_create', 'submissions', 'submissions_export', 'users_manage', 'crm_connections', 'crm_mapping', 'crm_jobs', 'linebot_manage'],
  manager:     ['submissions'],
  staff:       [],
};
const getEffectivePerms = (role, explicit) =>
  [...new Set([...(ROLE_DEFAULT_FEATURES[role] || []), ...explicit])];

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

    // 查詢使用者的額外權限
    const permsResult = await pool.query(
      'SELECT feature FROM user_permissions WHERE user_id = $1',
      [user.id]
    );
    const explicit = permsResult.rows.map(r => r.feature);
    const permissions = getEffectivePerms(user.role, explicit);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name,
        department_id: user.department_id, permissions },
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
        permissions,
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

// GET /api/auth/users/:id/permissions - 取得使用者的功能權限
router.get('/users/:id/permissions', authenticateToken, requireRole('super_admin', 'dept_admin'), async (req, res) => {
  try {
    const userRes = await pool.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (!userRes.rows[0]) return res.status(404).json({ error: '使用者不存在' });

    const role = userRes.rows[0].role;
    const permsRes = await pool.query('SELECT feature FROM user_permissions WHERE user_id = $1', [req.params.id]);
    const explicit = permsRes.rows.map(r => r.feature);
    const roleDefaults = ROLE_DEFAULT_FEATURES[role] || [];
    const effective = getEffectivePerms(role, explicit);

    res.json({ roleDefaults, explicit, effective });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PUT /api/auth/users/:id/permissions - 更新使用者的額外功能權限（僅 super_admin）
router.put('/users/:id/permissions', authenticateToken, requireRole('super_admin'), async (req, res) => {
  const { features = [] } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_permissions WHERE user_id = $1', [req.params.id]);
    for (const feature of features) {
      await client.query(
        'INSERT INTO user_permissions (user_id, feature, granted_by) VALUES ($1, $2, $3)',
        [req.params.id, feature, req.user.id]
      );
    }
    await client.query('COMMIT');
    res.json({ message: '權限已更新', count: features.length });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// POST /api/auth/forgot-password — 發送密碼重設信件
router.post('/forgot-password', [
  body('email').isEmail().withMessage('請輸入有效的 Email'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email } = req.body;
  // 固定回傳成功，避免帳號列舉攻擊
  const SUCCESS_MSG = { message: '若此 Email 已註冊，您將收到密碼重設連結，請查收信箱' };

  try {
    const result = await pool.query(
      'SELECT id, name FROM users WHERE email = $1 AND is_active = true',
      [email]
    );
    const user = result.rows[0];
    if (!user) return res.json(SUCCESS_MSG);

    // 清除舊的未使用 token
    await pool.query(
      'DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 分鐘

    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;
    await sendPasswordResetEmail(email, user.name, resetLink);

    res.json(SUCCESS_MSG);
  } catch (err) {
    console.error('忘記密碼錯誤:', err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/auth/reset-password — 使用 token 重設密碼
router.post('/reset-password', [
  body('token').notEmpty().withMessage('缺少重設 token'),
  body('password').isLength({ min: 6 }).withMessage('密碼至少 6 個字元'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { token, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL`,
      [token]
    );
    const resetToken = result.rows[0];
    if (!resetToken) return res.status(400).json({ error: '重設連結無效或已過期，請重新申請' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, resetToken.user_id]
    );
    await pool.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
      [resetToken.id]
    );

    res.json({ message: '密碼已重設成功，請重新登入' });
  } catch (err) {
    console.error('重設密碼錯誤:', err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/auth/me/ical-token — 取得目前的 iCal 訂閱 token
router.get('/me/ical-token', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT ical_token FROM users WHERE id=$1',
      [req.user.id]
    );
    res.json({ token: rows[0]?.ical_token || null });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/auth/me/ical-token — 重新產生 token（舊訂閱連結失效）
router.post('/me/ical-token', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE users SET ical_token=gen_random_uuid() WHERE id=$1 RETURNING ical_token',
      [req.user.id]
    );
    res.json({ token: rows[0]?.ical_token });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
