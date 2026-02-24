/**
 * CRM 寫入任務管理 API
 */
const express = require('express');
const pool = require('../models/db');
const { requireRole } = require('../middleware/auth');
const { enqueueJob } = require('../services/jobQueue');

const router = express.Router();

// GET /api/crm/jobs - 查詢任務列表
router.get('/', async (req, res) => {
  const { status, form_id, page = 1, limit = 30 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`j.status = $${idx++}`); params.push(status); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countRes, dataRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int as total FROM crm_write_jobs j ${where}`, params),
      pool.query(
        `SELECT j.*,
                c.name as crm_name, c.type as crm_type,
                f.title as form_title,
                s.submitted_at
         FROM crm_write_jobs j
         LEFT JOIN crm_connections c ON j.crm_connection_id = c.id
         LEFT JOIN form_submissions s ON j.submission_id = s.id
         LEFT JOIN forms f ON s.form_id = f.id
         ${where}
         ORDER BY j.created_at DESC
         LIMIT ${parseInt(limit)} OFFSET ${offset}`,
        params
      ),
    ]);

    res.json({
      data: dataRes.rows,
      total: countRes.rows[0].total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/crm/jobs/stats - 任務統計
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT status, COUNT(*)::int as count
       FROM crm_write_jobs
       GROUP BY status`
    );
    const stats = { pending: 0, running: 0, success: 0, failed: 0, cancelled: 0 };
    result.rows.forEach(r => { stats[r.status] = r.count; });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/crm/jobs/:id/retry - 重新執行失敗任務
router.post('/:id/retry', requireRole('super_admin', 'dept_admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE crm_write_jobs
       SET status='pending', retry_count=retry_count+1, error_message=NULL, started_at=NULL, completed_at=NULL
       WHERE id=$1 AND status IN ('failed','cancelled')
       RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(400).json({ error: '找不到任務或任務狀態不允許重試' });

    // 重新加入佇列
    enqueueJob(result.rows[0].id);
    res.json({ message: '已加入重試佇列', job: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/crm/jobs/:id/cancel - 取消任務
router.post('/:id/cancel', requireRole('super_admin', 'dept_admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE crm_write_jobs SET status='cancelled' WHERE id=$1 AND status='pending' RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(400).json({ error: '只有等待中的任務可以取消' });
    res.json({ message: '已取消', job: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

module.exports = router;
