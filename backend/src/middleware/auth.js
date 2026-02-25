const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: '未提供認證 Token' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token 無效或已過期' });
    }
    req.user = user;
    next();
  });
};

// 角色權限中介軟體
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '權限不足' });
    }
    next();
  };
};

// 功能權限中介軟體（super_admin 永遠通過，或 JWT permissions 包含該功能）
const requirePermission = (feature) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未授權' });
    if (req.user.role === 'super_admin') return next();
    if ((req.user.permissions || []).includes(feature)) return next();
    return res.status(403).json({ error: '權限不足' });
  };
};

module.exports = { authenticateToken, requireRole, requirePermission };
