CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at);

CREATE TABLE IF NOT EXISTS app_user_global_permissions (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, permission)
);

CREATE TABLE IF NOT EXISTS app_user_projects (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  granted_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, project_id)
);

CREATE TABLE IF NOT EXISTS app_user_panels (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  panel_id TEXT NOT NULL,
  granted_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, project_id, panel_id),
  FOREIGN KEY(user_id, project_id) REFERENCES app_user_projects(user_id, project_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_user_project_permissions (
  user_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  granted_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, project_id, permission),
  FOREIGN KEY(user_id, project_id) REFERENCES app_user_projects(user_id, project_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  project_id TEXT,
  panel_id TEXT,
  outcome TEXT NOT NULL DEFAULT 'success',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_audit_log_target_created_idx ON app_audit_log(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_audit_log_created_idx ON app_audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS app_panel_settings (
  project_id TEXT NOT NULL,
  panel_id TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  saved_setting_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(project_id, panel_id)
);

DELETE FROM app_sessions WHERE expires_at <= NOW();
