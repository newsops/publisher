CREATE TABLE IF NOT EXISTS publisher_admin.accounts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'publisher', 'editor')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_unique
  ON publisher_admin.accounts (LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS accounts_single_owner
  ON publisher_admin.accounts (role)
  WHERE role = 'owner';

CREATE TABLE IF NOT EXISTS publisher_admin.account_sessions (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES publisher_admin.accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS account_sessions_active
  ON publisher_admin.account_sessions (account_id, expires_at)
  WHERE revoked_at IS NULL;
