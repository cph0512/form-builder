/**
 * 通用 REST API Writer
 *
 * 將表單資料組成 JSON Payload，以指定的 HTTP 方法傳送至 CRM API。
 *
 * config 欄位（對應 crm_connections.config）：
 *   method             — POST / PUT / PATCH（預設 POST）
 *   apiKey             — API 金鑰或 Bearer Token（完整值，例如 "Bearer abc123"）
 *   authHeader         — 認證 Header 名稱（預設 Authorization）
 *   additionalHeaders  — 額外 Headers（JSON 字串，例如 {"X-Tenant": "acme"}）
 *
 * mappings[].crmFieldName — JSON Payload 的 key 名稱
 */

const axios = require('axios');

async function writeGenericApi(job, mappings) {
  const config         = job.crm_config      || {};
  const submissionData = job.submission_data  || {};

  const url = job.crm_url;
  if (!url) throw new Error('通用 API 設定缺少 URL');

  const {
    method            = 'POST',
    apiKey            = '',
    authHeader        = 'Authorization',
    additionalHeaders = '',
  } = config;

  /* ── 建立請求 Headers ── */
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers[authHeader] = apiKey;

  if (additionalHeaders) {
    try {
      const extra = JSON.parse(additionalHeaders);
      if (typeof extra === 'object' && extra !== null) {
        Object.assign(headers, extra);
      }
    } catch {
      console.warn('[GenericAPI] additionalHeaders 格式無效，已略過');
    }
  }

  /* ── 建立 Payload ── */
  const payload = {};
  let mappedCount = 0;

  for (const mapping of mappings) {
    if (!mapping.crmFieldName) continue;
    const value = submissionData[mapping.formFieldLabel];
    if (value !== undefined && value !== null && value !== '') {
      payload[mapping.crmFieldName] = Array.isArray(value) ? value.join('; ') : value;
      mappedCount++;
    }
  }

  if (mappedCount === 0) throw new Error('沒有可傳送的欄位（請確認欄位對應設定）');

  console.log(`[GenericAPI] ${method.toUpperCase()} ${url}，欄位數：${mappedCount}`);

  /* ── 送出請求 ── */
  try {
    const response = await axios({
      method:  method.toLowerCase(),
      url,
      data:    payload,
      headers,
      timeout: 15_000,
    });

    console.log(`[GenericAPI] ✅ 回應 ${response.status}`);
    return { responseStatus: response.status, screenshotPath: null };

  } catch (err) {
    const status  = err.response?.status;
    const detail  = err.response?.data
      ? JSON.stringify(err.response.data).slice(0, 200)
      : err.message;
    throw new Error(`API 請求失敗（HTTP ${status || 'N/A'}）：${detail}`);
  }
}

module.exports = { writeGenericApi };
