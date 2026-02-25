-- M-10: 業務知識庫
-- 儲存產品資訊、FAQ、政策等，供 LINE Bot AI 搜尋使用

CREATE TABLE IF NOT EXISTS knowledge_base (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  title       VARCHAR(300) NOT NULL,
  content     TEXT NOT NULL,
  category    VARCHAR(50)  DEFAULT 'general',  -- product/faq/policy/price/general
  tags        TEXT[]       DEFAULT '{}',
  source_type VARCHAR(20)  DEFAULT 'manual',   -- manual/image/csv/excel/pdf
  source_file VARCHAR(500),                     -- 原始檔案名稱（若有上傳）
  is_active   BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_active   ON knowledge_base(is_active);
CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_kb_created  ON knowledge_base(created_at DESC);
