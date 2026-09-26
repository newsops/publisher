CREATE SCHEMA IF NOT EXISTS publisher_admin;
REVOKE ALL ON SCHEMA publisher_admin FROM PUBLIC;

CREATE TABLE IF NOT EXISTS publisher_admin.site_states (
  site_id TEXT PRIMARY KEY CHECK (site_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  state JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publisher_admin.articles (
  site_id TEXT NOT NULL,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site_id, id)
);

CREATE TABLE IF NOT EXISTS publisher_admin.plugin_installations (
  site_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site_id, plugin_id)
);

CREATE TABLE IF NOT EXISTS publisher_admin.media (
  id UUID PRIMARY KEY,
  site_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected')),
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (site_id, sha256)
);

CREATE INDEX IF NOT EXISTS media_site_state_updated
  ON publisher_admin.media (site_id, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS publisher_admin.release_records (
  release_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  snapshot_key TEXT,
  checksum TEXT NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS releases_site_created
  ON publisher_admin.release_records (site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS publisher_admin.build_jobs (
  job_id UUID PRIMARY KEY,
  site_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  snapshot_checksum TEXT NOT NULL CHECK (snapshot_checksum ~ '^[a-f0-9]{64}$'),
  snapshot_key TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'verifying', 'ready', 'published', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (site_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS build_jobs_queue
  ON publisher_admin.build_jobs (status, created_at ASC);

CREATE TABLE IF NOT EXISTS publisher_admin.audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
