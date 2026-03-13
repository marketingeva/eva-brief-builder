
-- Phase A: Client-first rebuild schema

-- 1. Add columns to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS mission text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS vision text;

-- 2. Create client_learning_profiles (replaces client_brand_profiles conceptually)
CREATE TABLE public.client_learning_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL UNIQUE,
  tone_of_voice text,
  communication_guidelines text,
  employer_branding text,
  why_work_here text,
  strategic_recruitment_goals text,
  care_types text[] DEFAULT '{}',
  words_to_use text[] DEFAULT '{}',
  words_to_avoid text[] DEFAULT '{}',
  creative_dos text[] DEFAULT '{}',
  creative_donts text[] DEFAULT '{}',
  visual_style_notes text,
  internal_notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_learning_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_learning_profiles" ON public.client_learning_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_learning_profiles" ON public.client_learning_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_learning_profiles" ON public.client_learning_profiles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_learning_profiles" ON public.client_learning_profiles FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_learning_profiles_updated_at BEFORE UPDATE ON public.client_learning_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Client USPs
CREATE TABLE public.client_usps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  usp_text text NOT NULL,
  sort_order int DEFAULT 0
);

ALTER TABLE public.client_usps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_usps" ON public.client_usps FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_usps" ON public.client_usps FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_usps" ON public.client_usps FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_usps" ON public.client_usps FOR DELETE TO authenticated USING (true);

-- 4. Client learning assets (file uploads)
CREATE TABLE public.client_learning_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  asset_category text NOT NULL DEFAULT 'other',
  notes text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_learning_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_learning_assets" ON public.client_learning_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_learning_assets" ON public.client_learning_assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_delete_learning_assets" ON public.client_learning_assets FOR DELETE TO authenticated USING (true);

-- 5. Add columns to client_locations
ALTER TABLE public.client_locations ADD COLUMN IF NOT EXISTS recruitment_region text;

-- 6. Add columns to client_roles
ALTER TABLE public.client_roles ADD COLUMN IF NOT EXISTS hours_type text DEFAULT 'flexible';
ALTER TABLE public.client_roles ADD COLUMN IF NOT EXISTS employment_type text DEFAULT 'loondienst';

-- 7. Briefing requests (richer version)
CREATE TABLE public.briefing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  created_by uuid NOT NULL,
  functions text[] DEFAULT '{}',
  location text,
  hours_type text DEFAULT 'flexible',
  employment_type text DEFAULT 'loondienst',
  target_audience text,
  care_type text,
  cta text,
  usps text,
  num_variations int DEFAULT 1,
  style text,
  request_type text DEFAULT 'one_vacancy',
  creative_type text DEFAULT 'static',
  priority text DEFAULT 'balanced',
  extra_notes text,
  hard_requirements text,
  words_to_avoid text,
  is_new_concept boolean DEFAULT true,
  reference_file_path text,
  status text DEFAULT 'concept',
  week_number int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.briefing_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_briefing_requests" ON public.briefing_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_briefing_requests" ON public.briefing_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "auth_update_briefing_requests" ON public.briefing_requests FOR UPDATE TO authenticated USING (true);

-- 8. Add week_number and requested_by to generated_briefings
ALTER TABLE public.generated_briefings ADD COLUMN IF NOT EXISTS week_number int;
ALTER TABLE public.generated_briefings ADD COLUMN IF NOT EXISTS requested_by uuid;

-- 9. Briefing rows (spreadsheet-style)
CREATE TABLE public.briefing_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id uuid REFERENCES public.generated_briefings(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  is_new boolean DEFAULT true,
  functie text,
  locatie text,
  hook text,
  usps text,
  omschrijving text,
  creative_inspiratie text,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.briefing_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_briefing_rows" ON public.briefing_rows FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_briefing_rows" ON public.briefing_rows FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_briefing_rows" ON public.briefing_rows FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_briefing_rows" ON public.briefing_rows FOR DELETE TO authenticated USING (true);

-- 10. Creative uploads
CREATE TABLE public.creative_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  briefing_id uuid REFERENCES public.generated_briefings(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  creative_type text DEFAULT 'static',
  notes text,
  status text DEFAULT 'uploaded',
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creative_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_creative_uploads" ON public.creative_uploads FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_creative_uploads" ON public.creative_uploads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_creative_uploads" ON public.creative_uploads FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_creative_uploads" ON public.creative_uploads FOR DELETE TO authenticated USING (true);

-- 11. Copy suggestions
CREATE TABLE public.copy_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  creative_upload_id uuid REFERENCES public.creative_uploads(id) ON DELETE CASCADE NOT NULL,
  primary_text text[] DEFAULT '{}',
  headlines text[] DEFAULT '{}',
  cta_suggestions text[] DEFAULT '{}',
  analysis_notes text,
  status text DEFAULT 'generated',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.copy_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_copy_suggestions" ON public.copy_suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_copy_suggestions" ON public.copy_suggestions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_copy_suggestions" ON public.copy_suggestions FOR UPDATE TO authenticated USING (true);

-- 12. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('learning-assets', 'learning-assets', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('creative-uploads', 'creative-uploads', false) ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "auth_upload_learning_assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'learning-assets');
CREATE POLICY "auth_read_learning_assets" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'learning-assets');
CREATE POLICY "auth_delete_learning_assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'learning-assets');

CREATE POLICY "auth_upload_creative_uploads" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'creative-uploads');
CREATE POLICY "auth_read_creative_uploads" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'creative-uploads');
CREATE POLICY "auth_delete_creative_uploads" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'creative-uploads');
