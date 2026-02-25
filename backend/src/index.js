require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const formRoutes = require('./routes/forms');
const submissionRoutes = require('./routes/submissions');
const departmentRoutes = require('./routes/departments');
const uploadRoutes = require('./routes/uploads');
const voiceRoutes = require('./routes/voice');
const crmConnectionRoutes = require('./routes/crm-connections');
const crmMappingRoutes = require('./routes/crm-mappings');
const crmJobRoutes = require('./routes/crm-jobs');
const linebotRoutes = require('./routes/linebot');
const { authenticateToken } = require('./middleware/auth');
const jobQueue = require('./services/jobQueue');
const linebotCron = require('./services/linebotCron');

const app = express();
const PORT = process.env.PORT || 3001;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false,
  message: { error: '嘗試次數過多，請 15 分鐘後再試' },
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false,
  message: { error: '請求過於頻繁，請稍後再試' },
});

const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
// LINE Webhook 需要 raw body 做簽名驗證，必須在 express.json() 之前
app.use('/api/linebot/webhook', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '10mb' }));

// 靜態檔案（上傳圖片）
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
app.use('/uploads', express.static(UPLOAD_DIR));

// 靜態檔案（RPA 截圖）
const SCREENSHOT_DIR = path.join(__dirname, '../../screenshots');
const fs = require('fs');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
app.use('/screenshots', authenticateToken, express.static(SCREENSHOT_DIR));

app.use('/api/auth/login', loginLimiter);
app.use('/api/', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/forms', authenticateToken, formRoutes);
app.use('/api/submissions', authenticateToken, submissionRoutes);
app.use('/api/departments', authenticateToken, departmentRoutes);
app.use('/api/uploads', authenticateToken, uploadRoutes);
app.use('/api/voice', authenticateToken, voiceRoutes);
app.use('/api/crm/connections', authenticateToken, crmConnectionRoutes);
app.use('/api/crm/mappings', authenticateToken, crmMappingRoutes);
app.use('/api/crm/jobs', authenticateToken, crmJobRoutes);
app.use('/api/linebot', linebotRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '伺服器內部錯誤', message: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`✅ 後端 API 啟動於 http://localhost:${PORT}`);
  jobQueue.start();     // 啟動 CRM 任務佇列
  linebotCron.start();  // 啟動 LINE Bot 提醒排程
});

// Graceful shutdown
process.on('SIGTERM', () => { jobQueue.stop(); linebotCron.stop(); server.close(); });
process.on('SIGINT',  () => { jobQueue.stop(); linebotCron.stop(); server.close(); });
