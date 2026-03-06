/**
 * 名片掃描通訊錄 API
 * M-11: Business Card Scanner & Contact Book
 */
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const pool    = require('../models/db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { logAction, getIp } = require('../middleware/audit');
const aiService = require('../services/aiService');

const router = express.Router();

// ─── Multer 設定 ──────────────────────────────────────────────────────────────
const CARD_DIR = path.join(__dirname, '../../../uploads/cards');
if (!fs.existsSync(CARD_DIR)) fs.mkdirSync(CARD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// PDF 批次上傳 multer
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 }, // 60MB
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

// 所有路由需登入 + contacts_manage 權限
router.use(authenticateToken, requirePermission('contacts_manage'));

// ═══════════════════════════════════════════════════════════════════════════════
//  分類 CRUD
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/categories', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM contact_categories WHERE is_active=true ORDER BY sort_order, created_at'
    );
    res.json(rows);
  } catch (err) {
    console.error('[contacts/categories GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/categories', async (req, res) => {
  const { name, color, icon } = req.body;
  if (!name) return res.status(400).json({ error: '名稱必填' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO contact_categories (name, color, icon, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, color || '#6b7280', icon || 'tag', req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[contacts/categories POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/categories/:id', async (req, res) => {
  const { name, color, icon, sort_order } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE contact_categories
       SET name=COALESCE($1,name), color=COALESCE($2,color), icon=COALESCE($3,icon),
           sort_order=COALESCE($4,sort_order), updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [name, color, icon, sort_order, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: '找不到分類' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE contact_categories SET is_active=false, updated_at=NOW() WHERE id=$1',
      [req.params.id]
    );
    res.json({ message: '已刪除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  名片掃描
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/scan', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '請上傳名片圖片' });

  try {
    const base64   = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    const result = await aiService.parseBusinessCard(base64, mimeType);
    if (!result) return res.status(500).json({ error: 'AI 名片辨識失敗，請確認圖片清晰度' });

    // 儲存圖片到磁碟
    const ext      = path.extname(req.file.originalname || '.jpg').toLowerCase() || '.jpg';
    const filename = `card_${uuidv4()}${ext}`;
    fs.writeFileSync(path.join(CARD_DIR, filename), req.file.buffer);

    res.json({
      parsed: result.contact || result,
      suggested_category: result.suggested_category || '其他',
      confidence: result.confidence || 0,
      notes: result.notes || '',
      raw_result: result,
      image_url: `/uploads/cards/${filename}`,
    });
  } catch (err) {
    console.error('[contacts/scan]', err.message);
    res.status(500).json({ error: `名片解析失敗：${err.message}` });
  }
});

// ─── PDF 批次掃描 ─────────────────────────────────────────────────────────────
router.post('/scan-batch', uploadPdf.array('pdfs', 5), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '請上傳 PDF 檔案（最多 5 個，每個最大 60MB）' });
  }

  try {
    const allContacts = [];
    let totalPages = 0;

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      console.log(`[scan-batch] 處理第 ${i + 1}/${req.files.length} 個 PDF (${(file.size / 1024 / 1024).toFixed(1)}MB)...`);

      const result = await aiService.parseBusinessCardsBatch(file.buffer);
      if (result && result.contacts) {
        // 標記來源 PDF
        result.contacts.forEach(c => { c.source_pdf = file.originalname; });
        allContacts.push(...result.contacts);
        totalPages += result.total_pages_scanned || 0;
      }
    }

    res.json({
      contacts: allContacts,
      total_cards_found: allContacts.length,
      total_pages_scanned: totalPages,
      total_pdfs: req.files.length,
    });
  } catch (err) {
    console.error('[contacts/scan-batch]', err.message);
    const msg = err.message || '';
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({
        error: 'AI 配額已達上限，系統已嘗試自動重試但仍然超額。請等候 1-2 分鐘後再試。',
        retryable: true,
      });
    }
    res.status(500).json({ error: `批次掃描失敗：${msg}` });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  聯絡人 CRUD
// ═══════════════════════════════════════════════════════════════════════════════

// 列表（分頁 + 搜尋 + 篩選）
router.get('/', async (req, res) => {
  const { q = '', category_id, favorite, page = 1, limit = 50 } = req.query;
  const offset = (Math.max(1, +page) - 1) * +limit;

  try {
    const params = [];
    const conditions = ['c.is_active=true'];

    if (q.trim()) {
      params.push(`%${q}%`);
      const i = params.length;
      conditions.push(`(c.full_name ILIKE $${i} OR c.company ILIKE $${i} OR c.job_title ILIKE $${i} OR c.address ILIKE $${i})`);
    }
    if (category_id) {
      params.push(category_id);
      conditions.push(`c.category_id=$${params.length}`);
    }
    if (favorite === 'true') {
      conditions.push('c.is_favorite=true');
    }

    const where = conditions.join(' AND ');

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM contacts c WHERE ${where}`, params
    );

    params.push(+limit, offset);
    const { rows } = await pool.query(
      `SELECT c.*, cat.name as category_name, cat.color as category_color
       FROM contacts c
       LEFT JOIN contact_categories cat ON c.category_id=cat.id
       WHERE ${where}
       ORDER BY c.is_favorite DESC, c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ data: rows, total: +countRes.rows[0].count, page: +page, limit: +limit });
  } catch (err) {
    console.error('[contacts GET]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 統計
router.get('/stats', async (req, res) => {
  try {
    const [total, byCategory, byCrm] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM contacts WHERE is_active=true'),
      pool.query(
        `SELECT cat.name, cat.color, COUNT(*) as count
         FROM contacts c LEFT JOIN contact_categories cat ON c.category_id=cat.id
         WHERE c.is_active=true GROUP BY cat.name, cat.color ORDER BY count DESC`
      ),
      pool.query(
        `SELECT crm_sync_status, COUNT(*) as count
         FROM contacts WHERE is_active=true GROUP BY crm_sync_status`
      ),
    ]);
    res.json({
      total: +total.rows[0].count,
      by_category: byCategory.rows,
      by_crm_status: byCrm.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  vCard 匯出（Google / iPhone 聯絡人格式）
// ═══════════════════════════════════════════════════════════════════════════════

function escapeVCard(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function contactToVCard(c) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  const fn = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || '';
  lines.push(`FN:${escapeVCard(fn)}`);
  lines.push(`N:${escapeVCard(c.last_name || '')};${escapeVCard(c.first_name || '')};;;`);
  if (c.company || c.department) {
    lines.push(`ORG:${escapeVCard(c.company || '')}${c.department ? ';' + escapeVCard(c.department) : ''}`);
  }
  if (c.job_title) lines.push(`TITLE:${escapeVCard(c.job_title)}`);
  const emails = Array.isArray(c.emails) ? c.emails : [];
  emails.forEach(e => {
    if (e.value) lines.push(`EMAIL;TYPE=${(e.label || 'WORK').toUpperCase()}:${e.value}`);
  });
  const phones = Array.isArray(c.phones) ? c.phones : [];
  phones.forEach(p => {
    if (p.value) lines.push(`TEL;TYPE=${(p.label || 'WORK').toUpperCase()}:${p.value}`);
  });
  if (c.address) lines.push(`ADR;TYPE=WORK:;;${escapeVCard(c.address)};;;;`);
  if (c.website) lines.push(`URL:${c.website}`);
  if (c.notes) lines.push(`NOTE:${escapeVCard(c.notes)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

router.get('/export/vcard', async (req, res) => {
  try {
    const { id, ids } = req.query;
    let rows;
    if (ids) {
      const idArr = ids.split(',').filter(Boolean);
      const result = await pool.query('SELECT * FROM contacts WHERE id = ANY($1::uuid[]) AND is_active=true', [idArr]);
      rows = result.rows;
    } else if (id) {
      const result = await pool.query('SELECT * FROM contacts WHERE id=$1 AND is_active=true', [id]);
      rows = result.rows;
    } else {
      const result = await pool.query('SELECT * FROM contacts WHERE is_active=true ORDER BY created_at DESC');
      rows = result.rows;
    }
    if (rows.length === 0) return res.status(404).json({ error: '找不到聯絡人' });

    const vcf = rows.map(contactToVCard).join('\r\n');
    const filename = id ? `contact_${id.slice(0, 8)}.vcf` : `contacts_${Date.now()}.vcf`;
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(vcf);
  } catch (err) {
    console.error('[contacts/export/vcard]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 單筆
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, cat.name as category_name, cat.color as category_color
       FROM contacts c LEFT JOIN contact_categories cat ON c.category_id=cat.id
       WHERE c.id=$1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: '找不到聯絡人' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 重複偵測工具 ─────────────────────────────────────────────────────────────
async function findDuplicates(userId, { full_name, emails, phones }) {
  const conditions = [];
  const params = [userId];
  let idx = 2;

  // 1. 完全同名
  if (full_name) {
    conditions.push(`LOWER(full_name) = LOWER($${idx})`);
    params.push(full_name);
    idx++;
  }

  // 2. email 重複（JSONB 陣列中的 value 欄位比對）
  if (emails && emails.length > 0) {
    const emailVals = emails.map(e => (e.value || e).toLowerCase()).filter(Boolean);
    for (const ev of emailVals) {
      conditions.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(emails) AS e WHERE LOWER(e->>'value') = $${idx})`);
      params.push(ev);
      idx++;
    }
  }

  // 3. 電話重複（去除非數字再比對）
  if (phones && phones.length > 0) {
    const phoneVals = phones.map(p => (p.value || p).replace(/\D/g, '')).filter(v => v.length >= 6);
    for (const pv of phoneVals) {
      conditions.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(phones) AS p WHERE REGEXP_REPLACE(p->>'value', '\\D', '', 'g') = $${idx})`);
      params.push(pv);
      idx++;
    }
  }

  if (conditions.length === 0) return [];

  const sql = `
    SELECT id, full_name, company, job_title, emails, phones
    FROM contacts
    WHERE created_by = $1 AND is_active = true
      AND (${conditions.join(' OR ')})
    LIMIT 5
  `;
  const { rows } = await pool.query(sql, params);
  return rows;
}

// 批次重複檢查
router.post('/check-duplicates', async (req, res) => {
  try {
    const { contacts } = req.body; // [{ full_name, emails, phones }]
    if (!Array.isArray(contacts)) return res.status(400).json({ error: '需要 contacts 陣列' });

    const results = [];
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      const dups = await findDuplicates(req.user.id, {
        full_name: c.full_name,
        emails: c.emails || [],
        phones: c.phones || [],
      });
      if (dups.length > 0) {
        results.push({ index: i, contact: c, duplicates: dups });
      }
    }
    res.json({ duplicates: results, has_duplicates: results.length > 0 });
  } catch (err) {
    console.error('[check-duplicates]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 新增（支援 overwrite_id 覆蓋現有聯絡人）
router.post('/', async (req, res) => {
  const {
    full_name, first_name, last_name, company, job_title, department,
    emails, phones, address, website, social_profiles,
    category_id, tags, source_type, source_image_url,
    ai_raw_result, ai_confidence, ai_suggested_category, notes,
    overwrite_id,
  } = req.body;

  if (!full_name && !company) {
    return res.status(400).json({ error: '姓名或公司名稱至少填一個' });
  }

  try {
    // 若指定 overwrite_id，更新既有聯絡人
    if (overwrite_id) {
      const { rows } = await pool.query(
        `UPDATE contacts SET
          full_name=$1, first_name=$2, last_name=$3, company=$4,
          job_title=$5, department=$6, emails=$7, phones=$8,
          address=$9, website=$10, social_profiles=$11,
          category_id=$12, tags=$13, source_type=$14,
          ai_confidence=$15, ai_suggested_category=$16,
          notes=$17, updated_at=NOW()
         WHERE id=$18 AND created_by=$19 AND is_active=true RETURNING *`,
        [
          full_name || null, first_name || null, last_name || null,
          company || null, job_title || null, department || null,
          JSON.stringify(emails || []), JSON.stringify(phones || []),
          address || null, website || null, JSON.stringify(social_profiles || {}),
          category_id || null, tags || [], source_type || 'scan',
          ai_confidence || null, ai_suggested_category || null,
          notes || null, overwrite_id, req.user.id,
        ]
      );
      if (!rows[0]) return res.status(404).json({ error: '找不到要覆蓋的聯絡人' });
      await logAction(pool, req.user.id, 'update_contact', 'contact', rows[0].id, { full_name, action: 'overwrite' }, getIp(req));
      return res.json(rows[0]);
    }

    const { rows } = await pool.query(
      `INSERT INTO contacts (
        full_name, first_name, last_name, company, job_title, department,
        emails, phones, address, website, social_profiles,
        category_id, tags, source_type, source_image_url,
        ai_raw_result, ai_confidence, ai_suggested_category, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *`,
      [
        full_name || null, first_name || null, last_name || null,
        company || null, job_title || null, department || null,
        JSON.stringify(emails || []), JSON.stringify(phones || []),
        address || null, website || null, JSON.stringify(social_profiles || {}),
        category_id || null, tags || [], source_type || 'manual',
        source_image_url || null, ai_raw_result ? JSON.stringify(ai_raw_result) : null,
        ai_confidence || null, ai_suggested_category || null,
        notes || null, req.user.id,
      ]
    );

    await logAction(pool, req.user.id, 'create_contact', 'contact', rows[0].id, { full_name }, getIp(req));
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[contacts POST]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 更新
router.put('/:id', async (req, res) => {
  const {
    full_name, first_name, last_name, company, job_title, department,
    emails, phones, address, website, social_profiles,
    category_id, tags, notes,
  } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE contacts SET
        full_name=COALESCE($1, full_name), first_name=COALESCE($2, first_name),
        last_name=COALESCE($3, last_name), company=COALESCE($4, company),
        job_title=COALESCE($5, job_title), department=COALESCE($6, department),
        emails=COALESCE($7, emails), phones=COALESCE($8, phones),
        address=COALESCE($9, address), website=COALESCE($10, website),
        social_profiles=COALESCE($11, social_profiles),
        category_id=$12, tags=COALESCE($13, tags), notes=COALESCE($14, notes),
        updated_at=NOW()
       WHERE id=$15 AND is_active=true RETURNING *`,
      [
        full_name, first_name, last_name, company, job_title, department,
        emails ? JSON.stringify(emails) : null, phones ? JSON.stringify(phones) : null,
        address, website, social_profiles ? JSON.stringify(social_profiles) : null,
        category_id || null, tags, notes, req.params.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: '找不到聯絡人' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 刪除（軟刪除）
// 批次刪除
router.delete('/batch', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '請提供要刪除的聯絡人 ID' });
    }
    const result = await pool.query(
      'UPDATE contacts SET is_active=false, updated_at=NOW() WHERE id = ANY($1::uuid[])',
      [ids]
    );
    await logAction(pool, req.user.id, 'batch_delete_contacts', 'contact', null, { count: ids.length }, getIp(req));
    res.json({ message: `已刪除 ${result.rowCount} 筆聯絡人` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE contacts SET is_active=false, updated_at=NOW() WHERE id=$1',
      [req.params.id]
    );
    await logAction(pool, req.user.id, 'delete_contact', 'contact', req.params.id, {}, getIp(req));
    res.json({ message: '已刪除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 切換收藏
router.post('/:id/favorite', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE contacts SET is_favorite=NOT is_favorite, updated_at=NOW()
       WHERE id=$1 AND is_active=true RETURNING id, is_favorite`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: '找不到聯絡人' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CRM 同步
// ═══════════════════════════════════════════════════════════════════════════════

function flattenContactForCrm(contact) {
  const primaryEmail = (contact.emails || []).find(e => e.is_primary)?.value
    || (contact.emails || [])[0]?.value || '';
  const primaryPhone = (contact.phones || []).find(p => p.is_primary)?.value
    || (contact.phones || [])[0]?.value || '';
  return {
    full_name:  contact.full_name || '',
    first_name: contact.first_name || '',
    last_name:  contact.last_name || '',
    company:    contact.company || '',
    job_title:  contact.job_title || '',
    department: contact.department || '',
    email:      primaryEmail,
    phone:      primaryPhone,
    address:    contact.address || '',
    website:    contact.website || '',
    notes:      contact.notes || '',
  };
}

router.post('/:id/sync-crm', async (req, res) => {
  const { crm_connection_id } = req.body;
  if (!crm_connection_id) return res.status(400).json({ error: '請選擇 CRM 連線' });

  try {
    const contactRes = await pool.query(
      'SELECT * FROM contacts WHERE id=$1 AND is_active=true', [req.params.id]
    );
    if (!contactRes.rows[0]) return res.status(404).json({ error: '找不到聯絡人' });

    const contact  = contactRes.rows[0];
    const payload  = flattenContactForCrm(contact);

    const jobRes = await pool.query(
      `INSERT INTO crm_write_jobs (crm_connection_id, contact_id, payload_data, source_type)
       VALUES ($1, $2, $3, 'contact') RETURNING id`,
      [crm_connection_id, contact.id, JSON.stringify(payload)]
    );

    await pool.query(
      `UPDATE contacts SET crm_sync_status='pending', updated_at=NOW() WHERE id=$1`,
      [contact.id]
    );

    await logAction(pool, req.user.id, 'sync_contact_crm', 'contact', contact.id,
      { crm_connection_id, job_id: jobRes.rows[0].id }, getIp(req));

    res.json({ message: '已加入 CRM 同步佇列', job_id: jobRes.rows[0].id });
  } catch (err) {
    console.error('[contacts/sync-crm]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  CSV 匯出
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/export/csv', async (req, res) => {
  try {
    const { ids } = req.query;
    let queryText = `SELECT c.*, cat.name as category_name
       FROM contacts c LEFT JOIN contact_categories cat ON c.category_id=cat.id
       WHERE c.is_active=true`;
    const params = [];
    if (ids) {
      const idArr = ids.split(',').filter(Boolean);
      params.push(idArr);
      queryText += ` AND c.id = ANY($1::uuid[])`;
    }
    queryText += ` ORDER BY c.created_at DESC`;
    const { rows } = await pool.query(queryText, params);

    const header = '姓名,公司,職稱,Email,電話,地址,網站,分類,備註';
    const lines = rows.map(r => {
      const email = (r.emails || [])[0]?.value || '';
      const phone = (r.phones || [])[0]?.value || '';
      return [r.full_name, r.company, r.job_title, email, phone, r.address, r.website, r.category_name, r.notes]
        .map(v => `"${(v || '').replace(/"/g, '""')}"`)
        .join(',');
    });

    const csv = '\uFEFF' + [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=contacts_${Date.now()}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
