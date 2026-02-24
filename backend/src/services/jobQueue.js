/**
 * CRM 寫入任務佇列
 *
 * 使用「資料庫輪詢 + FOR UPDATE SKIP LOCKED」模式：
 *   - 每 POLL_INTERVAL 秒掃一次 pending jobs
 *   - 用 SELECT ... FOR UPDATE SKIP LOCKED 確保多進程/重啟不重複執行
 *   - enqueueJob(id) 可即時觸發一次補充輪詢
 */

const pool = require('../models/db');
const { processJob } = require('./crmProcessor');

const POLL_INTERVAL_MS = 5000;   // 每 5 秒輪詢
const MAX_CONCURRENT   = 3;      // 最多同時執行 3 個 job

const activeJobs = new Set();    // 目前記憶體中執行中的 job id
let pollTimer = null;

/* ── 主輪詢函式 ── */
async function poll() {
  const slots = MAX_CONCURRENT - activeJobs.size;
  if (slots <= 0) return;

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('[JobQueue] DB 連線失敗，跳過此次輪詢:', err.message);
    return;
  }
  let jobIds = [];

  try {
    await client.query('BEGIN');

    // 鎖定並更新狀態為 running（SKIP LOCKED 讓多進程安全）
    const result = await client.query(
      `SELECT id FROM crm_write_jobs
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [slots]
    );

    if (result.rows.length > 0) {
      jobIds = result.rows.map(r => r.id);
      await client.query(
        `UPDATE crm_write_jobs
         SET status = 'running', started_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        [jobIds]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[JobQueue] poll error:', err.message);
  } finally {
    client.release();
  }

  /* 在 DB 事務之外啟動各 job（避免長時間持有鎖） */
  for (const id of jobIds) {
    activeJobs.add(id);
    processJob(id)
      .finally(() => activeJobs.delete(id));
  }
}

/* ── 對外：立即觸發一次輪詢（用於新 job 入隊或手動重試） ── */
function enqueueJob(jobId) {
  // jobId 參數目前僅作 log 用途，實際由 DB 輪詢決定執行順序
  if (jobId) console.log(`[JobQueue] 收到新 job：${jobId}`);
  setImmediate(poll);
}

/* ── 啟動 / 停止佇列 ── */
function start() {
  console.log('[JobQueue] ✅ CRM 任務佇列啟動（輪詢間隔 ' + POLL_INTERVAL_MS / 1000 + 's）');
  poll(); // 啟動時立即跑一次（處理上次重啟前殘留的 pending jobs）
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

function stop() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

module.exports = { start, stop, enqueueJob };
