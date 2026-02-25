/**
 * AI 服務封裝 — 支援 OpenAI 與 Anthropic Claude 雙引擎
 * 透過 AI_PROVIDER 環境變數切換（預設 openai）
 *
 * 環境變數：
 *   AI_PROVIDER=openai|claude
 *   OPENAI_API_KEY=sk-...
 *   ANTHROPIC_API_KEY=sk-ant-...
 */

let openaiClient = null;
let anthropicClient = null;

function getProvider() {
  return (process.env.AI_PROVIDER || 'openai').toLowerCase();
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
          keyword: {
            type: 'string',
            description: '要搜尋的關鍵字（客戶姓名、電話、任何表單欄位值）',
          },
          limit: {
            type: 'integer',
            description: '最多回傳幾筆，預設 5，最多 10',
            default: 5,
          },
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
          label: {
            type: 'string',
            description: '提醒的標題或客戶姓名',
          },
          trigger_at: {
            type: 'string',
            description: 'ISO 8601 日期時間，台灣時區，例如 2026-03-15T10:00:00+08:00',
          },
          message_template: {
            type: 'string',
            description: '到時要推送的 LINE 訊息內容',
          },
          repeat_type: {
            type: 'string',
            enum: ['once', 'weekly', 'monthly', 'yearly'],
            description: '重複週期，預設 once',
            default: 'once',
          },
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
        keyword: {
          type: 'string',
          description: '要搜尋的關鍵字（客戶姓名、電話、任何表單欄位值）',
        },
        limit: {
          type: 'integer',
          description: '最多回傳幾筆，預設 5，最多 10',
        },
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
        label: {
          type: 'string',
          description: '提醒的標題或客戶姓名',
        },
        trigger_at: {
          type: 'string',
          description: 'ISO 8601 日期時間，台灣時區，例如 2026-03-15T10:00:00+08:00',
        },
        message_template: {
          type: 'string',
          description: '到時要推送的 LINE 訊息內容',
        },
        repeat_type: {
          type: 'string',
          description: 'once / weekly / monthly / yearly，預設 once',
        },
      },
      required: ['label', 'trigger_at', 'message_template'],
    },
  },
];

// ─── 主要 API：chat ───────────────────────────────────────────────────────────

/**
 * 傳送訊息給 AI，支援 tool call
 * @param {Array} messages - [{ role: 'user'|'assistant'|'tool', content: string, name?: string }]
 * @param {boolean} useTools - 是否啟用工具（預設 true）
 * @param {string} systemPrompt - 覆蓋預設系統提示詞
 * @returns {{ text: string|null, toolCalls: Array|null } | null}
 */
async function chat(messages, useTools = true, systemPrompt = DEFAULT_SYSTEM_PROMPT) {
  const provider = getProvider();

  try {
    if (provider === 'claude') {
      return await chatClaude(messages, useTools, systemPrompt);
    } else {
      return await chatOpenAI(messages, useTools, systemPrompt);
    }
  } catch (err) {
    console.error('[AI Service] chat 錯誤:', err.message);
    return null;
  }
}

async function chatOpenAI(messages, useTools, systemPrompt) {
  const client = getOpenAI();
  if (!client) return null;

  // 轉換 tool result 格式
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => {
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.tool_call_id || 'call_0', content: m.content };
      }
      return { role: m.role, content: m.content };
    }),
  ];

  const params = {
    model: 'gpt-4o-mini',
    messages: openaiMessages,
    max_tokens: 500,
    temperature: 0.7,
  };
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

async function chatClaude(messages, useTools, systemPrompt) {
  const client = getAnthropic();
  if (!client) return null;

  // 轉換 tool result 格式給 Claude
  const claudeMessages = messages.map(m => {
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.tool_call_id || 'toolu_0',
          content: m.content,
        }],
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
      toolCalls: [{
        id: toolUse.id,
        name: toolUse.name,
        input: toolUse.input,
      }],
    };
  }

  const textBlock = response.content.find(b => b.type === 'text');
  return { text: textBlock?.text || null, toolCalls: null };
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
  const hasKey = provider === 'claude'
    ? !!process.env.ANTHROPIC_API_KEY
    : !!process.env.OPENAI_API_KEY;
  if (!hasKey) return null;

  const transcript = lineMessages
    .map(m => `[${new Date(m.time).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}] ${m.text}`)
    .join('\n');

  const prompt = `請將以下 LINE 對話記錄整理成簡短摘要（繁體中文，3-5 行），包含：主要討論事項、待跟進事項。\n\n對話記錄：\n${transcript}`;

  const result = await chat([{ role: 'user', content: prompt }], false,
    '你是專業的業務對話分析助理，請提供精簡的對話摘要。');
  return result?.text || null;
}

// ─── 公開工具定義（供 linebot.js 使用）──────────────────────────────────────

module.exports = {
  chat,
  summarize,
  OPENAI_TOOLS,
  ANTHROPIC_TOOLS,
  DEFAULT_SYSTEM_PROMPT,
};
