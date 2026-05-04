ALTER TABLE public.inspiration_searches
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS ad_type TEXT NOT NULL DEFAULT 'EMPLOYMENT_ADS',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'meta_ad_library',
  ADD COLUMN IF NOT EXISTS sort_mode TEXT,
  ADD COLUMN IF NOT EXISTS source_filters JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.inspiration_items
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'meta_ad_library',
  ADD COLUMN IF NOT EXISTS media_preview_url TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_url TEXT,
  ADD COLUMN IF NOT EXISTS publisher_platforms TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hook_text TEXT,
  ADD COLUMN IF NOT EXISTS hook_category TEXT,
  ADD COLUMN IF NOT EXISTS is_hook_candidate BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_inspiration_searches_source_scope
  ON public.inspiration_searches (lower(query), country, media_type, ad_type, source_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inspiration_items_external_id
  ON public.inspiration_items (external_id);

CREATE INDEX IF NOT EXISTS idx_inspiration_items_hook_category
  ON public.inspiration_items (hook_category);

CREATE INDEX IF NOT EXISTS idx_inspiration_items_platforms
  ON public.inspiration_items USING GIN (publisher_platforms);