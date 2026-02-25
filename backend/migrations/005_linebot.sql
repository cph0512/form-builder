-- M-08 Line Bot 模組 DB Migration

-- 1. 綁定關係：平台使用者 ↔ LINE 使用者
CREATE TABLE IF NOT EXISTS linebot_bindings (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_user_id      VARCHAR(50),
  line_display_name VARCHAR(200),
  line_picture_url  TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform_user_id),
  UNIQUE(line_user_id)
);

-- 2. 綁定碼（Web 後台生成，Bot 接收驗證）
CREATE TABLE IF NOT EXISTS linebot_binding_codes (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code             VARCHAR(20) UNIQUE NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,
  created_by       UUID REFERENCES users(id)
);

-- 3. 對話記錄（支援個人 & 群組）
CREATE TABLE IF NOT EXISTS linebot_conversations (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type      VARCHAR(10) NOT NULL DEFAULT 'user', -- 'user' | 'group'
  source_id        VARCHAR(50) NOT NULL,                -- line_user_id 或 group_id
  group_name       VARCHAR(200),                        -- 群組名稱（若有）
  platform_user_id UUID REFERENCES users(id),           -- 觸發 /記錄 的業務員
  messages         JSONB NOT NULL DEFAULT '[]',
  crm_status       VARCHAR(20) DEFAULT 'pending',       -- pending/uploaded/failed
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_linebot_conv_source ON linebot_conversations(source_id);
CREATE INDEX IF NOT EXISTS idx_linebot_conv_date   ON linebot_conversations(created_at DESC);

-- 4. 提醒排程
CREATE TABLE IF NOT EXISTS linebot_reminders (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type             VARCHAR(30) NOT NULL,  -- birthday/test_drive/follow_up/contract/custom
  label            VARCHAR(200),          -- 顯示名稱（如客戶姓名）
  target_id        VARCHAR(50),           -- 目標 LINE ID（個人或群組）
  trigger_at       TIMESTAMPTZ NOT NULL,
  repeat_type      VARCHAR(20) DEFAULT 'once', -- once/weekly/monthly/yearly
  message_template TEXT NOT NULL,
  is_sent          BOOLEAN DEFAULT false,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_linebot_reminders_trigger ON linebot_reminders(trigger_at, is_sent);

-- 5. 訊息範本
CREATE TABLE IF NOT EXISTS linebot_templates (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  content     TEXT NOT NULL,
  variables   JSONB DEFAULT '[]',  -- ['客戶姓名', '業務員姓名', ...]
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 群發任務
CREATE TABLE IF NOT EXISTS linebot_broadcasts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by      UUID NOT NULL REFERENCES users(id),
  message_content TEXT NOT NULL,
  target_line_ids JSONB NOT NULL DEFAULT '[]',
  status          VARCHAR(20) DEFAULT 'pending', -- pending/sending/done/failed
  total_count     INT DEFAULT 0,
  sent_count      INT DEFAULT 0,
  failed_count    INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

-- 7. 群發逐筆記錄
CREATE TABLE IF NOT EXISTS linebot_broadcast_logs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  broadcast_id  UUID NOT NULL REFERENCES linebot_broadcasts(id) ON DELETE CASCADE,
  line_user_id  VARCHAR(50) NOT NULL,
  status        VARCHAR(20) NOT NULL, -- sent/failed
  error_message TEXT,
  sent_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_linebot_broadcast_logs ON linebot_broadcast_logs(broadcast_id);
