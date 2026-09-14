CREATE TABLE IF NOT EXISTS publisher_admin.sites (
  site_id TEXT PRIMARY KEY CHECK (site_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  canonical_origin TEXT NOT NULL,
  theme_id TEXT NOT NULL DEFAULT 'editorial',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publisher_admin.site_administrators (
  site_id TEXT NOT NULL REFERENCES publisher_admin.sites(site_id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES publisher_admin.accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site_id, account_id)
);

INSERT INTO publisher_admin.sites (site_id, name, canonical_origin, theme_id)
SELECT
  state.site_id,
  COALESCE(NULLIF(state.state #>> '{settings,name}', ''), 'Publication'),
  COALESCE(NULLIF(state.state #>> '{settings,canonicalOrigin}', ''), 'https://publisher.com'),
  COALESCE(NULLIF(state.state #>> '{settings,themeId}', ''), 'editorial')
FROM publisher_admin.site_states AS state
ON CONFLICT (site_id) DO NOTHING;

INSERT INTO publisher_admin.sites (site_id, name, canonical_origin, theme_id)
VALUES ('default', 'Publication', 'https://publisher.com', 'editorial')
ON CONFLICT (site_id) DO NOTHING;
