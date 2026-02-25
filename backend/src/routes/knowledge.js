/**
 * M-10 業務知識庫路由
 * GET    /api/knowledge          - 列出（支援 ?category=&q=）
 * POST   /api/knowledge          - 手動新增
 * PUT    /api/knowledge/:id      - 更新
 * DELETE /api/knowledge/:id      - 刪除
 * GET    /api/knowledge/search   - 搜尋（LINE Bot tool call 用）
 * POST   /api/knowledge/parse-image  - 上傳圖片 → AI 解析
 * POST   /api/knowledge/parse-file   - 上傳 CSV/Excel/PDF → 解析
 * POST   /api/knowledge/bulk         - 批次儲存（CSV/Excel 匯入用）
 */
const express  = require('express');
const multer   = require('multer');
const pool     = require('../models/db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const aiService = require('../services/aiService');

const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const ALLOWED_CATEGORIES = ['product', 'price', 'faq', 'policy', 'general'];

// ─── 搜尋（LINE Bot tool call，需 JWT）──────────────────────────────
router.get('/search', authenticateToken, async (req, res) => {
  const { q = '', category } = req.query;
  if (!q.trim()) return res.json([]);
  try {
    const params = [`%${q}%`];
    let catClause = '';
    if (category && ALLOWED_CATEGORIES.includes(category)) {
      params.push(category);
      catClause = `AND category=$${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT id, title, content, category, tags
       FROM knowledge_base
       WHERE is_active=true
         AND (title ILIKE $1 OR content ILIKE $1)
         ${catClause}
       ORDER BY created_at DESC
       LIMIT 5`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '搜尋失敗' });
  }
});

// ─── 列出 ────────────────────────────────────────────────────────────
router.get('/', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  const { q = '', category } = req.query;
  try {
    const params = [];
    const conditions = ['is_active=true'];
    if (q.trim()) {
      params.push(`%${q}%`);
      conditions.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`);
    }
    if (category && ALLOWED_CATEGORIES.includes(category)) {
      params.push(category);
      conditions.push(`category=$${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT kb.*, u.name as creator_name
       FROM knowledge_base kb
       LEFT JOIN users u ON kb.created_by=u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY kb.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// ─── 新增 ────────────────────────────────────────────────────────────
router.post('/', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  const { title, content, category = 'general', tags = [], source_type = 'manual', source_file } = req.body;
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: '標題和內容為必填' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO knowledge_base (created_by, title, content, category, tags, source_type, source_file)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id, title.trim(), content.trim(),
       ALLOWED_CATEGORIES.includes(category) ? category : 'general',
       tags, source_type, source_file || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: '新增失敗' });
  }
});

// ─── 更新 ────────────────────────────────────────────────────────────
router.put('/:id', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  const { title, content, category, tags, is_active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE knowledge_base
       SET title=$1, content=$2, category=$3, tags=$4, is_active=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [title, content,
       ALLOWED_CATEGORIES.includes(category) ? category : 'general',
       tags ?? [], is_active ?? true, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: '找不到條目' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: '更新失敗' });
  }
});

// ─── 刪除 ────────────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  try {
    await pool.query('UPDATE knowledge_base SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ message: '已刪除' });
  } catch (err) {
    res.status(500).json({ error: '刪除失敗' });
  }
});

// ─── 批次儲存（CSV/Excel 匯入確認後）────────────────────────────────
router.post('/bulk', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  const { items, category = 'general', source_type = 'csv' } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '沒有要匯入的條目' });
  }
  try {
    const inserted = [];
    for (const item of items) {
      if (!item.title?.trim() || !item.content?.trim()) continue;
      const { rows } = await pool.query(
        `INSERT INTO knowledge_base (created_by, title, content, category, tags, source_type)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, title`,
        [req.user.id, item.title.trim(), item.content.trim(),
         ALLOWED_CATEGORIES.includes(category) ? category : 'general',
         item.tags || [], source_type]
      );
      inserted.push(rows[0]);
    }
    res.status(201).json({ inserted: inserted.length, items: inserted });
  } catch (err) {
    res.status(500).json({ error: '批次匯入失敗' });
  }
});

// ─── 上傳圖片 → AI 解析 ───────────────────────────────────────────────
router.post('/parse-image', authenticateToken, requirePermission('linebot_manage'),
  upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '請上傳圖片' });
    try {
      const base64 = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype || 'image/jpeg';
      const parsed = await aiService.parseImage(base64, mimeType);
      if (!parsed) return res.status(500).json({ error: 'AI 解析失敗，請確認 AI 引擎設定' });
      res.json({ content: parsed, filename: req.file.originalname });
    } catch (err) {
      console.error('[parse-image]', err.message);
      res.status(500).json({ error: `解析失敗：${err.message}` });
    }
  }
);

// ─── 上傳 CSV / Excel / PDF → 解析 ───────────────────────────────────
router.post('/parse-file', authenticateToken, requirePermission('linebot_manage'),
  upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '請上傳檔案' });
    const ext = (req.file.originalname || '').split('.').pop().toLowerCase();
    try {
      // CSV / Excel
      if (['csv', 'xlsx', 'xls'].includes(ext)) {
        const XLSX = require('xlsx');
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
        if (rows.length === 0) return res.status(400).json({ error: '試算表沒有資料' });

        // 每一列轉成一筆知識庫條目
        const items = rows.map((row, i) => {
          const keys = Object.keys(row);
          // 第一欄為標題，其餘欄位合併為內容
          const title = String(row[keys[0]] || `條目 ${i + 1}`).trim();
          const content = keys.slice(1)
            .map(k => `${k}：${row[k]}`)
            .filter(s => s.length > 3)
            .join('\n');
          return { title, content: content || title, tags: [] };
        });
        return res.json({ type: ext === 'csv' ? 'csv' : 'excel', items, filename: req.file.originalname });
      }

      // PDF
      if (ext === 'pdf') {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(req.file.buffer);
        const text = data.text.trim();
        if (!text) return res.status(400).json({ error: 'PDF 無法提取文字（可能是掃描版圖片型 PDF）' });
        return res.json({
          type: 'pdf',
          items: [{ title: req.file.originalname.replace('.pdf', ''), content: text, tags: [] }],
          filename: req.file.originalname,
        });
      }

      return res.status(400).json({ error: `不支援的檔案格式：.${ext}，請上傳 CSV、Excel 或 PDF` });
    } catch (err) {
      console.error('[parse-file]', err.message);
      res.status(500).json({ error: `解析失敗：${err.message}` });
    }
  }
);

module.exports = router;
