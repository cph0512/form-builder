const pool = require('../models/db');

/**
 * 記錄稽核日誌（非同步，不阻塞請求）
 */
const logAction = (userId, action, entityType, entityId, details, ipAddress) => {
  pool.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, action, entityType || null, entityId || null, JSON.stringify(details || {}), ipAddress || null]
  ).catch(err => console.error('[Audit]', err.message));
};

/**
 * 取得客戶端 IP
 */
const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || null;

module.exports = { logAction, getIp };
