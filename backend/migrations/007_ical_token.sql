-- M-09: 行事曆訂閱 Token
-- 每個 user 有獨立的 UUID token，用於 iCal 訂閱連結驗證（不需要 JWT）

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ical_token UUID DEFAULT gen_random_uuid();

-- 為現有 user 補上 token
UPDATE users SET ical_token = gen_random_uuid() WHERE ical_token IS NULL;
