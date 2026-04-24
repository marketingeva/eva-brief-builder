## Plan

1. Verify the created ad creative against the backend API
- Read back one of the newly created creatives/ad IDs after launch and inspect the stored fields that matter for bundled text variants: `object_story_spec`, `creative_asset_groups_spec`, `asset_feed_spec`, and any delivery/enrollment fields related to flexible ads.
- Confirm whether Meta is actually saving the extra text variants or silently falling back to the first variant only.

2. Correct the ad creative payload for Meta’s accepted flexible-ad structure
- Update `supabase/functions/meta-upload-creative/index.ts` so the multiple-text path uses the exact payload shape Meta persists for standard lead ads.
- Keep the single-variant fallback path intact.
- If required by Meta for this ad type, add the missing creative enrollment/config fields so the ad is treated as a flexible ad instead of a plain single-text creative.

3. Add launch-time diagnostics so failures stop being guesswork
- Expand the function response and server logs to capture the created creative ID plus the important returned creative fields from Meta.
- Record a compact debug snapshot in the launch history table when a launch succeeds or fails, so it’s clear whether the issue is payload acceptance, silent field stripping, or UI rendering.

4. Update the ad detail reader so the app reflects bundled variants correctly
- Update `supabase/functions/fetch-meta-ads/index.ts` to parse `creative_asset_groups_spec` in addition to `object_story_spec` and `asset_feed_spec`.
- Return all available text variants, not just the first visible fallback text, so internal previews and debugging match what was actually created.

5. Validate the full flow end-to-end
- Relaunch a test ad with 3 primary texts, 3 headlines, and 3 descriptions.
- Confirm the created creative contains the bundled variants and that Meta shows them as extra options in the editor, not only the first fallback text.
- Confirm the app’s own readback/debug views show the same variant counts.

## Technical details
- Files involved:
  - `supabase/functions/meta-upload-creative/index.ts`
  - `supabase/functions/fetch-meta-ads/index.ts`
  - likely one new migration to extend `ad_launches` with debug columns such as returned creative payload / variant counts
- Current finding: the launch function is succeeding and returning ad IDs, but the current implementation only proves the ad was created, not that Meta persisted the bundled text options.
- Current code also only reads `asset_feed_spec` and `object_story_spec` in the ad detail fetcher, so even valid flexible-ad variants would currently be under-reported inside the app.
- I’ll preserve the existing one-ad-per-file behavior and only change the creative payload path for multi-variant launches.

## Expected result
Launching one creative with multiple primary texts/headlines/descriptions will still create one ad, but that ad will genuinely contain the bundled text options and those options will be verifiable both in Meta and inside the app.