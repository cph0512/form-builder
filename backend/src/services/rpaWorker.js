/**
 * RPA Worker — Playwright 瀏覽器自動化
 *
 * 支援兩種模式：
 *   Steps 模式  — config.steps 陣列，每個步驟可自訂（navigate/click/fill/select/fill_form/screenshot/wait）
 *   Legacy 模式 — 舊版 config 欄位（loginSelector / dataEntryUrl / formSubmitSelector...），向下相容
 *
 * Steps 模板變數：
 *   {{url}}           — 連線設定中的 CRM 網址
 *   {{loginUsername}} — 登入帳號
 *   {{loginPassword}} — 登入密碼
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '../../../screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

/* ── 模板變數替換 ── */
function resolve(val, config) {
  if (!val) return '';
  return String(val).replace(/\{\{(\w+)\}\}/g, (_, k) => config[k] ?? '');
}

/* ── 填入單一欄位（支援 select / checkbox / radio / text） ── */
async function fillField(page, selector, strValue) {
  await page.waitForSelector(selector, { timeout: 5000 });
  const element  = page.locator(selector).first();
  const tagName  = await element.evaluate(el => el.tagName.toLowerCase());
  const inputType = await element.evaluate(el => (el.type || '').toLowerCase());

  if (tagName === 'select') {
    try { await element.selectOption({ value: strValue }); }
    catch { await element.selectOption({ label: strValue }); }

  } else if (inputType === 'checkbox') {
    const checked = ['true', '1', '是', 'yes', 'checked'].includes(strValue.toLowerCase());
    await element.evaluate((el, c) => {
      el.checked = c;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, checked);

  } else if (inputType === 'radio') {
    const radios = page.locator(selector);
    const count  = await radios.count();
    let found    = false;
    for (let i = 0; i < count; i++) {
      const val = await radios.nth(i).getAttribute('value');
      if (val === strValue) { await radios.nth(i).check(); found = true; break; }
    }
    if (!found) await radios.first().check();

  } else {
    await element.fill('');
    await element.fill(strValue);
    await element.dispatchEvent('change');
  }
}

/* ── fill_form：填入所有欄位對應 ── */
async function fillFormFields(page, mappings, submissionData) {
  const fillErrors = [];
  for (const mapping of mappings) {
    const selector = mapping.crmSelector?.trim();
    if (!selector) continue;

    const rawValue = submissionData[mapping.formFieldLabel];
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      console.log(`[RPA] 略過空值欄位：${mapping.formFieldLabel}`);
      continue;
    }

    const strValue = Array.isArray(rawValue) ? rawValue.join(', ') : String(rawValue);
    try {
      await fillField(page, selector, strValue);
      console.log(`[RPA]   ✓ ${mapping.formFieldLabel} → ${selector} = "${strValue.slice(0, 30)}${strValue.length > 30 ? '...' : ''}"`);
    } catch (err) {
      const msg = `填寫「${mapping.formFieldLabel}」（${selector}）失敗：${err.message}`;
      fillErrors.push(msg);
      console.warn(`[RPA]   ✗ ${msg}`);
    }
  }
  return fillErrors;
}

/* ── 執行單一步驟 ── */
async function executeStep(page, step, config, mappings, submissionData, screenshots, job) {
  switch (step.type) {

    case 'navigate': {
      const url = resolve(step.url, config);
      console.log(`[RPA] navigate → ${url}`);
      await page.goto(url, { timeout: 30_000, waitUntil: step.waitFor || 'networkidle' });
      return [];
    }

    case 'click': {
      console.log(`[RPA] click → ${step.selector}`);
      await page.waitForSelector(step.selector, { timeout: step.timeout || 10_000 });
      await page.click(step.selector);
      if (step.waitFor) await page.waitForLoadState(step.waitFor, { timeout: 20_000 });
      return [];
    }

    case 'fill': {
      const value = resolve(step.value, config);
      console.log(`[RPA] fill → ${step.selector} = "${String(value).slice(0, 20)}..."`);
      await page.waitForSelector(step.selector, { timeout: step.timeout || 10_000 });
      await page.fill(step.selector, value);
      return [];
    }

    case 'select': {
      const value = resolve(step.value, config);
      console.log(`[RPA] select → ${step.selector} = "${value}"`);
      await page.waitForSelector(step.selector, { timeout: step.timeout || 10_000 });
      try { await page.selectOption(step.selector, { value }); }
      catch { await page.selectOption(step.selector, { label: value }); }
      return [];
    }

    case 'wait': {
      if (step.selector) {
        console.log(`[RPA] wait selector → ${step.selector}`);
        await page.waitForSelector(step.selector, { timeout: step.timeout || 15_000 });
      } else {
        const ms = step.ms || 1000;
        console.log(`[RPA] wait ${ms}ms`);
        await page.waitForTimeout(ms);
      }
      return [];
    }

    case 'screenshot': {
      const label = step.label || `step_${Date.now()}`;
      const file  = `rpa_${job.id}_${label}.png`;
      const p     = path.join(SCREENSHOT_DIR, file);
      await page.screenshot({ path: p, fullPage: false });
      screenshots[label] = p;
      console.log(`[RPA] screenshot → ${file}`);
      return [];
    }

    case 'fill_form': {
      console.log(`[RPA] fill_form（${mappings.length} 欄位）`);
      return await fillFormFields(page, mappings, submissionData);
    }

    default:
      console.warn(`[RPA] 未知步驟類型：${step.type}`);
      return [];
  }
}

/* ── 主函式 ── */
async function runRpa(job, mappings) {
  const config         = job.crm_config     || {};
  const submissionData = job.submission_data || {};
  const loginUrl       = job.crm_url;
  if (!loginUrl) throw new Error('RPA 設定缺少 CRM 網址');

  console.log(`[RPA] job ${job.id} 啟動（目標：${loginUrl}）`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const screenshots   = {};
  const allFillErrors = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    });
    const page = await context.newPage();

    /* ══════════════ Steps 模式 ══════════════ */
    if (Array.isArray(config.steps) && config.steps.length > 0) {
      console.log(`[RPA] Steps 模式（${config.steps.length} 步驟）`);

      // 注入 url，讓 {{url}} 可用
      const fullConfig = { ...config, url: loginUrl };

      for (let i = 0; i < config.steps.length; i++) {
        const step = config.steps[i];
        console.log(`[RPA] ── 步驟 ${i + 1}/${config.steps.length}：${step.type} ──`);
        const errors = await executeStep(page, step, fullConfig, mappings, submissionData, screenshots, job);
        allFillErrors.push(...errors);
      }

    /* ══════════════ Legacy 相容模式 ══════════════ */
    } else {
      console.log(`[RPA] Legacy 模式`);

      await page.goto(loginUrl, { timeout: 30_000, waitUntil: 'networkidle' });

      const loginSelector = config.loginSelector;
      const pwdSelector   = config.passwordSelector;
      const loginSubmit   = config.loginSubmitSelector || config.submitSelector;

      if (loginSelector && config.loginUsername) {
        await page.waitForSelector(loginSelector, { timeout: 8000 });
        await page.fill(loginSelector, config.loginUsername);
      }
      if (pwdSelector && config.loginPassword) {
        await page.fill(pwdSelector, config.loginPassword);
      }
      if (loginSubmit) {
        await page.click(loginSubmit);
        await page.waitForLoadState('networkidle', { timeout: 20_000 });
      }

      const dataEntryUrl = config.dataEntryUrl?.trim();
      if (dataEntryUrl && dataEntryUrl !== loginUrl) {
        await page.goto(dataEntryUrl, { timeout: 30_000, waitUntil: 'networkidle' });
      }

      const errors = await fillFormFields(page, mappings, submissionData);
      allFillErrors.push(...errors);

      const beforeFile = `rpa_${job.id}_before.png`;
      const beforePath = path.join(SCREENSHOT_DIR, beforeFile);
      await page.screenshot({ path: beforePath, fullPage: false });
      screenshots['before'] = beforePath;

      const formSubmitSelector = config.formSubmitSelector?.trim();
      if (formSubmitSelector) {
        await page.click(formSubmitSelector);
        await page.waitForLoadState('networkidle', { timeout: 20_000 });
        const afterFile = `rpa_${job.id}_after.png`;
        const afterPath = path.join(SCREENSHOT_DIR, afterFile);
        await page.screenshot({ path: afterPath, fullPage: false });
        screenshots['after'] = afterPath;
      }
    }

    /* ── 欄位填寫錯誤時拋出（不阻斷截圖，但標記 job 失敗） ── */
    if (allFillErrors.length > 0) {
      throw new Error(`${allFillErrors.length} 個欄位填寫失敗：\n${allFillErrors.join('\n')}`);
    }

    const screenshotValues = Object.values(screenshots);
    const lastShot  = screenshotValues[screenshotValues.length - 1];
    const firstShot = screenshotValues[0];
    const shotPath  = lastShot || firstShot;

    return {
      screenshotPath: shotPath ? `/screenshots/${path.basename(shotPath)}` : null,
      filledCount: mappings.length - allFillErrors.length,
    };

  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { runRpa };
