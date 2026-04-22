-- Add Meta filter and page id to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS meta_name_filter text,
  ADD COLUMN IF NOT EXISTS meta_page_id text;

-- Ad launches history table
CREATE TABLE IF NOT EXISTS public.ad_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campaign_id text,
  adset_id text,
  ad_id text,
  creative_id text,
  lead_form_id text,
  creative_filename text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  launched_by uuid,
  launched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_launches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_ad_launches" ON public.ad_launches
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_ad_launches" ON public.ad_launches
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_ad_launches" ON public.ad_launches
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_ad_launches" ON public.ad_launches
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ad_launches_client_id ON public.ad_launches(client_id);

-- Storage bucket for ad launcher uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-launcher-uploads', 'ad-launcher-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_select_ad_launcher_uploads" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'ad-launcher-uploads');
CREATE POLICY "auth_insert_ad_launcher_uploads" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ad-launcher-uploads');
CREATE POLICY "auth_update_ad_launcher_uploads" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'ad-launcher-uploads');
CREATE POLICY "auth_delete_ad_launcher_uploads" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'ad-launcher-uploads');