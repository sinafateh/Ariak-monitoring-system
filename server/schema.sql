CREATE TABLE IF NOT EXISTS app_state (
  workspace_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE app_state ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;

-- Structured workspace records keep projects, panels, and binary images out of
-- the revisioned application state document while retaining the existing API shape.
CREATE TABLE IF NOT EXISTS app_projects (
  workspace_key TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_data JSONB NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(workspace_key, project_id)
);
CREATE INDEX IF NOT EXISTS app_projects_order_idx ON app_projects(workspace_key, position, project_id);

CREATE TABLE IF NOT EXISTS app_project_panels (
  workspace_key TEXT NOT NULL,
  project_id TEXT NOT NULL,
  panel_id TEXT NOT NULL,
  panel_data JSONB NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(workspace_key, project_id, panel_id),
  FOREIGN KEY(workspace_key, project_id) REFERENCES app_projects(workspace_key, project_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS app_project_panels_order_idx ON app_project_panels(workspace_key, project_id, position);

CREATE TABLE IF NOT EXISTS app_project_images (
  workspace_key TEXT NOT NULL,
  project_id TEXT NOT NULL,
  image_id TEXT NOT NULL CHECK (length(image_id) = 64),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('png','jpeg','webp','gif','avif','bmp')),
  image_data BYTEA NOT NULL,
  PRIMARY KEY(workspace_key, project_id, image_id),
  FOREIGN KEY(workspace_key, project_id) REFERENCES app_projects(workspace_key, project_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_workspace_migrations (
  workspace_key TEXT NOT NULL,
  migration_key TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(workspace_key, migration_key)
);

