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
const aiService = require('../services/aiService');

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

    // /記錄 — 彙整今日對話，標記為待上傳 + AI 摘要
    if (text === '/記錄') {
      const conv = await getOrCreateConversation(sourceType, sourceId);

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
      let replyText = `📝 已記錄今日對話（${msgCount} 則訊息），請到後台管理系統確認後上傳 CRM。`;

      // AI 摘要（非同步，若失敗不影響主流程）
      try {
        const summary = await aiService.summarize(conv.messages || []);
        if (summary) {
          await pool.query(
            'UPDATE linebot_conversations SET ai_summary=$1 WHERE id=$2',
            [summary, conv.id]
          );
          replyText += `\n\n📋 AI 摘要：\n${summary}`;
        }
      } catch (err) {
        console.error('[LineBot] AI 摘要失敗:', err.message);
      }

      await linebot.replyMessage(event.replyToken, replyText);
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

    // ── AI 觸發檢測（@mention 或文字前綴）
    const AI_TRIGGER = process.env.AI_TRIGGER_PREFIX || '@助理';
    const mentionees = event.message.mention?.mentionees || [];
    const botUserId = await linebot.getBotUserId();

    let aiQuery = null;
    const botMention = mentionees.find(m => m.userId === botUserId);
    if (botMention) {
      // LINE @mention：移除 @Bot 部分，剩餘文字作為 query
      aiQuery = (text.slice(0, botMention.index) + text.slice(botMention.index + botMention.length)).trim();
    } else if (text.startsWith(AI_TRIGGER)) {
      // 文字前綴 @助理
      aiQuery = text.slice(AI_TRIGGER.length).trim();
    }

    if (aiQuery !== null) {
      await handleAIQuery(event, conv, aiQuery || '你好', senderId);
    }
  }
}

// ─── AI 查詢處理 ──────────────────────────────────────────────────────────────

async function handleAIQuery(event, conv, query, senderId) {
  // 查詢發訊者的 platform_user_id（tool call 授權用）
  const { rows: bindRows } = await pool.query(
    'SELECT platform_user_id FROM linebot_bindings WHERE line_user_id=$1 AND is_active=true',
    [senderId]
  );
  const platformUserId = bindRows[0]?.platform_user_id || null;

  // 建立對話歷史（今日最近 20 則訊息作為上下文）
  const history = (conv.messages || []).slice(-20).map(m => ({
    role: 'user',
    content: `[對話] ${m.text}`,
  }));
  // 加入本次問題
  history.push({ role: 'user', content: query });

  try {
    // 第一次呼叫 AI（可能回傳 tool call）
    const result = await aiService.chat(history, true, aiService.DEFAULT_SYSTEM_PROMPT);

    if (!result) {
      await linebot.replyMessage(event.replyToken, '⚠️ AI 助理尚未設定，請聯繫管理員。');
      return;
    }

    // 若 AI 要求呼叫工具
    if (result.toolCalls?.length > 0) {
      const tc = result.toolCalls[0]; // 一次處理一個 tool
      const toolResult = await executeTool(tc.name, tc.input, platformUserId);

      // 把工具結果回傳 AI 取得最終回覆
      const followUp = [
        ...history,
        { role: 'assistant', content: result.text || '' },
        { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResult) },
      ];
      const finalResult = await aiService.chat(followUp, false, aiService.DEFAULT_SYSTEM_PROMPT);
      await linebot.replyMessage(event.replyToken, finalResult?.text || '✅ 已處理完成');
      return;
    }

    // 一般文字回覆
    await linebot.replyMessage(event.replyToken, result.text || '抱歉，我無法回答這個問題。');

  } catch (err) {
    console.error('[LineBot] AI 查詢失敗:', err.message);
    await linebot.replyMessage(event.replyToken, '⚠️ AI 助理暫時無法使用，請稍後再試。');
  }
}

// ─── Tool 執行 ────────────────────────────────────────────────────────────────

async function executeTool(name, input, platformUserId) {
  if (name === 'search_form_submissions') {
    try {
      const limit = Math.min(input.limit || 5, 10);
      const { rows } = await pool.query(
        `SELECT fs.id, f.title as form_title, u.name as submitter_name,
                fs.data, fs.submitted_at, fs.crm_sync_status
         FROM form_submissions fs
         JOIN forms f ON fs.form_id = f.id
         LEFT JOIN users u ON fs.submitted_by = u.id
         WHERE fs.data::text ILIKE $1
         ORDER BY fs.submitted_at DESC
         LIMIT $2`,
        [`%${input.keyword}%`, limit]
      );
      if (rows.length === 0) return `找不到包含「${input.keyword}」的表單資料。`;
      return rows.map(r => ({
        form_title: r.form_title,
        submitter: r.submitter_name,
        submitted_at: r.submitted_at,
        data: r.data,
      }));
    } catch (err) {
      return `查詢失敗：${err.message}`;
    }
  }

  if (name === 'create_reminder') {
    if (!platformUserId) {
      return '請先綁定帳號才能設定提醒。請傳送 /綁定 [碼] 完成綁定。';
    }
    try {
      await pool.query(
        `INSERT INTO linebot_reminders
         (platform_user_id, type, label, trigger_at, repeat_type, message_template)
         VALUES ($1, 'custom', $2, $3, $4, $5)`,
        [
          platformUserId,
          input.label,
          input.trigger_at,
          input.repeat_type || 'once',
          input.message_template,
        ]
      );
      return `✅ 提醒已建立：${input.label}，時間：${input.trigger_at}`;
    } catch (err) {
      return `建立提醒失敗：${err.message}`;
    }
  }

  return `未知的工具：${name}`;
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

// ─── iCal 訂閱（公開，無需 JWT）────────────────────────────────────

router.get('/reminders/ical/:token', async (req, res) => {
  try {
    const { rows: userRows } = await pool.query(
      'SELECT id, name FROM users WHERE ical_token=$1',
      [req.params.token]
    );
    if (!userRows[0]) return res.status(404).send('Token 無效');
    const user = userRows[0];

    const { rows: reminders } = await pool.query(
      `SELECT * FROM linebot_reminders
       WHERE platform_user_id=$1
         AND trigger_at >= NOW() - INTERVAL '30 days'
       ORDER BY trigger_at ASC`,
      [user.id]
    );

    const ical = require('ical-generator');
    const cal = ical.default({
      name: `${user.name} 的業務提醒`,
      timezone: 'Asia/Taipei',
      prodId: { company: '智慧表單 CRM', product: 'LineBot Reminders' },
    });

    const TYPE_LABEL = {
      birthday:   '🎂 生日提醒',
      test_drive: '🚗 試駕提醒',
      follow_up:  '📞 跟進提醒',
      contract:   '📄 合約到期提醒',
      custom:     '📌 自訂提醒',
    };
    const REPEAT_FREQ = { weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };

    for (const r of reminders) {
      const start = new Date(r.trigger_at);
      const end   = new Date(start.getTime() + 30 * 60 * 1000);
      const eventData = {
        id:          r.id,
        start,
        end,
        summary:     `${TYPE_LABEL[r.type] || r.type}${r.label ? '：' + r.label : ''}`,
        description: r.message_template,
        timezone:    'Asia/Taipei',
      };
      if (r.repeat_type && r.repeat_type !== 'once' && REPEAT_FREQ[r.repeat_type]) {
        eventData.repeating = { freq: REPEAT_FREQ[r.repeat_type] };
      }
      cal.createEvent(eventData);
    }

    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'inline; filename="reminders.ics"');
    res.set('Cache-Control', 'no-cache, no-store');
    res.send(cal.toString());
  } catch (err) {
    console.error('[iCal]', err);
    res.status(500).send('伺服器錯誤');
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
