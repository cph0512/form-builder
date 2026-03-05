-- M-11: 名片掃描通訊錄（Business Card Scanner & Contact Book）
-- 名片掃描、聯絡人管理、CRM 同步

-- ─── 聯絡人分類表 ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_categories (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  color       VARCHAR(7)   DEFAULT '#6b7280',
  icon        VARCHAR(50)  DEFAULT 'tag',
  sort_order  INTEGER      DEFAULT 0,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active   BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- 預設分類
INSERT INTO contact_categories (name, color, icon, sort_order) VALUES
  ('客戶',     '#3b82f6', 'user-check',  1),
  ('供應商',   '#10b981', 'truck',        2),
  ('合作夥伴', '#f59e0b', 'handshake',    3),
  ('同業',     '#8b5cf6', 'building-2',   4),
  ('其他',     '#6b7280', 'circle-dot',   5)
ON CONFLICT DO NOTHING;

-- ─── 聯絡人主表 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 基本資料
  full_name             VARCHAR(200),
  first_name            VARCHAR(100),
  last_name             VARCHAR(100),
  company               VARCHAR(300),
  job_title             VARCHAR(200),
  department            VARCHAR(200),

  -- 聯絡資訊（JSONB 陣列）
  emails                JSONB DEFAULT '[]',
  phones                JSONB DEFAULT '[]',

  -- 地址 & 網站
  address               TEXT,
  website               VARCHAR(500),

  -- 社群帳號
  social_profiles       JSONB DEFAULT '{}',

  -- 分類 & 標籤
  category_id           UUID REFERENCES contact_categories(id) ON DELETE SET NULL,
  tags                  TEXT[] DEFAULT '{}',

  -- AI 掃描相關
  source_type           VARCHAR(20) DEFAULT 'manual',
  source_image_url      VARCHAR(500),
  ai_raw_result         JSONB,
  ai_confidence         DECIMAL(3,2),
  ai_suggested_category VARCHAR(100),

  -- CRM 同步
  crm_sync_status       VARCHAR(20) DEFAULT 'not_synced',
  crm_last_synced       TIMESTAMPTZ,

  -- 其他
  notes                 TEXT,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active             BOOLEAN     DEFAULT true,
  is_favorite           BOOLEAN     DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by);
CREATE INDEX IF NOT EXISTS idx_contacts_category   ON contacts(category_id);
CREATE INDEX IF NOT EXISTS idx_contacts_company    ON contacts(company);
CREATE INDEX IF NOT EXISTS idx_contacts_active     ON contacts(is_active);
CREATE INDEX IF NOT EXISTS idx_contacts_crm_status ON contacts(crm_sync_status);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_name       ON contacts(full_name);

-- ─── 擴展 crm_write_jobs（支援 contact 來源）──────────────────────
ALTER TABLE crm_write_jobs
  ADD COLUMN IF NOT EXISTS source_type  VARCHAR(20) DEFAULT 'submission',
  ADD COLUMN IF NOT EXISTS contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payload_data JSONB;
