CREATE TABLE public.saved_inspiration_hooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  location_id UUID NULL REFERENCES public.client_locations(id) ON DELETE SET NULL,
  location_label TEXT NULL,
  role_query TEXT NOT NULL,
  hook_text TEXT NOT NULL,
  hook_category TEXT NULL,
  rationale TEXT NULL,
  notes TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_inspiration_hooks_client ON public.saved_inspiration_hooks(client_id);
CREATE INDEX idx_saved_inspiration_hooks_created_at ON public.saved_inspiration_hooks(created_at DESC);

ALTER TABLE public.saved_inspiration_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_saved_hooks" ON public.saved_inspiration_hooks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_saved_hooks" ON public.saved_inspiration_hooks
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_saved_hooks" ON public.saved_inspiration_hooks
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_saved_hooks" ON public.saved_inspiration_hooks
  FOR DELETE TO authenticated USING (true);