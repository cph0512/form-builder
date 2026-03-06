/**
 * AI 服務封裝 — 支援 OpenAI、Anthropic Claude、Google Gemini 三引擎
 * 透過 AI_PROVIDER 環境變數切換（預設 gemini）
 *
 * 環境變數：
 *   AI_PROVIDER=gemini|openai|claude
 *   GEMINI_API_KEY=AIza...          ← 免費方案
 *   OPENAI_API_KEY=sk-...
 *   ANTHROPIC_API_KEY=sk-ant-...
 */

let openaiClient = null;
let anthropicClient = null;
let geminiClient = null;
let geminiFileManager = null;

function getProvider() {
  return (process.env.AI_PROVIDER || 'gemini').toLowerCase();
}

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    const { OpenAI } = require('openai');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropicClient = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function getGemini() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!geminiClient) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return geminiClient;
}

// ─── 預設系統提示詞 ───────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `你是「智慧助理」，服務於業務團隊的 LINE Bot 夥伴。

個性與風格：
- 像朋友一樣自然對話，不要每次都自我介紹或列出功能清單
- 使用繁體中文，語氣輕鬆、友善、有溫度
- 回覆簡短有力，不超過 150 字，除非對方需要詳細說明
- 適時加入 emoji 讓對話更活潑 😊
- 收到打招呼就自然回應，不需要正式介紹自己

你的能力（在對方需要時才主動使用）：
- 回答業務、產品、客戶相關問題
- 查詢客戶填寫的表單資料（使用 search_form_submissions）
- 幫對方建立跟進提醒（使用 create_reminder）

注意事項：
- 若查無資料，誠實告知並提供其他建議
- 若日期時間不明確，請對方確認再建立提醒
- 今天日期：${new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}，台灣時區`;

// ─── Tool Definitions ─────────────────────────────────────────────────────────

// OpenAI 格式
const OPENAI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: '搜尋業務知識庫，找尋產品資訊、FAQ、價格、政策說明等。回答業務相關問題時請優先使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          keyword:  { type: 'string', description: '搜尋關鍵字，例如產品名稱、問題關鍵字' },
          category: { type: 'string', description: '分類過濾：product/faq/policy/price/general，可不填' },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_form_submissions',
      description: '搜尋客戶填寫的表單資料，可依關鍵字或客戶名稱查詢',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '要搜尋的關鍵字（客戶姓名、電話、任何表單欄位值）' },
          limit:   { type: 'integer', description: '最多回傳幾筆，預設 5，最多 10', default: 5 },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_reminder',
      description: '為使用者建立 LINE 提醒排程，到時間會自動推送 LINE 訊息',
      parameters: {
        type: 'object',
        properties: {
          label:            { type: 'string', description: '提醒的標題或客戶姓名' },
          trigger_at:       { type: 'string', description: 'ISO 8601 日期時間，台灣時區，例如 2026-03-15T10:00:00+08:00' },
          message_template: { type: 'string', description: '到時要推送的 LINE 訊息內容' },
          repeat_type:      { type: 'string', enum: ['once','weekly','monthly','yearly'], description: '重複週期，預設 once', default: 'once' },
        },
        required: ['label', 'trigger_at', 'message_template'],
      },
    },
  },
];

// Anthropic 格式
const ANTHROPIC_TOOLS = [
  {
    name: 'search_knowledge_base',
    description: '搜尋業務知識庫，找尋產品資訊、FAQ、價格、政策說明等。回答業務相關問題時請優先使用此工具。',
    input_schema: {
      type: 'object',
      properties: {
        keyword:  { type: 'string', description: '搜尋關鍵字，例如產品名稱、問題關鍵字' },
        category: { type: 'string', description: '分類過濾：product/faq/policy/price/general，可不填' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'search_form_submissions',
    description: '搜尋客戶填寫的表單資料，可依關鍵字或客戶名稱查詢',
    input_schema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '要搜尋的關鍵字（客戶姓名、電話、任何表單欄位值）' },
        limit:   { type: 'integer', description: '最多回傳幾筆，預設 5，最多 10' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'create_reminder',
    description: '為使用者建立 LINE 提醒排程，到時間會自動推送 LINE 訊息',
    input_schema: {
      type: 'object',
      properties: {
        label:            { type: 'string', description: '提醒的標題或客戶姓名' },
        trigger_at:       { type: 'string', description: 'ISO 8601 日期時間，台灣時區，例如 2026-03-15T10:00:00+08:00' },
        message_template: { type: 'string', description: '到時要推送的 LINE 訊息內容' },
        repeat_type:      { type: 'string', description: 'once / weekly / monthly / yearly，預設 once' },
      },
      required: ['label', 'trigger_at', 'message_template'],
    },
  },
];

// Gemini 格式（type 用大寫）
const GEMINI_TOOLS = [
  {
    name: 'search_knowledge_base',
    description: '搜尋業務知識庫，找尋產品資訊、FAQ、價格、政策說明等。回答業務相關問題時請優先使用此工具。',
    parameters: {
      type: 'OBJECT',
      properties: {
        keyword:  { type: 'STRING', description: '搜尋關鍵字，例如產品名稱、問題關鍵字' },
        category: { type: 'STRING', description: '分類過濾：product/faq/policy/price/general，可不填' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'search_form_submissions',
    description: '搜尋客戶填寫的表單資料，可依關鍵字或客戶名稱查詢',
    parameters: {
      type: 'OBJECT',
      properties: {
        keyword: { type: 'STRING', description: '要搜尋的關鍵字（客戶姓名、電話、任何表單欄位值）' },
        limit:   { type: 'INTEGER', description: '最多回傳幾筆，預設 5，最多 10' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'create_reminder',
    description: '為使用者建立 LINE 提醒排程，到時間會自動推送 LINE 訊息',
    parameters: {
      type: 'OBJECT',
      properties: {
        label:            { type: 'STRING', description: '提醒的標題或客戶姓名' },
        trigger_at:       { type: 'STRING', description: 'ISO 8601 日期時間，台灣時區，例如 2026-03-15T10:00:00+08:00' },
        message_template: { type: 'STRING', description: '到時要推送的 LINE 訊息內容' },
        repeat_type:      { type: 'STRING', description: 'once / weekly / monthly / yearly，預設 once' },
      },
      required: ['label', 'trigger_at', 'message_template'],
    },
  },
];

// ─── 主要 API：chat ───────────────────────────────────────────────────────────

/**
 * 傳送訊息給 AI，支援 tool call
 * @param {Array}   messages   - [{ role, content, tool_call_id?, name?, input? }]
 * @param {boolean} useTools   - 是否啟用工具（預設 true）
 * @param {string}  systemPrompt
 * @returns {{ text: string|null, toolCalls: Array|null } | null}
 */
async function chat(messages, useTools = true, systemPrompt = DEFAULT_SYSTEM_PROMPT) {
  const provider = getProvider();
  try {
    if (provider === 'claude')  return await chatClaude(messages, useTools, systemPrompt);
    if (provider === 'gemini')  return await chatGemini(messages, useTools, systemPrompt);
    return await chatOpenAI(messages, useTools, systemPrompt);
  } catch (err) {
    console.error('[AI Service] chat 錯誤:', err.message);
    return null;
  }
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

async function chatOpenAI(messages, useTools, systemPrompt) {
  const client = getOpenAI();
  if (!client) return null;

  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => {
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.tool_call_id || 'call_0', content: m.content };
      }
      return { role: m.role, content: m.content };
    }),
  ];

  const params = { model: 'gpt-4o-mini', messages: openaiMessages, max_tokens: 500, temperature: 0.7 };
  if (useTools) params.tools = OPENAI_TOOLS;

  const response = await client.chat.completions.create(params);
  const choice = response.choices[0];

  if (choice.finish_reason === 'tool_calls') {
    return {
      text: choice.message.content || null,
      toolCalls: choice.message.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      })),
    };
  }
  return { text: choice.message.content, toolCalls: null };
}

// ── Anthropic Claude ────────────────────────────────────────────────────────

async function chatClaude(messages, useTools, systemPrompt) {
  const client = getAnthropic();
  if (!client) return null;

  const claudeMessages = messages.map(m => {
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id || 'toolu_0', content: m.content }],
      };
    }
    return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content };
  });

  const params = {
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 500,
    system: systemPrompt,
    messages: claudeMessages,
  };
  if (useTools) params.tools = ANTHROPIC_TOOLS;

  const response = await client.messages.create(params);
  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (toolUse) {
    return {
      text: response.content.find(b => b.type === 'text')?.text || null,
      toolCalls: [{ id: toolUse.id, name: toolUse.name, input: toolUse.input }],
    };
  }
  return { text: response.content.find(b => b.type === 'text')?.text || null, toolCalls: null };
}

// ── Google Gemini ────────────────────────────────────────────────────────────

async function chatGemini(messages, useTools, systemPrompt) {
  const genAI = getGemini();
  if (!genAI) return null;

  // 若是 tool 結果回傳（follow-up），改用純文字注入方式（避免複雜多輪格式）
  const hasToolResult = messages.some(m => m.role === 'tool');
  if (hasToolResult) {
    // 把 tool 結果轉成純文字訊息再問 Gemini
    const toolMsg = messages.find(m => m.role === 'tool');
    const prevMessages = messages.filter(m => m.role !== 'tool' && m.role !== 'assistant');
    const injected = [
      ...prevMessages,
      { role: 'user', content: `工具查詢結果如下：\n${toolMsg.content}\n\n請根據以上資料用繁體中文回覆使用者。` },
    ];
    return await chatGeminiSimple(injected, false, systemPrompt);
  }

  return await chatGeminiSimple(messages, useTools, systemPrompt);
}

async function chatGeminiSimple(messages, useTools, systemPrompt) {
  const genAI = getGemini();
  if (!genAI) return null;

  const modelConfig = { model: 'gemini-2.5-flash' };
  if (useTools) {
    modelConfig.tools = [{ functionDeclarations: GEMINI_TOOLS }];
  }

  const model = genAI.getGenerativeModel(modelConfig);

  // 轉換 messages → Gemini contents 格式
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content || '' }],
  }));

  // Gemini 要求第一則必須是 user，且不能相鄰兩則同角色
  // 簡單處理：合併相鄰同角色
  const merged = [];
  for (const c of contents) {
    if (merged.length > 0 && merged[merged.length - 1].role === c.role) {
      merged[merged.length - 1].parts.push(...c.parts);
    } else {
      merged.push({ ...c, parts: [...c.parts] });
    }
  }
  // 確保第一則是 user
  if (merged.length > 0 && merged[0].role === 'model') {
    merged.unshift({ role: 'user', parts: [{ text: '你好' }] });
  }

  const result = await model.generateContent({
    systemInstruction: systemPrompt,
    contents: merged,
    generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
  });

  const response = result.response;

  // 檢查是否有 function call
  const functionCalls = response.functionCalls?.();
  if (functionCalls && functionCalls.length > 0) {
    const fc = functionCalls[0];
    return {
      text: null,
      toolCalls: [{ id: `gemini_${Date.now()}`, name: fc.name, input: fc.args }],
    };
  }

  return { text: response.text(), toolCalls: null };
}

// ─── 對話摘要 ─────────────────────────────────────────────────────────────────

/**
 * 將 linebot_conversations.messages JSONB 陣列摘要成純文字
 * @param {Array} lineMessages - [{ sender, text, time }]
 * @returns {string|null}
 */
async function summarize(lineMessages) {
  if (!lineMessages || lineMessages.length === 0) return null;

  const provider = getProvider();
  const keyMap = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', claude: 'ANTHROPIC_API_KEY' };
  if (!process.env[keyMap[provider] || 'GEMINI_API_KEY']) return null;

  const transcript = lineMessages
    .map(m => `[${new Date(m.time).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}] ${m.text}`)
    .join('\n');

  const prompt = `請將以下 LINE 對話記錄整理成簡短摘要（繁體中文，3-5 行），包含：主要討論事項、待跟進事項。\n\n對話記錄：\n${transcript}`;

  const result = await chat(
    [{ role: 'user', content: prompt }],
    false,
    '你是專業的業務對話分析助理，請提供精簡的對話摘要。'
  );
  return result?.text || null;
}

// ─── 圖片解析（多模態，依 AI_PROVIDER 決定引擎）──────────────────────────────

/**
 * 解析圖片內容（產品表格、文字等），回傳整理好的文字
 * @param {string} base64   - 圖片的 base64 字串
 * @param {string} mimeType - 例如 'image/jpeg'、'image/png'
 * @returns {string|null}
 */
async function parseImage(base64, mimeType) {
  const provider = getProvider();
  try {
    if (provider === 'gemini') return await parseImageGemini(base64, mimeType);
    if (provider === 'openai') return await parseImageOpenAI(base64, mimeType); // 預留
    if (provider === 'claude') return await parseImageClaude(base64, mimeType); // 預留
    return null;
  } catch (err) {
    console.error('[AI Service] parseImage 錯誤:', err.message);
    return null;
  }
}

async function parseImageGemini(base64, mimeType) {
  const genAI = getGemini();
  if (!genAI) return null;
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent([
    '請將這張圖片中的所有文字、表格、產品資訊整理成清楚的知識條目，使用繁體中文，格式：先寫標題，再寫詳細內容。',
    { inlineData: { data: base64, mimeType } },
  ]);
  return result.response.text();
}

// 預留框架（未來補實作）
async function parseImageOpenAI(base64, mimeType) { /* TODO: GPT-4o Vision */ return null; }
async function parseImageClaude(base64, mimeType) { /* TODO: Claude Vision */ return null; }

// ─── 名片辨識（多模態，structured JSON output）──────────────────────────────

const BUSINESS_CARD_PROMPT = `你是一個專業的名片辨識系統。請仔細分析這張名片圖片，提取所有可見的聯絡資訊。

請以下面的 JSON 格式回傳結果，不要有多餘的文字說明：

\`\`\`json
{
  "contact": {
    "full_name": "完整姓名",
    "first_name": "名",
    "last_name": "姓",
    "company": "公司名稱",
    "job_title": "職稱",
    "department": "部門（若有）",
    "emails": [
      { "value": "email@example.com", "label": "工作", "is_primary": true }
    ],
    "phones": [
      { "value": "+886-2-1234-5678", "label": "公司電話", "is_primary": true },
      { "value": "0912-345-678", "label": "手機", "is_primary": false }
    ],
    "address": "完整地址",
    "website": "https://www.example.com",
    "social_profiles": {
      "linkedin": "",
      "line_id": "",
      "facebook": ""
    }
  },
  "suggested_category": "客戶",
  "confidence": 0.95,
  "notes": "任何額外觀察"
}
\`\`\`

重要規則：
1. 姓名：中文名片姓在前名在後。英文名片 first_name 是 given name，last_name 是 family name。full_name 保留原始格式。
2. 電話：保留名片上的原始格式。用 label 標記類型（公司電話、手機、傳真等）。
3. confidence：0.0-1.0，反映辨識準確度。名片模糊或遮擋則降低。
4. suggested_category：根據公司名稱和職稱推測，只能是：客戶、供應商、合作夥伴、同業、其他。
5. 找不到的欄位設為空字串或空陣列，不要猜測。
6. 保留名片上的原始語言，不要翻譯。

請只回傳 JSON。`;

/**
 * 解析名片圖片，回傳結構化 JSON
 * @param {string} base64   - 圖片 base64
 * @param {string} mimeType - 例如 'image/jpeg'
 * @returns {Object|null}    - { contact, suggested_category, confidence, notes }
 */
async function parseBusinessCard(base64, mimeType) {
  const provider = getProvider();
  try {
    if (provider === 'gemini') return await parseBusinessCardGemini(base64, mimeType);
    if (provider === 'openai') return await parseBusinessCardOpenAI(base64, mimeType);
    if (provider === 'claude') return await parseBusinessCardClaude(base64, mimeType);
    return null;
  } catch (err) {
    console.error('[AI Service] parseBusinessCard 錯誤:', err.message);
    return null;
  }
}

async function parseBusinessCardGemini(base64, mimeType) {
  const genAI = getGemini();
  if (!genAI) return null;
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent([
    BUSINESS_CARD_PROMPT,
    { inlineData: { data: base64, mimeType } },
  ]);

  const text = result.response.text();
  // 提取 JSON（處理 markdown code block）
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  return JSON.parse(jsonMatch[1] || jsonMatch[0]);
}

// 預留框架
async function parseBusinessCardOpenAI(base64, mimeType) { /* TODO */ return null; }
async function parseBusinessCardClaude(base64, mimeType) { /* TODO */ return null; }

// ─── PDF 批次名片掃描 ────────────────────────────────────────────────────────

function getFileManager() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!geminiFileManager) {
    const { GoogleAIFileManager } = require('@google/generative-ai/server');
    geminiFileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
  }
  return geminiFileManager;
}

const BUSINESS_CARD_BATCH_PROMPT = `你是一個專業的名片辨識系統。這個 PDF 文件包含多頁名片，每一頁可能有一張或多張名片。

請仔細分析每一頁中的所有名片，提取所有可見的聯絡資訊。

請以下面的 JSON 格式回傳結果，不要有多餘的文字說明：

\`\`\`json
{
  "contacts": [
    {
      "page": 1,
      "contact": {
        "full_name": "完整姓名",
        "first_name": "名",
        "last_name": "姓",
        "company": "公司名稱",
        "job_title": "職稱",
        "department": "部門（若有）",
        "emails": [
          { "value": "email@example.com", "label": "工作", "is_primary": true }
        ],
        "phones": [
          { "value": "+886-2-1234-5678", "label": "公司電話", "is_primary": true },
          { "value": "0912-345-678", "label": "手機", "is_primary": false }
        ],
        "address": "完整地址",
        "website": "https://www.example.com",
        "social_profiles": { "linkedin": "", "line_id": "", "facebook": "" }
      },
      "suggested_category": "客戶",
      "confidence": 0.95,
      "notes": "任何額外觀察"
    }
  ],
  "total_cards_found": 5,
  "total_pages_scanned": 10
}
\`\`\`

重要規則：
1. 每張名片對應 contacts 陣列的一個元素。如果一頁有多張名片，請分別提取。
2. page 欄位記錄該名片位於 PDF 的第幾頁（從 1 開始）。
3. 姓名：中文名片姓在前名在後。英文名片 first_name 是 given name，last_name 是 family name。full_name 保留原始格式。
4. 電話：保留名片上的原始格式。用 label 標記類型（公司電話、手機、傳真等）。
5. confidence：0.0-1.0，反映辨識準確度。
6. suggested_category：根據公司和職稱推測，只能是：客戶、供應商、合作夥伴、同業、其他。
7. 找不到的欄位設為空字串或空陣列，不要猜測。
8. 保留名片上的原始語言，不要翻譯。

請只回傳 JSON。`;

async function parseBusinessCardsBatch(pdfBuffer) {
  const provider = getProvider();
  if (provider !== 'gemini') {
    throw new Error('PDF 批次掃描目前只支援 Gemini AI 引擎');
  }

  const fm = getFileManager();
  const genAI = getGemini();
  if (!fm || !genAI) throw new Error('Gemini API 未設定');

  // 1. 上傳 PDF 到 Gemini File API
  console.log('[scan-batch] 上傳 PDF 到 Gemini File API...');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  // 寫入暫存檔（GoogleAIFileManager 需要檔案路徑）
  const tmpPath = path.join(os.tmpdir(), `batch_cards_${Date.now()}.pdf`);
  fs.writeFileSync(tmpPath, pdfBuffer);

  try {
    const uploadResult = await fm.uploadFile(tmpPath, {
      mimeType: 'application/pdf',
      displayName: `batch_cards_${Date.now()}.pdf`,
    });

    // 2. 輪詢等待檔案處理完成
    let file = uploadResult.file;
    const maxWait = 120_000;
    const pollInterval = 3_000;
    let waited = 0;
    console.log('[scan-batch] 等待 Gemini 處理 PDF...', file.state);
    while (file.state === 'PROCESSING' && waited < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));
      file = await fm.getFile(file.name);
      waited += pollInterval;
      console.log(`[scan-batch] 狀態: ${file.state} (${waited / 1000}s)`);
    }
    if (file.state !== 'ACTIVE') {
      throw new Error(`PDF 處理失敗：${file.state}`);
    }

    // 3. 傳給 Gemini 分析
    console.log('[scan-batch] 送出 AI 辨識請求...');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent([
      BUSINESS_CARD_BATCH_PROMPT,
      { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
    ]);

    const text = result.response.text();
    console.log('[scan-batch] AI 回傳長度:', text.length);

    // 4. 解析 JSON
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 回傳格式無法解析');
    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);

    // 5. 刪除暫存檔案
    fm.deleteFile(file.name).catch(() => {});

    return parsed;
  } finally {
    // 清理本地暫存檔
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

// ─── 公開介面 ─────────────────────────────────────────────────────────────────

module.exports = {
  chat,
  summarize,
  parseImage,
  parseBusinessCard,
  parseBusinessCardsBatch,
  OPENAI_TOOLS,
  ANTHROPIC_TOOLS,
  GEMINI_TOOLS,
  DEFAULT_SYSTEM_PROMPT,
};
