-- Searches: cache per query
CREATE TABLE public.inspiration_searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'NL',
  media_type TEXT NOT NULL DEFAULT 'image',
  result_count INTEGER NOT NULL DEFAULT 0,
  raw_markdown TEXT,
  ai_summary TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inspiration_searches_query ON public.inspiration_searches (lower(query), created_at DESC);

ALTER TABLE public.inspiration_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_inspiration_searches" ON public.inspiration_searches FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_inspiration_searches" ON public.inspiration_searches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_inspiration_searches" ON public.inspiration_searches FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_inspiration_searches" ON public.inspiration_searches FOR DELETE TO authenticated USING (true);

-- Items: individuele ads
CREATE TABLE public.inspiration_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  search_id UUID REFERENCES public.inspiration_searches(id) ON DELETE CASCADE,
  advertiser_name TEXT,
  advertiser_page_url TEXT,
  ad_library_url TEXT,
  image_url TEXT,
  primary_text TEXT,
  headline TEXT,
  cta TEXT,
  media_type TEXT DEFAULT 'image',
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inspiration_items_search ON public.inspiration_items (search_id);

ALTER TABLE public.inspiration_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_inspiration_items" ON public.inspiration_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_inspiration_items" ON public.inspiration_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_inspiration_items" ON public.inspiration_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_inspiration_items" ON public.inspiration_items FOR DELETE TO authenticated USING (true);

-- Favorites: per klant
CREATE TABLE public.inspiration_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID,
  item_id UUID NOT NULL REFERENCES public.inspiration_items(id) ON DELETE CASCADE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, item_id)
);
CREATE INDEX idx_inspiration_favorites_client ON public.inspiration_favorites (client_id);

ALTER TABLE public.inspiration_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_inspiration_favorites" ON public.inspiration_favorites FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_inspiration_favorites" ON public.inspiration_favorites FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_inspiration_favorites" ON public.inspiration_favorites FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_inspiration_favorites" ON public.inspiration_favorites FOR DELETE TO authenticated USING (true);