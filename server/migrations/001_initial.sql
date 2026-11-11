CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  request_id TEXT UNIQUE NOT NULL,
  ip_hash TEXT NOT NULL,
  positive_prompt TEXT NOT NULL,
  negative_prompt TEXT,
  model TEXT NOT NULL,
  lora_ids TEXT,
  steps BIGINT DEFAULT 20,
  cfg_scale DOUBLE PRECISION DEFAULT 7.5,
  seed BIGINT,
  width BIGINT DEFAULT 512,
  height BIGINT DEFAULT 512,
  upscaled BIGINT DEFAULT 0,
  image_path TEXT,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint)
);

CREATE TABLE IF NOT EXISTS usage (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  timestamp BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  cost_estimate DOUBLE PRECISION,
  FOREIGN KEY (request_id) REFERENCES prompts(request_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lora_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  base_model TEXT NOT NULL,
  training_images_count BIGINT DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  updated_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint)
);

CREATE TABLE IF NOT EXISTS training_images (
  id BIGSERIAL PRIMARY KEY,
  lora_id TEXT NOT NULL,
  image_path TEXT NOT NULL,
  uploaded_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  FOREIGN KEY (lora_id) REFERENCES lora_models(id)
);

CREATE INDEX IF NOT EXISTS idx_prompts_request_id ON prompts(request_id);
CREATE INDEX IF NOT EXISTS idx_prompts_ip_hash ON prompts(ip_hash);
CREATE INDEX IF NOT EXISTS idx_usage_ip_hash ON usage(ip_hash);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_training_images_lora_id ON training_images(lora_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  session_hash TEXT UNIQUE NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  last_activity BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  type TEXT NOT NULL DEFAULT 'generate',
  params TEXT NOT NULL,
  result TEXT,
  progress BIGINT DEFAULT 0,
  progress_message TEXT,
  error_message TEXT,
  original_prompt TEXT,
  enhanced_prompt TEXT,
  safety_flags TEXT,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  updated_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  completed_at BIGINT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  request_id TEXT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  positive_prompt TEXT NOT NULL,
  negative_prompt TEXT,
  model TEXT NOT NULL,
  lora_ids TEXT,
  steps BIGINT DEFAULT 20,
  cfg_scale DOUBLE PRECISION DEFAULT 7.5,
  seed BIGINT,
  width BIGINT DEFAULT 512,
  height BIGINT DEFAULT 512,
  upscaled BIGINT DEFAULT 0,
  image_path TEXT,
  metadata_json TEXT,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS session_preferences (
  session_id TEXT PRIMARY KEY,
  default_model TEXT DEFAULT 'sd15',
  ui_mode TEXT DEFAULT 'intermediate',
  experience_level TEXT DEFAULT 'beginner',
  preferred_resolution TEXT DEFAULT '512x512',
  updated_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  last_login BIGINT,
  is_active BIGINT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  default_model TEXT DEFAULT 'sd15',
  ui_mode TEXT DEFAULT 'intermediate',
  experience_level TEXT DEFAULT 'beginner',
  preferred_resolution TEXT DEFAULT '512x512',
  updated_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(session_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_ip ON sessions(ip_hash);
CREATE INDEX IF NOT EXISTS idx_jobs_session ON jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_generations_session ON generations(session_id);
CREATE INDEX IF NOT EXISTS idx_generations_job ON generations(job_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS ml_inference_results (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  inference_type TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output_json TEXT NOT NULL,
  latency_ms DOUBLE PRECISION NOT NULL,
  device TEXT NOT NULL,
  quantized BIGINT DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  s3_path TEXT
);

CREATE TABLE IF NOT EXISTS ml_model_metrics (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  timestamp BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint)
);

CREATE TABLE IF NOT EXISTS ml_ab_test_assignments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  model_version_a TEXT NOT NULL,
  model_version_b TEXT NOT NULL,
  assigned_version TEXT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS ml_user_feedback (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  inference_result_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  feedback_value DOUBLE PRECISION,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (inference_result_id) REFERENCES ml_inference_results(id)
);

CREATE TABLE IF NOT EXISTS ml_model_versions (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  version TEXT NOT NULL,
  s3_path TEXT NOT NULL,
  format TEXT NOT NULL,
  size_bytes BIGINT,
  checksum TEXT,
  is_active BIGINT DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now())::bigint),
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_ml_inference_model ON ml_inference_results(model_id);
CREATE INDEX IF NOT EXISTS idx_ml_inference_timestamp ON ml_inference_results(created_at);
CREATE INDEX IF NOT EXISTS idx_ml_metrics_model ON ml_model_metrics(model_id);
CREATE INDEX IF NOT EXISTS idx_ml_metrics_timestamp ON ml_model_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_ml_ab_test_session ON ml_ab_test_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_ml_feedback_session ON ml_user_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_ml_feedback_inference ON ml_user_feedback(inference_result_id);
CREATE INDEX IF NOT EXISTS idx_ml_versions_model ON ml_model_versions(model_id);
CREATE INDEX IF NOT EXISTS idx_ml_versions_active ON ml_model_versions(is_active);
