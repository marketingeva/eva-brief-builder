
-- Add field_statuses column to track per-field/section review status
ALTER TABLE public.client_learning_profiles 
ADD COLUMN IF NOT EXISTS field_statuses jsonb DEFAULT '{}'::jsonb;

-- Add website_analysis_data column to store AI-suggested data separately
ALTER TABLE public.client_learning_profiles 
ADD COLUMN IF NOT EXISTS website_analysis_data jsonb DEFAULT '{}'::jsonb;

-- Add website_analyzed_at timestamp
ALTER TABLE public.client_learning_profiles 
ADD COLUMN IF NOT EXISTS website_analyzed_at timestamptz DEFAULT NULL;
