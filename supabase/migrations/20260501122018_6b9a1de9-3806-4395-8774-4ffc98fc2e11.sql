ALTER TABLE public.inspiration_items
  ADD COLUMN IF NOT EXISTS advertiser_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS started_running TEXT;