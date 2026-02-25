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

const DEFAULT_SYSTEM_PROMPT = `你是智慧表單 CRM 平台的 LINE Bot 助理，名稱為「智慧助理」。
你協助業務員：
1. 回答業務相關問題
2. 查詢客戶填寫的表單資料
3. 建立客戶跟進提醒排程

規則：
- 使用繁體中文回覆
- 保持專業、友善、簡潔
- 回覆長度控制在 200 字以內
- 若不確定日期時間，請要求使用者確認
- 若查無資料，請明確告知`;

// ─── Tool Definitions ─────────────────────────────────────────────────────────

// OpenAI 格式
const OPENAI_TOOLS = [
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

  const modelConfig = { model: 'gemini-1.5-flash' };
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

// ─── 公開介面 ─────────────────────────────────────────────────────────────────

module.exports = {
  chat,
  summarize,
  OPENAI_TOOLS,
  ANTHROPIC_TOOLS,
  GEMINI_TOOLS,
  DEFAULT_SYSTEM_PROMPT,
};
