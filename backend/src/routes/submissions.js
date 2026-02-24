const express = require('express');
const pool = require('../models/db');
const { logAction, getIp } = require('../middleware/audit');

const router = express.Router();

// GET /api/submissions/stats - 提交統計
router.get('/stats', async (req, res) => {
  try {
    const params = [];
    let userFilter = '';
    if (req.user.role === 'staff') {
      userFilter = 'WHERE fs.submitted_by = $1';
      params.push(req.user.id);
    }

    const [totalRes, todayRes, byFormRes, weeklyRes, monthlyRes, crmRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int as total FROM form_submissions fs ${userFilter}`, [...params]),
      pool.query(
        `SELECT COUNT(*)::int as today FROM form_submissions fs ${userFilter ? userFilter + ' AND' : 'WHERE'} DATE(fs.submitted_at) = CURRENT_DATE`,
        [...params]
      ),
      pool.query(
        `SELECT f.title, f.id as form_id, COUNT(fs.id)::int as count
         FROM form_submissions fs
         LEFT JOIN forms f ON fs.form_id = f.id
         ${userFilter}
         GROUP BY f.id, f.title
         ORDER BY count DESC LIMIT 5`,
        [...params]
      ),
      pool.query(
        `SELECT DATE(fs.submitted_at)::text as date, COUNT(*)::int as count
         FROM form_submissions fs ${userFilter}
         GROUP BY DATE(fs.submitted_at)
         ORDER BY date DESC LIMIT 7`,
        [...params]
      ),
      pool.query(
        `SELECT DATE(fs.submitted_at)::text as date, COUNT(*)::int as count
         FROM form_submissions fs
         ${userFilter ? userFilter + ' AND' : 'WHERE'} fs.submitted_at >= CURRENT_DATE - INTERVAL '29 days'
         GROUP BY DATE(fs.submitted_at)
         ORDER BY date ASC`,
        [...params]
      ),
      pool.query(
        `SELECT status, COUNT(*)::int as count FROM crm_write_jobs GROUP BY status`
      ),
    ]);

    const crmStats = { pending: 0, running: 0, success: 0, failed: 0, cancelled: 0 };
    crmRes.rows.forEach(r => { crmStats[r.status] = r.count; });

    res.json({
      total: totalRes.rows[0].total,
      today: todayRes.rows[0].today,
      byForm: byFormRes.rows,
      weekly: weeklyRes.rows.reverse(),
      monthly: monthlyRes.rows,
      crm: crmStats,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/submissions/export?form_id=...&format=csv - 批量匯出 CSV
router.get('/export', async (req, res) => {
  const { form_id } = req.query;

  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === 'staff') {
      conditions.push(`fs.submitted_by = $${idx++}`);
      params.push(req.user.id);
    }
    if (form_id) {
      conditions.push(`fs.form_id = $${idx++}`);
      params.push(form_id);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const dataRes = await pool.query(
      `SELECT fs.id, fs.data, fs.crm_sync_status, fs.submitted_at,
              u.name as submitter_name, f.title as form_title
       FROM form_submissions fs
       LEFT JOIN users u ON fs.submitted_by = u.id
       LEFT JOIN forms f ON fs.form_id = f.id
       ${where}
       ORDER BY fs.submitted_at ASC`,
      params
    );

    const rows = dataRes.rows;
    if (rows.length === 0) {
      return res.status(404).json({ error: '無提交記錄可匯出' });
    }

    // 動態收集所有提交的欄位 keys
    const allKeys = new Set();
    rows.forEach(row => {
      Object.keys(row.data || {}).forEach(k => allKeys.add(k));
    });
    const fieldKeys = Array.from(allKeys);

    const escapeCsv = (val) => {
      const str = Array.isArray(val) ? val.join(', ') : String(val == null ? '' : val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headerRow = ['編號', '表單', '提交者', '提交時間', 'CRM狀態', ...fieldKeys]
      .map(escapeCsv).join(',');

    const dataRows = rows.map(row => {
      const base = [
        row.id,
        row.form_title || '',
        row.submitter_name || '',
        new Date(row.submitted_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
        row.crm_sync_status || '',
      ];
      const fields = fieldKeys.map(k => (row.data || {})[k]);
      return [...base, ...fields].map(escapeCsv).join(',');
    });

    const csv = '\uFEFF' + [headerRow, ...dataRows].join('\n');

    const formTitle = rows[0]?.form_title || 'submissions';
    const safeTitle = formTitle.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${safeTitle}_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '匯出失敗' });
  }
});

// POST /api/submissions - 提交表單
router.post('/', async (req, res) => {
  const { form_id, data } = req.body;
  if (!form_id || !data) return res.status(400).json({ error: '缺少必要欄位' });

  try {
    const formResult = await pool.query(
      'SELECT id, title FROM forms WHERE id = $1 AND is_active = true',
      [form_id]
    );
    if (!formResult.rows[0]) return res.status(404).json({ error: '表單不存在' });

    const result = await pool.query(
      `INSERT INTO form_submissions (form_id, submitted_by, data)
       VALUES ($1, $2, $3) RETURNING *`,
      [form_id, req.user.id, JSON.stringify(data)]
    );

    logAction(req.user.id, 'submission.create', 'form_submission', result.rows[0].id,
      { form_id, form_title: formResult.rows[0].title }, getIp(req));

    /* ── 觸發 CRM 自動寫入 ── */
    const submissionId = result.rows[0].id;
    let crmJobCount = 0;

    try {
      // 查詢此表單有哪些已啟用的 CRM 欄位對應（每個對應 = 一個寫入目標）
      const mappingResult = await pool.query(
        `SELECT m.crm_connection_id
         FROM crm_field_mappings m
         INNER JOIN crm_connections c ON m.crm_connection_id = c.id
         WHERE m.form_id = $1
           AND m.is_active = true
           AND c.is_active = true`,
        [form_id]
      );

      if (mappingResult.rows.length > 0) {
        const { enqueueJob } = require('../services/jobQueue');
        const jobIds = [];

        for (const row of mappingResult.rows) {
          const jobResult = await pool.query(
            `INSERT INTO crm_write_jobs (submission_id, crm_connection_id)
             VALUES ($1, $2) RETURNING id`,
            [submissionId, row.crm_connection_id]
          );
          jobIds.push(jobResult.rows[0].id);
        }

        // 通知佇列立即處理
        jobIds.forEach(id => enqueueJob(id));
        crmJobCount = jobIds.length;
        console.log(`[Submission] 已建立 ${crmJobCount} 個 CRM 寫入任務`);
      }
    } catch (crmErr) {
      // CRM 任務建立失敗不影響主要的表單提交回應
      console.error('[Submission] 建立 CRM 任務失敗：', crmErr.message);
    }

    res.status(201).json({
      id: submissionId,
      message: '表單提交成功',
      crm_sync_status: crmJobCount > 0 ? 'queued' : 'not_configured',
      crm_jobs_created: crmJobCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /api/submissions - 取得提交記錄（含分頁）
router.get('/', async (req, res) => {
  const { form_id, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === 'staff') {
      conditions.push(`fs.submitted_by = $${idx++}`);
      params.push(req.user.id);
    }
    if (form_id) {
      conditions.push(`fs.form_id = $${idx++}`);
      params.push(form_id);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countRes, dataRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int as total FROM form_submissions fs ${where}`, params),
      pool.query(
        `SELECT fs.id, fs.data, fs.crm_sync_status, fs.submitted_at,
                u.name as submitter_name, f.title as form_title, f.id as form_id
         FROM form_submissions fs
         LEFT JOIN users u ON fs.submitted_by = u.id
         LEFT JOIN forms f ON fs.form_id = f.id
         ${where}
         ORDER BY fs.submitted_at DESC
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

module.exports = router;
