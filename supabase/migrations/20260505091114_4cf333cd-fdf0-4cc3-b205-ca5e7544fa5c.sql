ALTER TABLE public.inspiration_favorites
  ADD CONSTRAINT inspiration_favorites_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.inspiration_favorites DROP CONSTRAINT IF EXISTS inspiration_favorites_item_id_fkey;
ALTER TABLE public.inspiration_favorites ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE public.inspiration_favorites
  ADD CONSTRAINT inspiration_favorites_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.inspiration_items(id) ON DELETE SET NULL;

ALTER TABLE public.inspiration_favorites
  ADD COLUMN IF NOT EXISTS advertiser_name      text,
  ADD COLUMN IF NOT EXISTS advertiser_logo_url  text,
  ADD COLUMN IF NOT EXISTS advertiser_page_url  text,
  ADD COLUMN IF NOT EXISTS primary_text         text,
  ADD COLUMN IF NOT EXISTS headline             text,
  ADD COLUMN IF NOT EXISTS description          text,
  ADD COLUMN IF NOT EXISTS cta                  text,
  ADD COLUMN IF NOT EXISTS image_url            text,
  ADD COLUMN IF NOT EXISTS video_url            text,
  ADD COLUMN IF NOT EXISTS media_preview_url    text,
  ADD COLUMN IF NOT EXISTS media_urls           text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS media_type           text,
  ADD COLUMN IF NOT EXISTS publisher_platforms  text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ad_library_url       text,
  ADD COLUMN IF NOT EXISTS external_id          text,
  ADD COLUMN IF NOT EXISTS started_running      text,
  ADD COLUMN IF NOT EXISTS raw_payload          jsonb DEFAULT '{}'::jsonb;

UPDATE public.inspiration_favorites f
SET advertiser_name     = i.advertiser_name,
    advertiser_logo_url = i.advertiser_logo_url,
    advertiser_page_url = i.advertiser_page_url,
    primary_text        = i.primary_text,
    headline            = i.headline,
    description         = i.description,
    cta                 = i.cta,
    image_url           = i.image_url,
    video_url           = i.video_url,
    media_preview_url   = i.media_preview_url,
    media_urls          = COALESCE(i.media_urls, '{}'::text[]),
    media_type          = i.media_type,
    publisher_platforms = COALESCE(i.publisher_platforms, '{}'::text[]),
    ad_library_url      = i.ad_library_url,
    external_id         = i.external_id,
    started_running     = i.started_running,
    raw_payload         = COALESCE(i.raw_payload, '{}'::jsonb)
FROM public.inspiration_items i
WHERE i.id = f.item_id
  AND f.advertiser_name IS NULL;