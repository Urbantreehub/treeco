-- Social media & marketing programme.
--
-- Lets the office compose posts (caption + photos + a call-to-action link back
-- to our site), schedule them, and auto-publish to every connected channel —
-- Facebook Page, Instagram, Google Business Profile and LinkedIn. Blog posts get
-- a public landing page (/blog/:slug) and, when published, auto-create a social
-- post that links back to it with the cover photo + a CTA.
--
-- Three tables:
--   social_connections — one row per connected channel (OAuth tokens), mirrors
--                        xero_connections (single-org app).
--   blog_posts         — lightweight blog CMS with a public slug page.
--   marketing_posts    — the composed/scheduled/published social posts + results.
--
-- Auto-posting starts PAUSED (app_settings.marketing_autopost_enabled = false),
-- exactly like the DBS portal sync, so nothing goes out until channels are
-- connected and it's deliberately switched on.

-- ── social_connections ─────────────────────────────────────────────────────
-- platform ∈ ('facebook','instagram','google_business','linkedin'). One row per
-- platform (single-org app). access_token/refresh_token are provider tokens;
-- account_id / account_name identify the Page / IG user / GBP location / LI org.
CREATE TABLE IF NOT EXISTS social_connections (
  platform      TEXT PRIMARY KEY
                CHECK (platform IN ('facebook','instagram','google_business','linkedin')),
  account_id    TEXT,                 -- Page id / IG user id / GBP location name / LI URN
  account_name  TEXT,                 -- human label shown in Settings
  access_token  TEXT NOT NULL,
  refresh_token TEXT,                 -- only Google issues a refresh token
  expires_at    TIMESTAMPTZ,          -- when access_token expires (re-connect after)
  meta          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- e.g. IG business id, GBP account
  connected_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── blog_posts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,          -- URL segment: /blog/:slug
  title           TEXT NOT NULL,
  excerpt         TEXT,                          -- short summary / meta description
  body            TEXT NOT NULL DEFAULT '',      -- plain text / light markdown
  cover_image_url TEXT,                          -- hero image (also used on social)
  status          TEXT NOT NULL DEFAULT 'draft'  -- draft | published
                  CHECK (status IN ('draft','published')),
  published_at    TIMESTAMPTZ,
  author          TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status, published_at DESC);

-- ── marketing_posts ─────────────────────────────────────────────────────────
-- status lifecycle:
--   draft      — being composed
--   scheduled  — has scheduled_at in the future, waiting for the scheduler
--   publishing — the scheduler/publish function has picked it up (lock)
--   published  — went out to every selected platform successfully
--   partial    — some platforms succeeded, some failed (see results)
--   failed     — every platform failed
CREATE TABLE IF NOT EXISTS marketing_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL DEFAULT 'post'   -- post | blog (blog = auto-created from a blog_post)
                CHECK (kind IN ('post','blog')),
  blog_id       UUID REFERENCES blog_posts(id) ON DELETE SET NULL,
  title         TEXT,                          -- internal label / blog title
  body          TEXT NOT NULL DEFAULT '',      -- the caption / message
  link_url      TEXT,                          -- call-to-action link (back to our site)
  cta_label     TEXT,                          -- e.g. 'Get a free quote' (GBP button text)
  image_urls    JSONB NOT NULL DEFAULT '[]'::jsonb,   -- public URLs of attached photos
  platforms     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- target platform keys
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','scheduled','publishing','published','partial','failed')),
  scheduled_at  TIMESTAMPTZ,                    -- when to publish (null = now/manual)
  published_at  TIMESTAMPTZ,
  results       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { platform: {ok, id?, url?, error?} }
  error         TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Scheduler scans by (status, scheduled_at) — index it.
CREATE INDEX IF NOT EXISTS idx_marketing_posts_due ON marketing_posts(status, scheduled_at);

-- ── updated_at triggers (reuse set_updated_at from schema.sql) ──────────────
DROP TRIGGER IF EXISTS set_updated_at_social_connections ON social_connections;
CREATE TRIGGER set_updated_at_social_connections BEFORE UPDATE ON social_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_blog_posts ON blog_posts;
CREATE TRIGGER set_updated_at_blog_posts BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_marketing_posts ON marketing_posts;
CREATE TRIGGER set_updated_at_marketing_posts BEFORE UPDATE ON marketing_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row level security ──────────────────────────────────────────────────────
-- Staff (full/office) manage everything. Published blog posts are additionally
-- readable by anyone (anon) so the public /blog/:slug page works without login,
-- mirroring the public quote-view / booking pattern.
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_posts    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_connections_staff" ON social_connections;
CREATE POLICY "social_connections_staff" ON social_connections FOR ALL TO authenticated
  USING      ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "marketing_posts_staff" ON marketing_posts;
CREATE POLICY "marketing_posts_staff" ON marketing_posts FOR ALL TO authenticated
  USING      ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

-- Staff manage all blog posts…
DROP POLICY IF EXISTS "blog_posts_staff" ON blog_posts;
CREATE POLICY "blog_posts_staff" ON blog_posts FOR ALL TO authenticated
  USING      ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

-- …and anyone (incl. anon) can read published ones for the public blog page.
DROP POLICY IF EXISTS "blog_posts_public_read" ON blog_posts;
CREATE POLICY "blog_posts_public_read" ON blog_posts FOR SELECT TO anon, authenticated
  USING (status = 'published');

-- ── Public storage bucket for marketing photos ──────────────────────────────
-- Public read is required because Instagram/Google/LinkedIn fetch the image by
-- URL when publishing. Write restricted to full/office (mirrors job-media).
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-media', 'marketing-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "marketing_media_public_read" ON storage.objects;
CREATE POLICY "marketing_media_public_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'marketing-media');

DROP POLICY IF EXISTS "marketing_media_write" ON storage.objects;
CREATE POLICY "marketing_media_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-media' AND (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "marketing_media_delete" ON storage.objects;
CREATE POLICY "marketing_media_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-media' AND (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

-- ── Auto-post feature flag — starts PAUSED (like dbs_sync_enabled) ──────────
INSERT INTO app_settings (key, value) VALUES ('marketing_autopost_enabled', 'false'::jsonb)
  ON CONFLICT (key) DO NOTHING;
