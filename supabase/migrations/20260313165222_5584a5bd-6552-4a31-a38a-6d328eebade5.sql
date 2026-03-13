
-- Create creative_copy_generations table
CREATE TABLE public.creative_copy_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creative_upload_id UUID NOT NULL REFERENCES public.creative_uploads(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  primary_text TEXT,
  headline TEXT,
  alt_headline TEXT,
  cta_suggestion TEXT,
  analysis_notes TEXT,
  status TEXT DEFAULT 'generating',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.creative_copy_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_copy_gens" ON public.creative_copy_generations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_copy_gens" ON public.creative_copy_generations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_copy_gens" ON public.creative_copy_generations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_copy_gens" ON public.creative_copy_generations FOR DELETE TO authenticated USING (true);

-- Create creative_copy_feedback table
CREATE TABLE public.creative_copy_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generation_id UUID NOT NULL REFERENCES public.creative_copy_generations(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('good', 'bad')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.creative_copy_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_copy_feedback" ON public.creative_copy_feedback FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_copy_feedback" ON public.creative_copy_feedback FOR INSERT TO authenticated WITH CHECK (true);
