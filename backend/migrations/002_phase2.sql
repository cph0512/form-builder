-- Phase 2 Migration: 語音辨識 + CRM 自動寫入引擎
-- 執行方式：psql -U postgres -d form_builder -f migrations/002_phase2.sql

-- CRM 連線設定表
CREATE TABLE IF NOT EXISTS crm_connections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL,
  type        VARCHAR(50)  NOT NULL DEFAULT 'rpa_web', -- 'rpa_web' | 'salesforce_api' | 'generic_api'
  url         VARCHAR(500),
  config      JSONB        DEFAULT '{}',   -- login selectors, submit selector, etc.
  is_active   BOOLEAN      DEFAULT true,
  created_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP    DEFAULT NOW(),
  updated_at  TIMESTAMP    DEFAULT NOW()
);

-- 表單欄位 ↔ CRM 欄位對應表
CREATE TABLE IF NOT EXISTS crm_field_mappings (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id             UUID    NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  crm_connection_id   UUID    NOT NULL REFERENCES crm_connections(id) ON DELETE CASCADE,
  mappings            JSONB   DEFAULT '[]',
  -- mappings format: [{ formFieldLabel, crmSelector, crmFieldName, fieldType }]
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW(),
  UNIQUE(form_id, crm_connection_id)
);

-- CRM 寫入任務佇列
CREATE TABLE IF NOT EXISTS crm_write_jobs (
  id                  UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id       UUID      NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  crm_connection_id   UUID      REFERENCES crm_connections(id) ON DELETE SET NULL,
  status              VARCHAR(20) DEFAULT 'pending', -- pending|running|success|failed|cancelled
  retry_count         INTEGER   DEFAULT 0,
  max_retries         INTEGER   DEFAULT 3,
  error_message       TEXT,
  screenshot_path     VARCHAR(500),
  started_at          TIMESTAMP,
  completed_at        TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_jobs_status      ON crm_write_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crm_jobs_submission  ON crm_write_jobs(submission_id);
CREATE INDEX IF NOT EXISTS idx_crm_jobs_created_at  ON crm_write_jobs(created_at);
