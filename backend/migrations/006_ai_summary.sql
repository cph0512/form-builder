-- M-08 LINE Bot AI 摘要欄位
ALTER TABLE linebot_conversations
  ADD COLUMN IF NOT EXISTS ai_summary TEXT;
