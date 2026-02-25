/**
 * M-08 LINE Bot 路由
 * - POST /webhook：LINE Webhook（raw body，signature 驗證）
 * - 綁定管理、對話記錄、提醒、範本、群發
 */
const express = require('express');
const crypto = require('crypto');
const pool = require('../models/db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const linebot = require('../services/linebotService');

const router = express.Router();

// ─── 工具函式 ────────────────────────────────────────────────────

/** 取得或建立今日的對話 session */
async function getOrCreateConversation(sourceType, sourceId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { rows } = await pool.query(
    `SELECT * FROM linebot_conversations
     WHERE source_type=$1 AND source_id=$2
       AND created_at >= $3 AND created_at < $4
     ORDER BY created_at DESC LIMIT 1`,
    [sourceType, sourceId, today, tomorrow]
  );
  if (rows[0]) return rows[0];

  const { rows: created } = await pool.query(
    `INSERT INTO linebot_conversations (source_type, source_id) VALUES ($1, $2) RETURNING *`,
    [sourceType, sourceId]
  );
  return created[0];
}

/** 產生 6 位數字+大寫字母的綁定碼 */
function generateBindingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Webhook（無 JWT，LINE signature 驗證）──────────────────────

router.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const signature = req.headers['x-line-signature'];
  const rawBody = req.body;

  if (!linebot.verifySignature(rawBody, signature)) {
    return res.status(403).json({ error: 'Invalid signature' });
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // 非同步處理 events（LINE 要求 200 快速回應）
  res.status(200).end();

  for (const event of (parsed.events || [])) {
    try {
      await handleEvent(event);
    } catch (err) {
      console.error('[LineBot] Event 處理錯誤:', err.message);
    }
  }
});

async function handleEvent(event) {
  const sourceType = event.source?.type === 'group' ? 'group' : 'user';
  const sourceId   = sourceType === 'group' ? event.source.groupId : event.source.userId;
  const senderId   = event.source.userId; // 傳訊者（群組中也有）

  // ── join 事件（Bot 被加入群組）
  if (event.type === 'join') {
    await linebot.replyMessage(event.replyToken,
      '👋 大家好！我是智慧表單小助理。\n\n' +
      '可用指令：\n' +
      '📌 /綁定 [碼] — 綁定個人帳號\n' +
      '📝 /記錄 — 彙整今日對話並準備上傳 CRM\n' +
      '❓ /說明 — 查看所有指令'
    );
    return;
  }

  // ── follow 事件（個人加好友）
  if (event.type === 'follow') {
    await linebot.replyMessage(event.replyToken,
      '👋 您好！感謝加入智慧表單平台。\n\n' +
      '請在後台管理系統生成綁定碼後，傳送：\n' +
      '📌 /綁定 [碼]\n\n' +
      '例如：/綁定 AB1234'
    );
    return;
  }

  // ── message 事件
  if (event.type === 'message' && event.message?.type === 'text') {
    const text = event.message.text.trim();

    // /說明
    if (text === '/說明' || text === '/help') {
      await linebot.replyMessage(event.replyToken,
        '📋 可用指令：\n\n' +
        '📌 /綁定 [碼] — 綁定帳號\n' +
        '📝 /記錄 — 彙整今日對話準備上傳 CRM\n' +
        '❓ /說明 — 顯示此說明'
      );
      return;
    }

    // /綁定 [code]
    const bindMatch = text.match(/^\/綁定\s+([A-Z0-9]{4,10})$/i);
    if (bindMatch) {
      const code = bindMatch[1].toUpperCase();
      const { rows: codeRows } = await pool.query(
        `SELECT * FROM linebot_binding_codes
         WHERE code=$1 AND used_at IS NULL AND expires_at > NOW()`,
        [code]
      );
      if (!codeRows[0]) {
        await linebot.replyMessage(event.replyToken, '❌ 綁定碼無效或已過期，請重新在後台生成。');
        return;
      }
      const bindCode = codeRows[0];

      // 取得 LINE 用戶名稱
      let displayName = '未知用戶';
      let pictureUrl = null;
      try {
        const profile = await linebot.getUserProfile(senderId);
        displayName = profile.displayName;
        pictureUrl = profile.pictureUrl || null;
      } catch {}

      // 寫入綁定（upsert）
      await pool.query(
        `INSERT INTO linebot_bindings (platform_user_id, line_user_id, line_display_name, line_picture_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (platform_user_id) DO UPDATE
           SET line_user_id=$2, line_display_name=$3, line_picture_url=$4, is_active=true`,
        [bindCode.platform_user_id, senderId, displayName, pictureUrl]
      );
      // 標記綁定碼已使用
      await pool.query('UPDATE linebot_binding_codes SET used_at=NOW() WHERE id=$1', [bindCode.id]);

      await linebot.replyMessage(event.replyToken, `✅ 綁定成功！${displayName} 已與平台帳號連結。`);
      return;
    }

    // /記錄 — 彙整今日對話，標記為待上傳
    if (text === '/記錄') {
      // 找出今日 session
      const conv = await getOrCreateConversation(sourceType, sourceId);

      // 找傳訊者的平台 user（若已綁定）
      const { rows: bindRows } = await pool.query(
        'SELECT platform_user_id FROM linebot_bindings WHERE line_user_id=$1 AND is_active=true',
        [senderId]
      );
      const platformUserId = bindRows[0]?.platform_user_id || null;

      await pool.query(
        `UPDATE linebot_conversations
         SET crm_status='pending', platform_user_id=$1, updated_at=NOW()
         WHERE id=$2`,
        [platformUserId, conv.id]
      );

      const msgCount = Array.isArray(conv.messages) ? conv.messages.length : 0;
      await linebot.replyMessage(event.replyToken,
        `📝 已記錄今日對話（${msgCount} 則訊息），請到後台管理系統確認後上傳 CRM。`
      );
      return;
    }

    // 一般訊息 → 儲存到今日 session
    const conv = await getOrCreateConversation(sourceType, sourceId);
    const newMsg = {
      sender: senderId,
      text,
      time: new Date().toISOString(),
    };
    await pool.query(
      `UPDATE linebot_conversations
       SET messages = messages || $1::jsonb, updated_at=NOW()
       WHERE id=$2`,
      [JSON.stringify([newMsg]), conv.id]
    );
  }
}

// ─── 統計 ────────────────────────────────────────────────────────

router.get('/stats', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  try {
    const [bindings, conversations, reminders, broadcasts] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM linebot_bindings WHERE is_active=true'),
      pool.query("SELECT COUNT(*) FROM linebot_conversations WHERE crm_status='pending'"),
      pool.query('SELECT COUNT(*) FROM linebot_reminders WHERE is_sent=false'),
      pool.query("SELECT COUNT(*) FROM linebot_broadcasts WHERE status='pending' OR status='sending'"),
    ]);
    res.json({
      activeBindings:    parseInt(bindings.rows[0].count),
      pendingConvs:      parseInt(conversations.rows[0].count),
      pendingReminders:  parseInt(reminders.rows[0].count),
      activebroadcasts:  parseInt(broadcasts.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// ─── 綁定管理 ─────────────────────────────────────────────────────

router.get('/bindings', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, u.name as user_name, u.email, u.role
       FROM linebot_bindings b
       JOIN users u ON b.platform_user_id = u.id
       ORDER BY b.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.post('/bindings/generate-code', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  const { platform_user_id } = req.body;
  if (!platform_user_id) return res.status(400).json({ error: '請提供 platform_user_id' });

  try {
    // 產生唯一碼（重試避免衝突）
    let code, tries = 0;
    while (tries++ < 10) {
      code = generateBindingCode();
      const { rows } = await pool.query(
        'SELECT id FROM linebot_binding_codes WHERE code=$1', [code]);
      if (rows.length === 0) break;
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 小時後到期
    const { rows } = await pool.query(
      `INSERT INTO linebot_binding_codes (platform_user_id, code, expires_at, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [platform_user_id, code, expiresAt, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.delete('/bindings/:userId', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE linebot_bindings SET is_active=false WHERE platform_user_id=$1',
      [req.params.userId]
    );
    res.json({ message: '已解除綁定' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// ─── 對話記錄 ─────────────────────────────────────────────────────

router.get('/conversations', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
              u.name as user_name,
              jsonb_array_length(c.messages) as message_count
       FROM linebot_conversations c
       LEFT JOIN users u ON c.platform_user_id = u.id
       ORDER BY c.updated_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.get('/conversations/:id', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.name as user_name
       FROM linebot_conversations c
       LEFT JOIN users u ON c.platform_user_id = u.id
       WHERE c.id=$1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: '找不到對話記錄' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.post('/conversations/:id/upload-crm', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM linebot_conversations WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '找不到對話記錄' });

    // TODO: 整合 CRM 寫入引擎（jobQueue）
    // 目前先標記為已上傳
    await pool.query(
      'UPDATE linebot_conversations SET crm_status=$1, updated_at=NOW() WHERE id=$2',
      ['uploaded', req.params.id]
    );
    res.json({ message: '已標記為已上傳 CRM' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// ─── 提醒排程 ─────────────────────────────────────────────────────

router.get('/reminders', authenticateToken, async (req, res) => {
  try {
    const isMgr = ['super_admin', 'dept_admin'].includes(req.user.role);
    const { rows } = isMgr
      ? await pool.query(`SELECT r.*, u.name as user_name FROM linebot_reminders r JOIN users u ON r.platform_user_id=u.id ORDER BY r.trigger_at DESC`)
      : await pool.query(`SELECT * FROM linebot_reminders WHERE platform_user_id=$1 ORDER BY trigger_at DESC`, [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.post('/reminders', authenticateToken, async (req, res) => {
  const { type, label, target_id, trigger_at, repeat_type = 'once', message_template } = req.body;
  if (!type || !trigger_at || !message_template) {
    return res.status(400).json({ error: '請填寫必要欄位' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO linebot_reminders (platform_user_id, type, label, target_id, trigger_at, repeat_type, message_template)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, type, label || null, target_id || null, trigger_at, repeat_type, message_template]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.put('/reminders/:id', authenticateToken, async (req, res) => {
  const { label, target_id, trigger_at, repeat_type, message_template } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE linebot_reminders SET label=$1, target_id=$2, trigger_at=$3, repeat_type=$4, message_template=$5
       WHERE id=$6 AND platform_user_id=$7 RETURNING *`,
      [label, target_id, trigger_at, repeat_type, message_template, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: '找不到提醒或無權限修改' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.delete('/reminders/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM linebot_reminders WHERE id=$1 AND platform_user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: '已刪除' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// ─── 訊息範本 ─────────────────────────────────────────────────────

router.get('/templates', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM linebot_templates ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.post('/templates', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  const { name, content, variables = [] } = req.body;
  if (!name || !content) return res.status(400).json({ error: '請填寫名稱和內容' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO linebot_templates (name, content, variables, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, content, JSON.stringify(variables), req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.put('/templates/:id', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  const { name, content, variables } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE linebot_templates SET name=$1, content=$2, variables=$3 WHERE id=$4 RETURNING *`,
      [name, content, JSON.stringify(variables || []), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: '找不到範本' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.delete('/templates/:id', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  try {
    await pool.query('DELETE FROM linebot_templates WHERE id=$1', [req.params.id]);
    res.json({ message: '已刪除' });
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

// ─── 群發管理 ─────────────────────────────────────────────────────

router.get('/broadcasts', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, u.name as creator_name
       FROM linebot_broadcasts b
       JOIN users u ON b.created_by = u.id
       ORDER BY b.created_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

router.post('/broadcasts', authenticateToken, requirePermission('linebot_manage'), async (req, res) => {
  const { message_content, target_line_ids = [] } = req.body;
  if (!message_content) return res.status(400).json({ error: '請填寫訊息內容' });
  if (target_line_ids.length === 0) return res.status(400).json({ error: '請選擇至少一位接收者' });

  try {
    // 建立群發記錄
    const { rows } = await pool.query(
      `INSERT INTO linebot_broadcasts (created_by, message_content, target_line_ids, total_count, status)
       VALUES ($1, $2, $3, $4, 'sending') RETURNING *`,
      [req.user.id, message_content, JSON.stringify(target_line_ids), target_line_ids.length]
    );
    const broadcast = rows[0];

    // 非同步發送（不阻塞回應）
    sendBroadcastAsync(broadcast.id, message_content, target_line_ids);

    res.status(201).json(broadcast);
  } catch (err) {
    res.status(500).json({ error: '伺服器錯誤' });
  }
});

async function sendBroadcastAsync(broadcastId, message, targetIds) {
  await pool.query('UPDATE linebot_broadcasts SET started_at=NOW() WHERE id=$1', [broadcastId]);
  let sentCount = 0, failedCount = 0;

  for (const lineId of targetIds) {
    try {
      await linebot.sendPushMessage(lineId, message);
      await pool.query(
        'INSERT INTO linebot_broadcast_logs (broadcast_id, line_user_id, status) VALUES ($1, $2, $3)',
        [broadcastId, lineId, 'sent']
      );
      sentCount++;
    } catch (err) {
      await pool.query(
        'INSERT INTO linebot_broadcast_logs (broadcast_id, line_user_id, status, error_message) VALUES ($1, $2, $3, $4)',
        [broadcastId, lineId, 'failed', err.message]
      );
      failedCount++;
    }
    // 避免超出 LINE 速率限制（每秒最多 1 則）
    await new Promise(r => setTimeout(r, 200));
  }

  await pool.query(
    `UPDATE linebot_broadcasts
     SET status='done', sent_count=$1, failed_count=$2, completed_at=NOW()
     WHERE id=$3`,
    [sentCount, failedCount, broadcastId]
  );
}

module.exports = router;
