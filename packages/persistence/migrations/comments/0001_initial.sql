CREATE SCHEMA IF NOT EXISTS publisher_comments;
REVOKE ALL ON SCHEMA publisher_comments FROM PUBLIC;

CREATE TABLE IF NOT EXISTS publisher_comments.comments (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS comments_approved_slug_created
  ON publisher_comments.comments (slug, status, created_at DESC);

CREATE INDEX IF NOT EXISTS comments_moderation_queue
  ON publisher_comments.comments (status, created_at ASC);

CREATE TABLE IF NOT EXISTS publisher_comments.rate_limits (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count > 0),
  reset_at BIGINT NOT NULL
);
