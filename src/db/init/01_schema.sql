CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS subreddits (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  reddit_id TEXT UNIQUE NOT NULL,
  subreddit_id INT NOT NULL REFERENCES subreddits(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  author TEXT,
  url TEXT,
  permalink TEXT,
  selftext TEXT,
  created_utc TIMESTAMPTZ NOT NULL,
  score INT DEFAULT 0,
  num_comments INT DEFAULT 0,
  over_18 BOOLEAN DEFAULT FALSE,
  flair TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_subreddit_id ON posts(subreddit_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_utc ON posts(created_utc DESC);

CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  reddit_id TEXT UNIQUE NOT NULL,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author TEXT,
  body TEXT,
  score INT DEFAULT 0,
  created_utc TIMESTAMPTZ NOT NULL,
  parent_id TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_utc ON comments(created_utc DESC);

CREATE TABLE IF NOT EXISTS searches (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  time_range TEXT,
  platforms TEXT[],
  subreddits TEXT[],
  params JSONB,
  result_count INT DEFAULT 0,
  fetch_comments BOOLEAN DEFAULT FALSE,
  comment_limit INT DEFAULT 0,
  comment_sort TEXT
);

CREATE TABLE IF NOT EXISTS search_posts (
  search_id BIGINT NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (search_id, post_id)
);

CREATE TABLE IF NOT EXISTS trends (
  id BIGSERIAL PRIMARY KEY,
  search_id BIGINT NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  count INT NOT NULL,
  tier TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trend_posts (
  trend_id BIGINT NOT NULL REFERENCES trends(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (trend_id, post_id)
);