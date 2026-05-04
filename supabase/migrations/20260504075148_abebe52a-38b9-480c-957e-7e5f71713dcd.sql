ALTER TABLE public.inspiration_items
  ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS description text;