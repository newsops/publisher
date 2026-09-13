CREATE TABLE IF NOT EXISTS publisher_admin.archive_restore_operations (
  operation_id UUID PRIMARY KEY,
  site_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  archive_digest TEXT NOT NULL CHECK (archive_digest ~ '^[a-f0-9]{64}$'),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (site_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS archive_restore_operations_site_created
  ON publisher_admin.archive_restore_operations (site_id, created_at DESC);
