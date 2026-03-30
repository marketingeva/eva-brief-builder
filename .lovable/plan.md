

# Live Ads - Meta API Integration Plan

## Overview
Build the Live Ads tab with real Meta Marketing API data, showing active campaigns, ad performance, spend, CPL, and status alerts per client.

## Architecture

```text
┌─────────────┐     ┌──────────────────────┐     ┌──────────────┐
│ LiveAdsTab   │────▶│ Edge Function         │────▶│ Meta Marketing│
│ (React)      │     │ fetch-meta-ads        │     │ API v21.0     │
└─────────────┘     └──────────────────────┘     └──────────────┘
```

## Step 1: Store Meta credentials as secrets

Store securely via the secrets tool:
- `META_ACCESS_TOKEN`
- `META_APP_ID`
- `META_APP_SECRET`
- `AD_ACCOUNT_ID`

These will be accessible to edge functions only, never exposed client-side.

## Step 2: Create edge function `fetch-meta-ads`

**File**: `supabase/functions/fetch-meta-ads/index.ts`

The function will:
1. Authenticate the request (verify JWT)
2. Call Meta Marketing API endpoints:
   - `GET /act_{AD_ACCOUNT_ID}/campaigns` — active campaigns with status, budget
   - `GET /act_{AD_ACCOUNT_ID}/insights` — performance metrics (spend, impressions, clicks, conversions, CPL)
   - `GET /act_{AD_ACCOUNT_ID}/ads` — individual ad data with previews
3. Return structured data to the frontend

Key Meta API fields to fetch:
- Campaign: name, status, daily_budget, lifetime_budget, objective
- Insights: spend, impressions, clicks, cpl (cost_per_lead), ctr, reach
- Ads: name, status, creative preview URL, effective_status

## Step 3: Build the LiveAdsTab UI

Replace the placeholder with a full dashboard:

1. **Summary cards** (top row):
   - Total active campaigns
   - Total spend (today/this week)
   - Average CPL
   - Total leads

2. **Campaigns table**:
   - Campaign name, status, budget, spend, leads, CPL
   - Color-coded status: green (active/good CPL), yellow (warning), red (high CPL)
   - Sortable columns

3. **CPL alerts**:
   - Red badge when CPL exceeds a threshold (configurable, default €50)
   - Visual warning indicators per campaign

4. **Refresh button** + auto-refresh indicator
5. **Date range selector** (today, last 7 days, last 30 days)

## Step 4: Add config to `supabase/config.toml`

```toml
[functions.fetch-meta-ads]
verify_jwt = false
```

## Technical Details

- Meta API version: v21.0
- Edge function uses `Deno.env.get()` for all secrets
- Frontend calls via `supabase.functions.invoke('fetch-meta-ads', { body: { dateRange } })`
- Error handling: token expiry detection, rate limit handling, graceful fallbacks
- All amounts displayed in EUR

## Files to create/modify

| File | Action |
|------|--------|
| `supabase/functions/fetch-meta-ads/index.ts` | Create |
| `src/pages/client-workspace/LiveAdsTab.tsx` | Rewrite |
| `supabase/config.toml` | Add function config |

