-- Migration 003: Form Assignments
-- Allows forms to be assigned to specific staff users

CREATE TABLE IF NOT EXISTS form_assignments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id     UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(form_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_form_assignments_form_id ON form_assignments(form_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_user_id ON form_assignments(user_id);
