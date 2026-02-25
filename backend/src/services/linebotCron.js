/**
 * LINE Bot 提醒排程
 * 每小時整點掃描到期提醒，透過 LINE Push Message 發送
 */
const cron = require('node-cron');
const pool = require('../models/db');
const { sendPushMessage } = require('./linebotService');

let task = null;

async function checkAndSendReminders() {
  try {
    // 查詢所有到期且未發送的提醒
    const { rows: reminders } = await pool.query(
      `SELECT * FROM linebot_reminders
       WHERE trigger_at <= NOW() AND is_sent = false
       ORDER BY trigger_at ASC
       LIMIT 50`
    );

    if (reminders.length === 0) return;
    console.log(`[LineBotCron] 發現 ${reminders.length} 筆到期提醒`);

    for (const reminder of reminders) {
      if (!reminder.target_id) {
        // 沒有 target，標記已處理（跳過）
        await pool.query('UPDATE linebot_reminders SET is_sent=true, sent_at=NOW() WHERE id=$1', [reminder.id]);
        continue;
      }

      try {
        // 個人化訊息：替換 {{label}} 變數
        const message = (reminder.message_template || '')
          .replace(/\{\{客戶姓名\}\}/g, reminder.label || '')
          .replace(/\{\{提醒類型\}\}/g, getLabelForType(reminder.type));

        await sendPushMessage(reminder.target_id, message);

        // 標記已發送
        await pool.query(
          'UPDATE linebot_reminders SET is_sent=true, sent_at=NOW() WHERE id=$1',
          [reminder.id]
        );

        // 若有重複週期，建立下一次
        if (reminder.repeat_type && reminder.repeat_type !== 'once') {
          const nextTriggerAt = calcNextTrigger(reminder.trigger_at, reminder.repeat_type);
          if (nextTriggerAt) {
            await pool.query(
              `INSERT INTO linebot_reminders
               (platform_user_id, type, label, target_id, trigger_at, repeat_type, message_template)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [reminder.platform_user_id, reminder.type, reminder.label,
               reminder.target_id, nextTriggerAt, reminder.repeat_type, reminder.message_template]
            );
          }
        }
      } catch (err) {
        console.error(`[LineBotCron] 提醒 ${reminder.id} 發送失敗:`, err.message);
      }
    }
  } catch (err) {
    console.error('[LineBotCron] 執行錯誤:', err);
  }
}

function getLabelForType(type) {
  const map = {
    birthday: '生日提醒',
    test_drive: '試駕提醒',
    follow_up: '跟進提醒',
    contract: '合約到期提醒',
    custom: '自訂提醒',
  };
  return map[type] || type;
}

function calcNextTrigger(lastTrigger, repeatType) {
  const d = new Date(lastTrigger);
  switch (repeatType) {
    case 'weekly':  d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break;
    default: return null;
  }
  return d;
}

function start() {
  // 每小時整點執行（'0 * * * *'）
  task = cron.schedule('0 * * * *', checkAndSendReminders, { timezone: 'Asia/Taipei' });
  console.log('✅ LineBotCron 已啟動（每小時整點掃描提醒）');
}

function stop() {
  if (task) { task.stop(); task = null; }
}

module.exports = { start, stop, checkAndSendReminders };
