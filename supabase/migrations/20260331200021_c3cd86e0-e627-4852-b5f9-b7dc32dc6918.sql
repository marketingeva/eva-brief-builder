ALTER TABLE public.agent_reports
ADD COLUMN report_source text NOT NULL DEFAULT 'manual',
ADD COLUMN pdf_path text,
ADD COLUMN title text;