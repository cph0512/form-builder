/**
 * CRM 欄位對應管理 API
 * 每個「表單 × CRM連線」組合可設定一組欄位對應
 */
const express = require('express');
const pool = require('../models/db');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

// GET /api/crm/mappings?form_id=xxx - 取得某表單的所有 CRM 對應
router.get('/', async (req, res) => {
  const { form_id } = req.query;
  if (!form_id) return res.status(400).json({ error: '請提供 form_id' });

  try {
    const result = await pool.query(
      `SELECT m.*, c.name as crm_name, c.type as crm_type, c.url as crm_url
       FROM crm_field_mappings m
       LEFT JOIN crm_connections c ON m.crm_connection_id = c.id
       WHERE m.form_id = $1
       ORDER BY m.created_at ASC`,
      [form_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PUT /api/crm/mappings - 新增或更新對應（upsert）
router.put('/', requirePermission('crm_mapping'), async (req, res) => {
  const { form_id, crm_connection_id, mappings = [], is_active = true } = req.body;
  if (!form_id || !crm_connection_id) {
    return res.status(400).json({ error: '請提供 form_id 和 crm_connection_id' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO crm_field_mappings (form_id, crm_connection_id, mappings, is_active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (form_id, crm_connection_id)
       DO UPDATE SET mappings=$3, is_active=$4, updated_at=NOW()
       RETURNING *`,
      [form_id, crm_connection_id, JSON.stringify(mappings), is_active]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// DELETE /api/crm/mappings/:id
router.delete('/:id', requirePermission('crm_mapping'), async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_field_mappings WHERE id=$1', [req.params.id]);
    res.json({ message: '已刪除' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
