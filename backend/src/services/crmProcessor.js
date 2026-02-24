/**
 * CRM 寫入分派器
 *
 * 根據 crm_connections.type 決定呼叫哪個 writer：
 *   rpa_web        → rpaWorker
 *   salesforce_api → salesforceWriter
 *   generic_api    → genericApiWriter
 *
 * 成功：更新 job status = 'success'
 * 失敗：自動遞增 retry_count；超過 max_retries 則 status = 'failed'
 */

const pool = require('../models/db');
const { runRpa }          = require('./rpaWorker');
const { writeSalesforce } = require('./salesforceWriter');
const { writeGenericApi } = require('./genericApiWriter');

async function processJob(jobId) {
  console.log(`[CRM] 開始處理 job ${jobId}`);

  /* ── 1. 取得 job 完整資料 ── */
  let job;
  try {
    const jobResult = await pool.query(
      `SELECT
         j.*,
         c.type    AS crm_type,
         c.url     AS crm_url,
         c.config  AS crm_config,
         s.data    AS submission_data,
         s.form_id AS form_id
       FROM crm_write_jobs      j
       LEFT JOIN crm_connections   c ON j.crm_connection_id = c.id
       LEFT JOIN form_submissions  s ON j.submission_id     = s.id
       WHERE j.id = $1`,
      [jobId]
    );

    if (!jobResult.rows[0]) throw new Error('Job not found in DB');
    job = jobResult.rows[0];
  } catch (err) {
    console.error(`[CRM] job ${jobId} 取得資料失敗：`, err.message);
    return;
  }

  /* ── 2. 取得欄位對應 ── */
  let mappings = [];
  try {
    const mapResult = await pool.query(
      `SELECT mappings
       FROM crm_field_mappings
       WHERE form_id = $1 AND crm_connection_id = $2 AND is_active = true`,
      [job.form_id, job.crm_connection_id]
    );
    mappings = mapResult.rows[0]?.mappings || [];
  } catch (err) {
    console.warn(`[CRM] job ${jobId} 取得欄位對應失敗（將用空對應）：`, err.message);
  }

  /* ── 3. 根據類型執行 ── */
  try {
    let result;

    switch (job.crm_type) {
      case 'rpa_web':
        result = await runRpa(job, mappings);
        break;
      case 'salesforce_api':
        result = await writeSalesforce(job, mappings);
        break;
      case 'generic_api':
        result = await writeGenericApi(job, mappings);
        break;
      default:
        throw new Error(`不支援的 CRM 類型：${job.crm_type}`);
    }

    /* ── 4a. 成功 ── */
    await pool.query(
      `UPDATE crm_write_jobs
       SET status = 'success',
           completed_at = NOW(),
           screenshot_path = $2,
           error_message = NULL
       WHERE id = $1`,
      [jobId, result.screenshotPath || null]
    );

    // 更新 submission 同步狀態
    await pool.query(
      `UPDATE form_submissions SET crm_sync_status = 'synced' WHERE id = $1`,
      [job.submission_id]
    );

    console.log(`[CRM] ✅ job ${jobId} 完成（${job.crm_type}）`);

  } catch (err) {
    console.error(`[CRM] ❌ job ${jobId} 失敗：`, err.message);

    /* ── 4b. 失敗：判斷是否還有重試次數 ── */
    const current = await pool.query(
      'SELECT retry_count, max_retries FROM crm_write_jobs WHERE id = $1',
      [jobId]
    );
    const { retry_count = 0, max_retries = 3 } = current.rows[0] || {};
    const newRetryCount = retry_count + 1;
    const isFinal       = newRetryCount >= max_retries;

    await pool.query(
      `UPDATE crm_write_jobs
       SET status        = $2,
           retry_count   = $3,
           error_message = $4,
           started_at    = NULL,
           completed_at  = CASE WHEN $2 = 'failed' THEN NOW() ELSE NULL END
       WHERE id = $1`,
      [
        jobId,
        isFinal ? 'failed' : 'pending',
        newRetryCount,
        err.message,
      ]
    );

    if (isFinal) {
      // 更新 submission 同步狀態為失敗
      await pool.query(
        `UPDATE form_submissions SET crm_sync_status = 'error' WHERE id = $1`,
        [job.submission_id]
      );
      console.log(`[CRM] job ${jobId} 已達最大重試次數（${max_retries}），標記為 failed`);
    } else {
      console.log(`[CRM] job ${jobId} 將自動重試（第 ${newRetryCount}/${max_retries} 次）`);
    }
  }
}

module.exports = { processJob };
