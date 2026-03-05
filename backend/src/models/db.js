const { Pool } = require('pg');

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'form_builder',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool({
  ...poolConfig,
  max: 5,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
});

pool.on('connect', () => {
  console.log('✅ 資料庫連線成功');
});

pool.on('error', (err) => {
  console.error('❌ 資料庫連線錯誤:', err.message);
});

// 帶重試的 query wrapper — 連線斷開時自動重試一次
const originalQuery = pool.query.bind(pool);
pool.query = async function (...args) {
  try {
    return await originalQuery(...args);
  } catch (err) {
    if (
      err.message?.includes('terminated') ||
      err.message?.includes('Connection terminated') ||
      err.code === 'ECONNRESET' ||
      err.code === '57P01'
    ) {
      console.warn('⚠️ DB 連線中斷，重試中...');
      return await originalQuery(...args);
    }
    throw err;
  }
};

module.exports = pool;
