CREATE TABLE IF NOT EXISTS publisher_admin.site_agent_guidance (
  site_id TEXT PRIMARY KEY REFERENCES publisher_admin.sites(site_id) ON DELETE CASCADE,
  instructions TEXT NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 12000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
