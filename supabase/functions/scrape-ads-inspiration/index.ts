import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_GRAPH_ADS_ARCHIVE = "https://graph.facebook.com/v20.0/ads_archive";
const ADS_LIBRARY_BASE = "https://www.facebook.com/ads/library/";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const FIXED_QUERY = "Verzorgende IG";
const FIXED_COUNTRY = "NL";
const FIXED_MEDIA_TYPE = "all";
const FIXED_AD_TYPE = "EMPLOYMENT_ADS";
const FIXED_SOURCE_TYPE = "meta_ad_library";
const FIXED_SORT_MODE = "total_impressions_desc";

interface ParsedItem {
  advertiser_name?: string;
  advertiser_page_url?: string;
  advertiser_logo_url?: string;
  ad_library_url?: string;
  image_url?: string;
  media_preview_url?: string;
  video_url?: string;
  snapshot_url?: string;
  primary_text?: string;
  headline?: string;
  cta?: string;
  external_id?: string;
  started_running?: string;
  publisher_platforms?: string[];
  hook_text?: string;
  hook_category?: string;
  is_hook_candidate?: boolean;
  raw_payload?: Record<string, unknown>;
}

function normalizeText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\\u0040/g, "@")
    .replace(/\\\//g, "/");
}

function stripTags(s: string): string {
  return decodeHtml(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr.filter(Boolean as unknown as (value: T) => boolean))];
}

function buildAdsLibraryUrl(): string {
  const params = new URLSearchParams();
  params.set("active_status", "active");
  params.set("ad_type", "employment_ads");
  params.set("country", FIXED_COUNTRY);
  params.set("is_targeted_country", "false");
  params.set("media_type", FIXED_MEDIA_TYPE);
  params.set("q", FIXED_QUERY);
  params.set("search_type", "keyword_unordered");
  params.set("sort_data[direction]", "desc");
  params.set("sort_data[mode]", "total_impressions");
  return `${ADS_LIBRARY_BASE}?${params.toString()}`;
}

function buildMetaArchiveUrl(accessToken: string): string {
  const params = new URLSearchParams({
    access_token: accessToken,
    search_terms: FIXED_QUERY,
    ad_reached_countries: JSON.stringify([FIXED_COUNTRY]),
    ad_type: FIXED_AD_TYPE,
    media_type: "ALL",
    ad_active_status: "ACTIVE",
    search_type: "KEYWORD_UNORDERED",
    limit: "60",
    fields: [
      "id",
      "page_id",
      "page_name",
      "ad_snapshot_url",
      "ad_delivery_start_time",
      "ad_creative_bodies",
      "ad_creative_link_titles",
      "ad_creative_link_descriptions",
      "ad_creative_link_captions",
      "publisher_platforms",
    ].join(","),
  });
  return `${META_GRAPH_ADS_ARCHIVE}?${params.toString()}`;
}

function getHookCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/(collega|team|samen|hecht team|gezellig)/i.test(lower)) return "Collega's & team";
  if (/(waardering|gezien|gewaardeerd|erkenning)/i.test(lower)) return "Waardering";
  if (/(flexibel|eigen rooster|uren|parttime|fulltime|dienstrooster|werk\-privé|werk privé)/i.test(lower)) return "Flexibiliteit";
  if (/(groei|ontwikkeling|opleiding|leren|doorgroeien|carrière)/i.test(lower)) return "Ontwikkeling";
  if (/(betekenis|verschil|impact|zorg hart|iets betekenen|van waarde)/i.test(lower)) return "Betekenisvol werk";
  if (/(salaris|bonus|toeslag|verdien|vakantie|contract)/i.test(lower)) return "Voorwaarden";
  return "Algemene hook";
}

function extractHookText(text: string): string | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 18);

  const preferred = sentences.find((part) =>
    /\?|!|kom werken|word jij|ben jij|jouw|jij|werken bij|solliciteer|vacature|verzorgende ig/i.test(part)
  );

  const hook = preferred || sentences[0] || normalized.slice(0, 160);
  return hook.length > 170 ? `${hook.slice(0, 167).trim()}…` : hook;
}

async function enrichSnapshot(snapshotUrl: string): Promise<Partial<ParsedItem>> {
  try {
    const resp = await fetch(snapshotUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; LovableBot/1.0)",
      },
    });

    if (!resp.ok) {
      console.error(`Snapshot fetch failed [${resp.status}] for ${snapshotUrl}`);
      return {};
    }

    const html = await resp.text();
    const ogImage = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const ogVideo = html.match(/property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const posterImage = html.match(/property=["']og:image:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const headline = html.match(/property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const description = html.match(/property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const videoTag = html.match(/<video[^>]+src=["']([^"']+)["']/i)?.[1];
    const imgCandidates = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)).map((m) => decodeHtml(m[1]));
    const bestImage = imgCandidates.find((url) => /scontent|fbcdn|jpg|png|webp/i.test(url));

    return {
      image_url: decodeHtml(ogImage || posterImage || bestImage || "") || undefined,
      media_preview_url: decodeHtml(ogImage || posterImage || bestImage || "") || undefined,
      video_url: decodeHtml(ogVideo || videoTag || "") || undefined,
      headline: normalizeText(decodeHtml(headline || "")) || undefined,
      primary_text: normalizeText(decodeHtml(description || "")) || undefined,
      snapshot_url: snapshotUrl,
    };
  } catch (error) {
    console.error("Snapshot enrichment failed:", error);
    return {};
  }
}

async function fetchMetaArchiveItems(accessToken: string): Promise<ParsedItem[]> {
  const resp = await fetch(buildMetaArchiveUrl(accessToken));
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `Meta archive ${resp.status}`);

  const rows = Array.isArray(data?.data) ? data.data : [];
  const baseItems = rows.map((ad: any): ParsedItem => {
    const body = Array.isArray(ad.ad_creative_bodies) ? ad.ad_creative_bodies.find(Boolean) : undefined;
    const title = Array.isArray(ad.ad_creative_link_titles) ? ad.ad_creative_link_titles.find(Boolean) : undefined;
    const description = Array.isArray(ad.ad_creative_link_descriptions) ? ad.ad_creative_link_descriptions.find(Boolean) : undefined;
    const caption = Array.isArray(ad.ad_creative_link_captions) ? ad.ad_creative_link_captions.find(Boolean) : undefined;
    const primaryText = normalizeText([body, title, description, caption].filter(Boolean).join("\n\n"));
    const snapshotUrl = ad.ad_snapshot_url || (ad.id ? `https://www.facebook.com/ads/library/?id=${ad.id}` : undefined);

    return {
      external_id: ad.id,
      advertiser_name: ad.page_name,
      advertiser_page_url: ad.page_id ? `https://www.facebook.com/${ad.page_id}` : undefined,
      ad_library_url: snapshotUrl,
      snapshot_url: snapshotUrl,
      primary_text: primaryText || undefined,
      headline: normalizeText(title) || undefined,
      cta: normalizeText(caption) || undefined,
      started_running: ad.ad_delivery_start_time,
      publisher_platforms: Array.isArray(ad.publisher_platforms) ? ad.publisher_platforms : [],
      raw_payload: ad,
    };
  }).filter((item) => item.external_id && (item.primary_text || item.advertiser_name));

  const enrichedItems = await Promise.all(baseItems.map(async (item, index) => {
    const snapshotData = item.snapshot_url && index < 20 ? await enrichSnapshot(item.snapshot_url) : {};
    const mergedText = normalizeText(snapshotData.primary_text || item.primary_text || "");
    const hookText = extractHookText(mergedText || item.headline || "");
    return {
      ...item,
      ...snapshotData,
      primary_text: mergedText || item.primary_text,
      image_url: snapshotData.image_url || item.image_url,
      media_preview_url: snapshotData.media_preview_url || snapshotData.image_url || item.image_url,
      hook_text: hookText || undefined,
      hook_category: hookText ? getHookCategory(hookText) : undefined,
      is_hook_candidate: !!hookText,
    } satisfies ParsedItem;
  }));

  const deduped = new Map<string, ParsedItem>();
  for (const item of enrichedItems) {
    if (!item.external_id) continue;
    const existing = deduped.get(item.external_id);
    if (!existing) {
      deduped.set(item.external_id, item);
      continue;
    }
    const score = (entry: ParsedItem) =>
      (entry.image_url ? 2 : 0) +
      (entry.video_url ? 2 : 0) +
      (entry.primary_text ? 1 : 0) +
      ((entry.publisher_platforms || []).length > 0 ? 1 : 0);
    if (score(item) > score(existing)) deduped.set(item.external_id, item);
  }

  return Array.from(deduped.values());
}

function parseAdsFromHtml(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const chunks = cleaned.split(/(?=(?:Library ID|Bibliotheek-?ID|Ad Library ID)[:\s]*\d)/i);

  for (const chunk of chunks) {
    const idMatch = chunk.match(/(?:Library ID|Bibliotheek-?ID|Ad Library ID)[:\s]*(\d{8,})/i);
    if (!idMatch) continue;
    const externalId = idMatch[1];

    const startedRunning = chunk.match(/(?:Started running on|Gestart op|Uitgevoerd vanaf)\s+([^<\n]+?)(?:<|\n|$)/i)?.[1]?.trim();
    const advertiserMatch = chunk.match(/<a[^>]+href=["'](https?:\/\/(?:www\.)?facebook\.com\/[^"'?#]+)["'][^>]*>([^<]{2,120})<\/a>/i);
    const advertiserUrl = advertiserMatch?.[1];
    const advertiserName = advertiserMatch ? stripTags(advertiserMatch[2]) : undefined;

    const imgCandidates = Array.from(chunk.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)).map((m) => decodeHtml(m[1]));
    const imageUrl = imgCandidates.find((url) => /scontent|fbcdn|jpg|png|webp/i.test(url));
    const videoUrl = chunk.match(/<video[^>]+src=["']([^"']+)["']/i)?.[1];

    const textNodes = Array.from(chunk.matchAll(/<(?:div|span|p)[^>]*>([^<]{20,1600})<\/(?:div|span|p)>/gi))
      .map((m) => normalizeText(decodeHtml(m[1])))
      .filter((text) => text.length > 24)
      .filter((text) => !/^(Sponsored|Gesponsord|Active|Actief|Library ID|Bibliotheek|Platforms?|Categories|EU transparency|See ad details|See summary details)/i.test(text));

    const primaryText = textNodes.sort((a, b) => b.length - a.length)[0];
    const hookText = extractHookText(primaryText || "");

    items.push({
      external_id: externalId,
      advertiser_name: advertiserName,
      advertiser_page_url: advertiserUrl,
      ad_library_url: `https://www.facebook.com/ads/library/?id=${externalId}`,
      snapshot_url: `https://www.facebook.com/ads/library/?id=${externalId}`,
      image_url: imageUrl,
      media_preview_url: imageUrl,
      video_url: decodeHtml(videoUrl || "") || undefined,
      primary_text: primaryText,
      started_running: startedRunning,
      hook_text: hookText || undefined,
      hook_category: hookText ? getHookCategory(hookText) : undefined,
      is_hook_candidate: !!hookText,
      raw_payload: { source: "listing_scrape" },
    });
  }

  const map = new Map<string, ParsedItem>();
  for (const item of items) {
    if (!item.external_id) continue;
    if (!map.has(item.external_id)) map.set(item.external_id, item);
  }
  return Array.from(map.values());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const forceRefresh = !!body.forceRefresh;
    const wantedTab = body.tab === "hooks" ? "hooks" : "ad-library";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const metaToken = Deno.env.get("META_ACCESS_TOKEN");
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

    const sb = createClient(supabaseUrl, serviceKey);
    const sourceUrl = buildAdsLibraryUrl();

    if (!forceRefresh) {
      const since = new Date(Date.now() - CACHE_TTL_MS).toISOString();
      const { data: cached } = await sb
        .from("inspiration_searches")
        .select("id, query, ai_summary, result_count, created_at, source_url, ad_type, source_type, sort_mode")
        .eq("query", FIXED_QUERY)
        .eq("country", FIXED_COUNTRY)
        .eq("media_type", FIXED_MEDIA_TYPE)
        .eq("ad_type", FIXED_AD_TYPE)
        .eq("source_type", FIXED_SOURCE_TYPE)
        .eq("sort_mode", FIXED_SORT_MODE)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached) {
        const { data: items } = await sb
          .from("inspiration_items")
          .select("*")
          .eq("search_id", cached.id)
          .order("created_at", { ascending: true });

        const cachedItems = items || [];
        if (cachedItems.length > 0) {
          return new Response(JSON.stringify({ search: cached, items: cachedItems, cached: true, tab: wantedTab }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    let parsed: ParsedItem[] = [];
    if (metaToken) {
      parsed = await fetchMetaArchiveItems(metaToken);
      console.log(`Fetched ${parsed.length} ads from Meta archive`);
    }

    if (parsed.length === 0 && firecrawlKey) {
      const fcResp = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: sourceUrl,
          formats: ["rawHtml"],
          onlyMainContent: false,
          waitFor: 8000,
          location: { country: FIXED_COUNTRY, languages: ["nl"] },
          actions: [
            { type: "wait", milliseconds: 5000 },
            { type: "scroll", direction: "down" },
            { type: "wait", milliseconds: 2500 },
            { type: "scroll", direction: "down" },
            { type: "wait", milliseconds: 2500 },
            { type: "scroll", direction: "down" },
            { type: "wait", milliseconds: 2500 },
          ],
        }),
      });

      const fcData = await fcResp.json();
      if (!fcResp.ok) {
        return new Response(JSON.stringify({ error: fcData.error || `Firecrawl ${fcResp.status}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rawHtml: string = fcData.data?.rawHtml || fcData.rawHtml || "";
      parsed = parseAdsFromHtml(rawHtml);
    }

    const { data: searchRow, error: searchErr } = await sb
      .from("inspiration_searches")
      .insert({
        query: FIXED_QUERY,
        country: FIXED_COUNTRY,
        media_type: FIXED_MEDIA_TYPE,
        ad_type: FIXED_AD_TYPE,
        source_type: FIXED_SOURCE_TYPE,
        sort_mode: FIXED_SORT_MODE,
        source_url: sourceUrl,
        source_filters: {
          active_status: "active",
          ad_type: "employment_ads",
          country: FIXED_COUNTRY,
          is_targeted_country: false,
          media_type: FIXED_MEDIA_TYPE,
          q: FIXED_QUERY,
          search_type: "keyword_unordered",
          sort_mode: "total_impressions",
          sort_direction: "desc",
        },
        result_count: parsed.length,
      })
      .select("id, query, ai_summary, result_count, created_at, source_url, ad_type, source_type, sort_mode")
      .single();

    if (searchErr) throw searchErr;

    let savedItems: Record<string, unknown>[] = [];
    if (parsed.length > 0) {
      const rows = parsed.map((item) => ({
        search_id: searchRow.id,
        advertiser_name: item.advertiser_name || null,
        advertiser_page_url: item.advertiser_page_url || null,
        advertiser_logo_url: item.advertiser_logo_url || null,
        ad_library_url: item.ad_library_url || null,
        image_url: item.image_url || null,
        media_preview_url: item.media_preview_url || item.image_url || null,
        video_url: item.video_url || null,
        snapshot_url: item.snapshot_url || item.ad_library_url || null,
        primary_text: item.primary_text || null,
        headline: item.headline || null,
        cta: item.cta || null,
        media_type: item.video_url ? "video" : "image",
        external_id: item.external_id || null,
        started_running: item.started_running || null,
        publisher_platforms: unique(item.publisher_platforms || []),
        source_type: FIXED_SOURCE_TYPE,
        raw_payload: item.raw_payload || {},
        hook_text: item.hook_text || null,
        hook_category: item.hook_category || null,
        is_hook_candidate: !!item.is_hook_candidate,
      }));

      const { data: inserted, error: itemsErr } = await sb
        .from("inspiration_items")
        .insert(rows)
        .select("*");

      if (itemsErr) throw itemsErr;
      savedItems = inserted || [];
    }

    return new Response(JSON.stringify({ search: searchRow, items: savedItems, cached: false, tab: wantedTab }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("scrape-ads-inspiration error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});