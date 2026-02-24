/**
 * Salesforce REST API Writer
 *
 * 使用 OAuth 2.0 Username-Password Flow 取得 access_token，
 * 再以 REST API 建立 Salesforce 記錄（預設 Lead，可透過 sfObjectType 調整）。
 *
 * config 欄位（對應 crm_connections.config）：
 *   instanceUrl    — https://yourorg.my.salesforce.com
 *   clientId       — Connected App 的 Consumer Key
 *   clientSecret   — Connected App 的 Consumer Secret
 *   username       — Salesforce 帳號 email
 *   password       — Salesforce 密碼（不需附加 security token，由 securityToken 欄位處理）
 *   securityToken  — Security Token（可選，若 IP 未加入信任清單則必填）
 *   apiVersion     — API 版本，預設 v58.0
 *   sfObjectType   — Salesforce SObject 類型，預設 Lead
 *
 * mappings[].crmFieldName — Salesforce 欄位 API 名稱（如 Email、LastName、Phone、Custom__c）
 */

const axios = require('axios');

async function writeSalesforce(job, mappings) {
  const config         = job.crm_config      || {};
  const submissionData = job.submission_data  || {};

  const {
    instanceUrl,
    clientId,
    clientSecret,
    username,
    password,
    securityToken = '',
    apiVersion    = 'v58.0',
    sfObjectType  = 'Lead',
  } = config;

  /* ── 驗證必要欄位 ── */
  if (!instanceUrl)  throw new Error('Salesforce 設定缺少 instanceUrl');
  if (!clientId)     throw new Error('Salesforce 設定缺少 clientId（Consumer Key）');
  if (!clientSecret) throw new Error('Salesforce 設定缺少 clientSecret（Consumer Secret）');
  if (!username)     throw new Error('Salesforce 設定缺少 username');
  if (!password)     throw new Error('Salesforce 設定缺少 password');

  /* ── Step 1：取得 Access Token（Password Flow） ── */
  console.log(`[SF] 取得 Access Token（${instanceUrl}）`);

  const tokenUrl = `${instanceUrl.replace(/\/$/, '')}/services/oauth2/token`;
  let accessToken, sfInstanceUrl;

  try {
    const params = new URLSearchParams({
      grant_type:    'password',
      client_id:     clientId,
      client_secret: clientSecret,
      username:      username,
      password:      password + securityToken,  // SF 要求密碼 + Security Token 合在一起
    });

    const tokenRes = await axios.post(tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15_000,
    });

    accessToken   = tokenRes.data.access_token;
    sfInstanceUrl = tokenRes.data.instance_url;
    console.log(`[SF] Access Token 取得成功，instance：${sfInstanceUrl}`);
  } catch (err) {
    const sfError = err.response?.data?.error_description || err.message;
    throw new Error(`Salesforce 驗證失敗：${sfError}`);
  }

  /* ── Step 2：建立欄位資料 ── */
  const sfRecord = {};
  let mappedCount = 0;

  for (const mapping of mappings) {
    if (!mapping.crmFieldName) continue;
    const value = submissionData[mapping.formFieldLabel];
    if (value !== undefined && value !== null && value !== '') {
      sfRecord[mapping.crmFieldName] = Array.isArray(value) ? value.join('; ') : value;
      mappedCount++;
    }
  }

  if (mappedCount === 0) throw new Error('沒有可寫入 Salesforce 的欄位（請確認欄位對應設定）');

  /* ── Step 3：寫入 Salesforce ── */
  const apiBase = `${sfInstanceUrl}/services/data/${apiVersion}`;
  const sfApiUrl = `${apiBase}/sobjects/${sfObjectType}/`;

  console.log(`[SF] 寫入 ${sfObjectType}，欄位數：${mappedCount}`);
  console.log(`[SF] 資料：`, JSON.stringify(sfRecord));

  try {
    const createRes = await axios.post(sfApiUrl, sfRecord, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      timeout: 15_000,
    });

    const recordId = createRes.data.id;
    console.log(`[SF] ✅ 記錄建立成功，ID：${recordId}`);

    return { recordId, screenshotPath: null };

  } catch (err) {
    const sfErrors = err.response?.data;
    const detail   = Array.isArray(sfErrors)
      ? sfErrors.map(e => `${e.errorCode}: ${e.message}`).join('; ')
      : err.message;
    throw new Error(`Salesforce 寫入失敗：${detail}`);
  }
}

module.exports = { writeSalesforce };
