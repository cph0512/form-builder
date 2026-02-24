const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../models/db');
const { requireRole } = require('../middleware/auth');
const { logAction, getIp } = require('../middleware/audit');

const router = express.Router();

// GET /api/forms - 取得表單列表
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.title, f.description, f.is_active, f.created_at, u.name as creator_name
       FROM forms f LEFT JOIN users u ON f.created_by = u.id
       ORDER BY f.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/forms/:id - 取得單一表單（含完整 schema）
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM forms WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: '表單不存在' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/forms - 新增表單
router.post('/', requireRole('super_admin', 'dept_admin'), [
  body('title').notEmpty().withMessage('請輸入表單名稱'),
  body('schema').notEmpty().withMessage('表單結構不能為空'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, description, schema, crm_mappings } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO forms (title, description, schema, crm_mappings, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, description || '', JSON.stringify(schema), JSON.stringify(crm_mappings || {}), req.user.id]
    );

    await pool.query(
      `INSERT INTO form_versions (form_id, version_number, schema, created_by)
       VALUES ($1, 1, $2, $3)`,
      [result.rows[0].id, JSON.stringify(schema), req.user.id]
    );

    logAction(req.user.id, 'form.create', 'form', result.rows[0].id, { title }, getIp(req));
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PUT /api/forms/:id - 更新表單
router.put('/:id', requireRole('super_admin', 'dept_admin'), async (req, res) => {
  const { title, description, schema, crm_mappings, is_active } = req.body;

  try {
    const versionResult = await pool.query(
      'SELECT MAX(version_number) as max_version FROM form_versions WHERE form_id = $1',
      [req.params.id]
    );
    const nextVersion = (versionResult.rows[0].max_version || 0) + 1;

    const result = await pool.query(
      `UPDATE forms SET title=$1, description=$2, schema=$3, crm_mappings=$4, is_active=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [title, description, JSON.stringify(schema), JSON.stringify(crm_mappings || {}), is_active !== false, req.params.id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: '表單不存在' });

    if (schema) {
      await pool.query(
        `INSERT INTO form_versions (form_id, version_number, schema, created_by)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, nextVersion, JSON.stringify(schema), req.user.id]
      );
    }

    logAction(req.user.id, 'form.update', 'form', req.params.id, { title, version: nextVersion }, getIp(req));
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PATCH /api/forms/:id/status - 切換表單啟用/停用狀態
router.patch('/:id/status', requireRole('super_admin', 'dept_admin'), async (req, res) => {
  try {
    const current = await pool.query('SELECT is_active FROM forms WHERE id=$1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: '表單不存在' });

    const newStatus = !current.rows[0].is_active;
    const result = await pool.query(
      'UPDATE forms SET is_active=$1, updated_at=NOW() WHERE id=$2 RETURNING id, title, is_active',
      [newStatus, req.params.id]
    );
    logAction(req.user.id, `form.${newStatus ? 'enable' : 'disable'}`, 'form', req.params.id, {}, getIp(req));
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// DELETE /api/forms/:id
router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  try {
    await pool.query('UPDATE forms SET is_active = false WHERE id = $1', [req.params.id]);
    logAction(req.user.id, 'form.delete', 'form', req.params.id, {}, getIp(req));
    res.json({ message: '表單已停用' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/forms/:id/versions - 取得版本歷史
router.get('/:id/versions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT fv.*, u.name as creator_name FROM form_versions fv
       LEFT JOIN users u ON fv.created_by = u.id
       WHERE fv.form_id = $1 ORDER BY fv.version_number DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
