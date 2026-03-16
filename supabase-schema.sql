-- RSS Reader — run this once in your Supabase project's SQL Editor
-- Supabase Dashboard → SQL Editor → New Query → paste → Run

-- ─────────────────────────────────────────
-- feeds: one row per user per RSS feed URL
-- ─────────────────────────────────────────
CREATE TABLE feeds (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  url         TEXT        NOT NULL,
  title       TEXT        NOT NULL DEFAULT '',
  description TEXT        DEFAULT '',
  link        TEXT        DEFAULT '',
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, url)
);

ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own feeds"
  ON feeds
  USING       (auth.uid() = user_id)
  WITH CHECK  (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- read_items: tracks which articles each user has read
-- item_id = guid / link / title from the RSS item
-- ─────────────────────────────────────────
CREATE TABLE read_items (
  user_id  UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_id  TEXT        NOT NULL,
  read_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

ALTER TABLE read_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own read items"
  ON read_items
  USING       (auth.uid() = user_id)
  WITH CHECK  (auth.uid() = user_id);
