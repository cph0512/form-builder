/**
 * RPA Worker — Playwright 瀏覽器自動化
 *
 * 流程：
 *   1. 以 headless Chromium 開啟 CRM 登入頁
 *   2. 填入帳號密碼 → 點擊登入按鈕
 *   3. 導向資料輸入頁（dataEntryUrl，可與登入頁相同）
 *   4. 依欄位對應 (mappings) 逐一填入表單值
 *   5. 提交前截圖
 *   6. 點擊表單提交按鈕（formSubmitSelector，若有設定）
 *   7. 提交後截圖
 *   8. 回傳結果
 *
 * config 欄位說明（對應 crm_connections.config）：
 *   loginUsername        — CRM 帳號
 *   loginPassword        — CRM 密碼
 *   loginSelector        — 帳號 input 的 CSS Selector
 *   passwordSelector     — 密碼 input 的 CSS Selector
 *   submitSelector       — 登入按鈕的 CSS Selector（相容舊欄位名）
 *   loginSubmitSelector  — 同上，新欄位名優先
 *   dataEntryUrl         — 登入後要前往的資料輸入 URL（空白 = 同登入頁）
 *   formSubmitSelector   — 資料表單的儲存/提交按鈕 CSS Selector
 */

const { chromium } = require('playwright');
const path = require('fs').promises ? require('path') : require('path');
const fs   = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '../../../screenshots');

// 確保截圖目錄存在
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/* ── 主函式 ── */
async function runRpa(job, mappings) {
  const config         = job.crm_config      || {};
  const submissionData = job.submission_data  || {};

  const loginUrl    = job.crm_url;
  if (!loginUrl) throw new Error('RPA 設定缺少 CRM 網址');

  console.log(`[RPA] job ${job.id} 啟動（目標：${loginUrl}）`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let beforePath = null;
  let afterPath  = null;

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    });

    const page = await context.newPage();

    /* ── Step 1：前往登入頁 ── */
    console.log(`[RPA] 前往 ${loginUrl}`);
    await page.goto(loginUrl, { timeout: 30_000, waitUntil: 'networkidle' });

    /* ── Step 2：填入登入資訊 ── */
    const loginSelector = config.loginSelector;
    const pwdSelector   = config.passwordSelector;
    const loginSubmit   = config.loginSubmitSelector || config.submitSelector;

    if (loginSelector && config.loginUsername) {
      console.log('[RPA] 填入帳號...');
      await page.waitForSelector(loginSelector, { timeout: 8000 });
      await page.fill(loginSelector, config.loginUsername);
    }

    if (pwdSelector && config.loginPassword) {
      console.log('[RPA] 填入密碼...');
      await page.fill(pwdSelector, config.loginPassword);
    }

    if (loginSubmit) {
      console.log('[RPA] 點擊登入按鈕...');
      await page.click(loginSubmit);
      await page.waitForLoadState('networkidle', { timeout: 20_000 });
      console.log('[RPA] 登入完成，目前 URL：' + page.url());
    }

    /* ── Step 3：前往資料輸入頁（若 dataEntryUrl 不同） ── */
    const dataEntryUrl = config.dataEntryUrl?.trim();
    if (dataEntryUrl && dataEntryUrl !== loginUrl) {
      console.log(`[RPA] 前往資料輸入頁 ${dataEntryUrl}`);
      await page.goto(dataEntryUrl, { timeout: 30_000, waitUntil: 'networkidle' });
    }

    /* ── Step 4：逐一填入欄位 ── */
    console.log(`[RPA] 開始填寫 ${mappings.length} 個欄位...`);
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
        await page.waitForSelector(selector, { timeout: 5000 });
        const element = page.locator(selector).first();

        const tagName   = await element.evaluate(el => el.tagName.toLowerCase());
        const inputType = await element.evaluate(el => (el.type || '').toLowerCase());

        if (tagName === 'select') {
          /* 先嘗試 value，再嘗試 label */
          try {
            await element.selectOption({ value: strValue });
          } catch {
            await element.selectOption({ label: strValue });
          }

        } else if (inputType === 'checkbox') {
          const checked = ['true', '1', '是', 'yes', 'checked'].includes(strValue.toLowerCase());
          await element.evaluate((el, c) => { el.checked = c; el.dispatchEvent(new Event('change', { bubbles: true })); }, checked);

        } else if (inputType === 'radio') {
          /* 找到 value 相符的 radio */
          const radios = page.locator(selector);
          const count  = await radios.count();
          let found    = false;
          for (let i = 0; i < count; i++) {
            const val = await radios.nth(i).getAttribute('value');
            if (val === strValue) {
              await radios.nth(i).check();
              found = true;
              break;
            }
          }
          if (!found) await radios.first().check(); // fallback

        } else {
          /* text / textarea / number / email / tel / date */
          await element.fill('');           // 先清空，避免 append
          await element.fill(strValue);
          await element.dispatchEvent('change');
        }

        console.log(`[RPA]   ✓ ${mapping.formFieldLabel} → ${selector} = "${strValue.slice(0, 30)}${strValue.length > 30 ? '...' : ''}"`);

      } catch (err) {
        const msg = `填寫「${mapping.formFieldLabel}」（${selector}）失敗：${err.message}`;
        fillErrors.push(msg);
        console.warn(`[RPA]   ✗ ${msg}`);
      }
    }

    /* ── Step 5：提交前截圖 ── */
    const beforeFile = `rpa_${job.id}_before.png`;
    beforePath = path.join(SCREENSHOT_DIR, beforeFile);
    await page.screenshot({ path: beforePath, fullPage: false });
    console.log(`[RPA] 截圖（提交前）：${beforeFile}`);

    /* ── Step 6：點擊表單提交按鈕（若有設定） ── */
    const formSubmitSelector = config.formSubmitSelector?.trim();
    if (formSubmitSelector) {
      console.log(`[RPA] 點擊表單提交按鈕 ${formSubmitSelector}`);
      await page.click(formSubmitSelector);
      await page.waitForLoadState('networkidle', { timeout: 20_000 });

      /* ── Step 7：提交後截圖 ── */
      const afterFile = `rpa_${job.id}_after.png`;
      afterPath = path.join(SCREENSHOT_DIR, afterFile);
      await page.screenshot({ path: afterPath, fullPage: false });
      console.log(`[RPA] 截圖（提交後）：${afterFile}`);
    }

    /* ── 判斷是否有欄位錯誤 ── */
    if (fillErrors.length > 0) {
      // 有部分欄位失敗，但不阻斷（仍視為執行完畢，錯誤記在 error_message）
      throw new Error(`${fillErrors.length} 個欄位填寫失敗：\n${fillErrors.join('\n')}`);
    }

    return {
      screenshotPath: afterPath ? `/screenshots/${path.basename(afterPath)}` : `/screenshots/${path.basename(beforePath)}`,
      filledCount: mappings.length - fillErrors.length,
    };

  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { runRpa };
