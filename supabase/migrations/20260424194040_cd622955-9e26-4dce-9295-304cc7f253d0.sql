-- 1. Uitbreiden briefing_rows met multi-value velden
ALTER TABLE public.briefing_rows
  ADD COLUMN IF NOT EXISTS functies text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS locaties text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS creative_image_paths text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

-- Migreer bestaande single values naar arrays
UPDATE public.briefing_rows
SET functies = ARRAY[functie]
WHERE functie IS NOT NULL AND functie <> '' AND (functies IS NULL OR array_length(functies, 1) IS NULL);

UPDATE public.briefing_rows
SET locaties = ARRAY[locatie]
WHERE locatie IS NOT NULL AND locatie <> '' AND (locaties IS NULL OR array_length(locaties, 1) IS NULL);

UPDATE public.briefing_rows
SET creative_image_paths = ARRAY[creative_image_path]
WHERE creative_image_path IS NOT NULL AND creative_image_path <> '' AND (creative_image_paths IS NULL OR array_length(creative_image_paths, 1) IS NULL);

-- 2. Nieuwe tabel voor losse week-briefings (centrale Briefings-pagina)
CREATE TABLE IF NOT EXISTS public.briefings_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now())::integer,
  status text NOT NULL DEFAULT 'draft', -- draft | in_review | approved
  approved_at timestamp with time zone,
  approved_by uuid,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (client_id, week_number, year)
);

ALTER TABLE public.briefings_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_briefings_meta" ON public.briefings_meta
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_briefings_meta" ON public.briefings_meta
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "auth_update_briefings_meta" ON public.briefings_meta
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_briefings_meta" ON public.briefings_meta
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_briefings_meta_updated_at
  BEFORE UPDATE ON public.briefings_meta
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. briefing_rows koppelen aan briefings_meta (optioneel, naast bestaande briefing_id)
ALTER TABLE public.briefing_rows
  ADD COLUMN IF NOT EXISTS meta_briefing_id uuid REFERENCES public.briefings_meta(id) ON DELETE CASCADE;

ALTER TABLE public.briefing_rows
  ALTER COLUMN briefing_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_briefing_rows_meta ON public.briefing_rows(meta_briefing_id);
CREATE INDEX IF NOT EXISTS idx_briefings_meta_week ON public.briefings_meta(year, week_number);