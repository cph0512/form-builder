/**
 * CRM 連線管理 API
 * M-03: CRM 自動寫入引擎 - 連線設定部分
 */
const express = require('express');
const pool = require('../models/db');
const { requirePermission } = require('../middleware/auth');
const { logAction, getIp } = require('../middleware/audit');

const router = express.Router();

// GET /api/crm/connections - 取得所有 CRM 連線
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name as creator_name
       FROM crm_connections c
       LEFT JOIN users u ON c.created_by = u.id
       ORDER BY c.created_at DESC`
    );
    // 不回傳密碼等敏感欄位
    const rows = result.rows.map(sanitizeConnection);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/crm/connections/inspect-selector
// 用 Playwright 截圖並高亮顯示命中的 CSS Selector 元素
router.post('/inspect-selector', requirePermission('crm_connections'), async (req, res) => {
  const { url, selector } = req.body;
  if (!url)      return res.status(400).json({ error: '請提供目標 URL' });
  if (!selector) return res.status(400).json({ error: '請提供 CSS Selector' });

  const { chromium } = require('playwright');
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Playwright 啟動失敗：' + err.message });
  }

  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    });

    await page.goto(url, { timeout: 20_000, waitUntil: 'domcontentloaded' });

    let count = 0;
    let firstElementInfo = null;

    // 計算符合元素數量（可能是無效 selector，要 catch）
    try {
      count = await page.locator(selector).count();
    } catch {
      // 無效 selector → count = 0
    }

    if (count > 0) {
      // 高亮所有命中元素（紅框 + 滾動到第一個）
      await page.evaluate((sel) => {
        try {
          const els = document.querySelectorAll(sel);
          els.forEach((el) => {
            el.style.outline        = '3px solid #ef4444';
            el.style.outlineOffset  = '2px';
            el.style.backgroundColor = 'rgba(239,68,68,0.12)';
          });
          if (els[0]) els[0].scrollIntoView({ block: 'center', behavior: 'instant' });
        } catch {}
      }, selector).catch(() => {});

      await page.waitForTimeout(300); // 等高亮 render

      // 取得第一個元素的屬性（供使用者確認是否正確）
      firstElementInfo = await page.locator(selector).first().evaluate((el) => ({
        tagName:     el.tagName.toLowerCase(),
        type:        el.getAttribute('type')        || '',
        name:        el.getAttribute('name')        || '',
        id:          el.getAttribute('id')          || '',
        placeholder: el.getAttribute('placeholder') || '',
        text:        (el.textContent || '').trim().slice(0, 80),
      })).catch(() => null);
    }

    // 截圖（JPEG 75 品質，減少 payload）
    const buf = await page.screenshot({ type: 'jpeg', quality: 75 });

    res.json({
      count,
      screenshot:       buf.toString('base64'),
      firstElementInfo,
      finalUrl:         page.url(),
    });
  } catch (err) {
    res.json({ count: 0, error: err.message, screenshot: null });
  } finally {
    await browser.close().catch(() => {});
  }
});

// GET /api/crm/connections/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM crm_connections WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: '連線不存在' });
    res.json(sanitizeConnection(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/crm/connections - 新增 CRM 連線（管理員）
router.post('/', requirePermission('crm_connections'), async (req, res) => {
  const { name, type = 'rpa_web', url, config = {} } = req.body;
  if (!name) return res.status(400).json({ error: '請輸入連線名稱' });

  try {
    const result = await pool.query(
      `INSERT INTO crm_connections (name, type, url, config, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, type, url || null, JSON.stringify(config), req.user.id]
    );
    logAction(req.user.id, 'crm.connection.create', 'crm_connection', result.rows[0].id, { name, type }, getIp(req));
    res.status(201).json(sanitizeConnection(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// PUT /api/crm/connections/:id - 更新 CRM 連線
router.put('/:id', requirePermission('crm_connections'), async (req, res) => {
  const { name, type, url, config, is_active } = req.body;

  try {
    const current = await pool.query('SELECT * FROM crm_connections WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: '連線不存在' });

    // 密碼欄位若為空字串則保留舊值
    const newConfig = mergeConfig(current.rows[0].config, config || {});

    const result = await pool.query(
      `UPDATE crm_connections
       SET name=$1, type=$2, url=$3, config=$4, is_active=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [name, type, url || null, JSON.stringify(newConfig), is_active !== false, req.params.id]
    );
    logAction(req.user.id, 'crm.connection.update', 'crm_connection', req.params.id, { name }, getIp(req));
    res.json(sanitizeConnection(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// DELETE /api/crm/connections/:id
router.delete('/:id', requirePermission('crm_connections'), async (req, res) => {
  try {
    await pool.query('UPDATE crm_connections SET is_active=false WHERE id=$1', [req.params.id]);
    logAction(req.user.id, 'crm.connection.delete', 'crm_connection', req.params.id, {}, getIp(req));
    res.json({ message: '已停用' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /api/crm/connections/:id/test - 測試連線
router.post('/:id/test', requirePermission('crm_connections'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM crm_connections WHERE id=$1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: '連線不存在' });

    const conn = result.rows[0];
    if (!conn.url) return res.status(400).json({ error: '未設定 CRM URL' });

    // 用 Playwright 測試是否能開啟該 URL
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    let accessible = false;
    let pageTitle = '';
    try {
      await page.goto(conn.url, { timeout: 15000, waitUntil: 'domcontentloaded' });
      accessible = true;
      pageTitle = await page.title();
    } finally {
      await browser.close();
    }

    res.json({ accessible, pageTitle, url: conn.url });
  } catch (err) {
    res.json({ accessible: false, error: err.message });
  }
});

// ────────────────────────────────────────────
function sanitizeConnection(row) {
  if (!row) return row;
  const config = { ...(row.config || {}) };
  // 隱藏密碼欄位
  if (config.loginPassword) config.loginPassword = '••••••••';
  return { ...row, config };
}

function mergeConfig(oldConfig, newConfig) {
  const merged = { ...(oldConfig || {}), ...newConfig };
  // 若密碼欄位是遮罩值，保留舊密碼
  if (newConfig.loginPassword === '••••••••') {
    merged.loginPassword = oldConfig?.loginPassword || '';
  }
  return merged;
}

module.exports = router;
