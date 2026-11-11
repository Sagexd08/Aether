ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  count BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

CREATE TABLE IF NOT EXISTS guard_events (
  id BIGSERIAL PRIMARY KEY,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  reason TEXT NOT NULL,
  session_id TEXT,
  ip_hash TEXT,
  request_id TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_guard_events_created ON guard_events(created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  ip_hash TEXT,
  request_id TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_session_status ON jobs(session_id, status);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ip_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_ip_status ON jobs(ip_hash, status);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
