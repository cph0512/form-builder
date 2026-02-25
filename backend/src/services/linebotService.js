/**
 * LINE Messaging API 封裝服務
 * 若未設定 LINE_CHANNEL_ACCESS_TOKEN 則以 Mock 模式運行（僅 console.log）
 */
const line = require('@line/bot-sdk');
const crypto = require('crypto');

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;

const isMockMode = !CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET;
if (isMockMode) {
  console.warn('⚠️  LINE Bot: LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET 未設定，以 Mock 模式運行');
}

// LINE SDK client（只在有 token 時初始化）
let client = null;
if (!isMockMode) {
  client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: CHANNEL_ACCESS_TOKEN,
  });
}

/**
 * 驗證 LINE Webhook 簽名
 * @param {Buffer} rawBody - 原始 request body
 * @param {string} signature - X-Line-Signature header
 */
function verifySignature(rawBody, signature) {
  if (isMockMode) return true;
  const hash = crypto
    .createHmac('SHA256', CHANNEL_SECRET)
    .update(rawBody)
    .digest('base64');
  return hash === signature;
}

/**
 * 發送 Push Message 給個人或群組
 * @param {string} targetId - LINE user ID 或 group ID
 * @param {string|object} message - 文字或訊息物件
 */
async function sendPushMessage(targetId, message) {
  const msg = typeof message === 'string'
    ? { type: 'text', text: message }
    : message;

  if (isMockMode) {
    console.log(`[LINE Mock] Push to ${targetId}:`, msg.text || JSON.stringify(msg));
    return;
  }
  await client.pushMessage({ to: targetId, messages: [msg] });
}

/**
 * 回覆 Webhook 訊息
 * @param {string} replyToken
 * @param {string|object} message
 */
async function replyMessage(replyToken, message) {
  const msg = typeof message === 'string'
    ? { type: 'text', text: message }
    : message;

  if (isMockMode) {
    console.log(`[LINE Mock] Reply:`, msg.text || JSON.stringify(msg));
    return;
  }
  await client.replyMessage({ replyToken, messages: [msg] });
}

/**
 * 取得 LINE 用戶個人資料
 * @param {string} userId
 */
async function getUserProfile(userId) {
  if (isMockMode) {
    return { displayName: '測試用戶', pictureUrl: null, userId };
  }
  return await client.getProfile(userId);
}

/**
 * 取得群組成員資料
 * @param {string} groupId
 * @param {string} userId
 */
async function getGroupMemberProfile(groupId, userId) {
  if (isMockMode) {
    return { displayName: '測試用戶', pictureUrl: null, userId };
  }
  return await client.getGroupMemberProfile(groupId, userId);
}

/**
 * 取得 Bot 自己的 LINE userId（用於 @mention 偵測）
 * 結果快取，只呼叫 API 一次
 */
let _botUserId = null;
async function getBotUserId() {
  if (_botUserId) return _botUserId;
  if (isMockMode) {
    _botUserId = 'U_MOCK_BOT_ID';
    return _botUserId;
  }
  try {
    const info = await client.getBotInfo();
    _botUserId = info.userId;
    return _botUserId;
  } catch (err) {
    console.error('[LineBot] 無法取得 Bot userId:', err.message);
    return null;
  }
}

module.exports = { verifySignature, sendPushMessage, replyMessage, getUserProfile, getGroupMemberProfile, getBotUserId };
