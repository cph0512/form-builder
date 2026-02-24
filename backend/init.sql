-- 智慧表單平台 資料庫初始化腳本
-- 執行方式：psql -U postgres -d form_builder -f init.sql

-- 建立資料庫（若尚未建立，請先執行：CREATE DATABASE form_builder;）

-- 使用者角色 ENUM
CREATE TYPE user_role AS ENUM ('super_admin', 'dept_admin', 'manager', 'staff');

-- 部門表
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 使用者表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'staff',
  department_id UUID REFERENCES departments(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 表單定義表
CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  schema JSONB NOT NULL DEFAULT '{"fields": []}',
  crm_mappings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 表單版本控制
CREATE TABLE IF NOT EXISTS form_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES forms(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  schema JSONB NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 表單提交記錄
CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID REFERENCES forms(id),
  submitted_by UUID REFERENCES users(id),
  data JSONB NOT NULL,
  crm_sync_status VARCHAR(50) DEFAULT 'pending',
  crm_sync_log JSONB DEFAULT '[]',
  submitted_at TIMESTAMP DEFAULT NOW()
);

-- 建立預設超級管理員帳號
-- 預設密碼：Admin@1234（上線前請務必修改）
INSERT INTO departments (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', '系統管理部門')
ON CONFLICT DO NOTHING;

INSERT INTO users (id, name, email, password_hash, role, department_id) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '系統管理員',
    'admin@company.com',
    '$2a$10$fq0UJM9diiHKZ8TIqW2FCeh0ZnsIrhjidAYFQzpO6OQBWLe85jcNe', -- Admin@1234
    'super_admin',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT DO NOTHING;

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_forms_created_by ON forms(created_by);
CREATE INDEX IF NOT EXISTS idx_submissions_form_id ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by ON form_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

COMMENT ON TABLE forms IS '表單定義，schema 欄位存放 JSON 格式的欄位結構';
COMMENT ON TABLE form_submissions IS '表單填寫記錄';
