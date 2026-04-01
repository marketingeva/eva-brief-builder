
ALTER TABLE public.briefing_rows ADD COLUMN IF NOT EXISTS creative_image_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('briefing-assets', 'briefing-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_select_briefing_assets" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'briefing-assets');
CREATE POLICY "auth_insert_briefing_assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'briefing-assets');
CREATE POLICY "auth_delete_briefing_assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'briefing-assets');
