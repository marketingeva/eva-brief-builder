-- Clean up bad cached inspiration headlines/descriptions so the next refresh produces clean data
UPDATE public.inspiration_items
SET headline = NULL
WHERE headline ~* '^(Bibliotheek-?ID|Library ID|Ad Library ID)[:\s]';

UPDATE public.inspiration_items
SET headline = NULL
WHERE advertiser_name IS NOT NULL
  AND lower(trim(headline)) = lower(trim(advertiser_name));

UPDATE public.inspiration_items
SET description = NULL
WHERE primary_text IS NOT NULL
  AND description IS NOT NULL
  AND position(lower(description) in lower(primary_text)) > 0;