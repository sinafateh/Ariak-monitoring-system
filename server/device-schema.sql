CREATE TABLE IF NOT EXISTS esp_pairing_tokens (
  token_hash BYTEA PRIMARY KEY CHECK (octet_length(token_hash) = 32),
  device_name TEXT NOT NULL DEFAULT '' CHECK (length(device_name) <= 100),
  project_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS esp_devices (
  device_id TEXT PRIMARY KEY CHECK (length(device_id) BETWEEN 3 AND 80),
  name TEXT NOT NULL CHECK (length(name) <= 100),
  project_id TEXT,
  token_hash BYTEA NOT NULL CHECK (octet_length(token_hash) = 32),
  firmware_version TEXT CHECK (firmware_version IS NULL OR length(firmware_version) <= 64),
  last_seen_at TIMESTAMPTZ,
  last_ip INET,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

ALTER TABLE esp_devices ADD COLUMN IF NOT EXISTS history_cleared_at TIMESTAMPTZ;
ALTER TABLE esp_devices ADD COLUMN IF NOT EXISTS commands_cleared_at TIMESTAMPTZ;
ALTER TABLE esp_devices ADD COLUMN IF NOT EXISTS messages_cleared_at TIMESTAMPTZ;
UPDATE esp_devices
SET commands_cleared_at = COALESCE(commands_cleared_at, history_cleared_at),
    messages_cleared_at = COALESCE(messages_cleared_at, history_cleared_at)
WHERE history_cleared_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS esp_commands (
  id UUID PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES esp_devices(device_id),
  command TEXT NOT NULL CHECK (length(command) BETWEEN 1 AND 256),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'completed', 'failed', 'expired')),
  response TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS esp_chat_messages (
  id UUID PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES esp_devices(device_id),
  client_message_id TEXT,
  sender TEXT NOT NULL CHECK (sender IN ('web', 'device')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  UNIQUE (device_id, client_message_id)
);

CREATE INDEX IF NOT EXISTS esp_devices_last_seen_idx ON esp_devices (last_seen_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS esp_commands_queue_idx ON esp_commands (device_id, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS esp_commands_history_idx ON esp_commands (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS esp_pairing_expiry_idx ON esp_pairing_tokens (expires_at);
CREATE INDEX IF NOT EXISTS esp_chat_queue_idx ON esp_chat_messages (device_id, created_at) WHERE sender = 'web' AND delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS esp_chat_history_idx ON esp_chat_messages (device_id, created_at DESC);
