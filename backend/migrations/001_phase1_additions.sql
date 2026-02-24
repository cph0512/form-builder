-- Phase 1 補充 Migration
-- 執行方式：psql -U postgres -d form_builder -f migrations/001_phase1_additions.sql

-- 稽核日誌表
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,           -- 例：user.create, form.toggle, dept.delete
  entity_type VARCHAR(50),                -- 例：user, form, department
  entity_id UUID,
  details JSONB DEFAULT '{}',             -- 操作的額外資訊
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

COMMENT ON TABLE audit_logs IS '系統操作稽核日誌';
