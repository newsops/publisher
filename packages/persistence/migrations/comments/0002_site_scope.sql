ALTER TABLE publisher_comments.comments
  ADD COLUMN IF NOT EXISTS site_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS comments_site_approved_slug_created
  ON publisher_comments.comments (site_id, slug, status, created_at DESC);

CREATE INDEX IF NOT EXISTS comments_site_moderation_queue
  ON publisher_comments.comments (site_id, status, created_at ASC);
