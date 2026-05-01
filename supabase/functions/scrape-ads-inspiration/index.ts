import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2/scrape";
const META_GRAPH_ADS_ARCHIVE = "https://graph.facebook.com/v20.0/ads_archive";
const ADS_LIBRARY_BASE = "https://www.facebook.com/ads/library/";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 uur

function isLikelyTinyMetaImage(url: string): boolean {
  return /(?:^|[_/&?=-])(?:s|p)(?:40|50|60|64|72|80|90|100|120|160)x(?:40|50|60|64|72|80|90|100|120|160)(?:[_/&?=-]|$)/i.test(url) ||
    /(?:dst|src)-jpg_(?:s|p)(?:40|50|60|64|72|80|90|100|120|160)x(?:40|50|60|64|72|80|90|100|120|160)/i.test(url) ||
    /_(?:q|t|s)\.(?:jpg|jpeg|png|webp)/i.test(url);
}

function isBadCachedItem(item: { image_url?: string | null; primary_text?: string | null }): boolean {
  const imageUrl = item.image_url || "";
  const text = item.primary_text || "";
  return isLikelyTinyMetaImage(imageUrl) || /facebook\.com\/ads\/about|Over advertenties en het gebruik van gegevens/i.test(text);
}

function buildAdsLibraryUrl(query: string, mediaType: string): string {
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "NL",
    q: query,
    media_type: mediaType,
    search_type: "keyword_unordered",
  });
  return `${ADS_LIBRARY_BASE}?${params.toString()}`;
}

function buildMetaArchiveUrl(query: string, mediaType: string, accessToken: string): string {
  const params = new URLSearchParams({
    access_token: accessToken,
    search_terms: query,
    ad_type: "ALL",
    ad_reached_countries: JSON.stringify(["NL"]),
    media_type: mediaType === "image" ? "IMAGE" : "ALL",
    limit: "30",
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

interface ParsedItem {
  advertiser_name?: string;
  advertiser_page_url?: string;
  advertiser_logo_url?: string;
  ad_library_url?: string;
  image_url?: string;
  primary_text?: string;
  external_id?: string;
  started_running?: string;
}

async function fetchMetaArchiveItems(query: string, mediaType: string, accessToken: string): Promise<ParsedItem[]> {
  const resp = await fetch(buildMetaArchiveUrl(query, mediaType, accessToken));
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `Meta archive ${resp.status}`);
  const rows = Array.isArray(data?.data) ? data.data : [];

  return rows.map((ad: any): ParsedItem => {
    const body = Array.isArray(ad.ad_creative_bodies) ? ad.ad_creative_bodies.find(Boolean) : undefined;
    const title = Array.isArray(ad.ad_creative_link_titles) ? ad.ad_creative_link_titles.find(Boolean) : undefined;
    const description = Array.isArray(ad.ad_creative_link_descriptions) ? ad.ad_creative_link_descriptions.find(Boolean) : undefined;
    const primaryText = [body, title, description].filter(Boolean).join("\n\n").trim();

    return {
      external_id: ad.id,
      advertiser_name: ad.page_name,
      advertiser_page_url: ad.page_id ? `https://www.facebook.com/${ad.page_id}` : undefined,
      ad_library_url: ad.ad_snapshot_url || (ad.id ? `https://www.facebook.com/ads/library/?id=${ad.id}` : undefined),
      primary_text: primaryText || undefined,
      started_running: ad.ad_delivery_start_time,
    };
  }).filter((item: ParsedItem) => item.external_id && (item.primary_text || item.advertiser_name));
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

/**
 * Parse the Facebook Ad Library HTML.
 * Each ad card is rendered as a div containing a "Library ID" / "Bibliotheek-ID" string.
 * We split on those markers and extract per block:
 *  - external_id (digits after the marker)
 *  - started_running (date)
 *  - the LARGE creative image (scontent.*.jpg/png with size suffix like _n.jpg, NOT s60x60/s90x90 avatars)
 *  - the advertiser name + page url (facebook.com/<page>)
 *  - the primary ad copy (longest meaningful text inside the block, after stripping nav/UI labels)
 */
function parseAdsFromHtml(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];

  // Normalize: remove script/style content, keep tags otherwise
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  // Split on Library ID markers; each chunk = one ad card (roughly)
  const chunks = cleaned.split(/(?=(?:Library ID|Bibliotheek-?ID|Ad Library ID)[:\s]*\d)/i);

  for (const chunk of chunks) {
    const idMatch = chunk.match(/(?:Library ID|Bibliotheek-?ID|Ad Library ID)[:\s]*(\d{8,})/i);
    if (!idMatch) continue;
    const externalId = idMatch[1];
    if (chunk.length < 200) continue;

    // started_running
    let startedRunning: string | undefined;
    const dateMatch = chunk.match(/(?:Uitgevoerd vanaf|Started running on|Gestart op)\s+([^<\n]+?)(?:<|\n|$)/i);
    if (dateMatch) startedRunning = dateMatch[1].trim().replace(/\s{2,}/g, " ");

    // ---- IMAGES ----
    // Find every scontent image; pick the one that is NOT a tiny avatar.
    // Avatars: s60x60, s90x90, p60x60, p100x100, _q.jpg, _t.jpg
    // Creatives: typically end in _n.jpg / _n.png with bigger dimensions, or s600x600 / p526x526.
    const imgUrls: string[] = [];
    const imgRegex = /<img[^>]+src=["']([^"']+scontent[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["'][^>]*>/gi;
    let im: RegExpExecArray | null;
    while ((im = imgRegex.exec(chunk)) !== null) {
      imgUrls.push(decodeHtml(im[1]));
    }

    const isAvatar = (u: string) => isLikelyTinyMetaImage(u);

    const imageScore = (u: string) => {
      const sizeMatch = u.match(/(?:^|[_/&?=-])(?:s|p)(\d{3,4})x(\d{3,4})(?:[_/&?=-]|$)/i);
      const area = sizeMatch ? Number(sizeMatch[1]) * Number(sizeMatch[2]) : 0;
      const hasCreativeMarker = /t39\.35426|ad_library|creative|scontent/i.test(u) ? 500000 : 0;
      return area + hasCreativeMarker - (isLikelyTinyMetaImage(u) ? 1000000 : 0);
    };

    const advertiserLogo = imgUrls.find(isAvatar);
    const creativeImg = [...imgUrls]
      .filter((u) => !isAvatar(u))
      .sort((a, b) => imageScore(b) - imageScore(a))[0];

    // ---- ADVERTISER ----
    let advertiserName: string | undefined;
    let advertiserUrl: string | undefined;
    const advRegex = /<a[^>]+href=["'](https?:\/\/(?:www\.)?facebook\.com\/[^"'?#]+)["'][^>]*>([^<]{2,80})<\/a>/gi;
    let am: RegExpExecArray | null;
    while ((am = advRegex.exec(chunk)) !== null) {
      const url = am[1];
      const name = stripTags(am[2]);
      if (/\/ads\/library/i.test(url)) continue;
      if (/^(Sponsored|Gesponsord|Library ID|Bibliotheek)/i.test(name)) continue;
      if (name.length < 2) continue;
      advertiserName = name;
      advertiserUrl = url;
      break;
    }

    // ---- PRIMARY TEXT ----
    // Strategy: collect all visible text nodes inside this chunk, filter out UI labels,
    // and pick the longest paragraph (which is virtually always the ad body copy).
    const textNodes: string[] = [];
    const divRegex = /<(?:div|span|p)[^>]*>([^<]{20,2000})<\/(?:div|span|p)>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = divRegex.exec(chunk)) !== null) {
      const t = decodeHtml(tm[1]).replace(/\s+/g, " ").trim();
      if (!t) continue;
      if (/^(Sponsored|Gesponsord|Library ID|Bibliotheek|Active|Actief|Inactief|Started running|Uitgevoerd|Platforms?|Platformen|See ad details|Advertentiegegevens|Categories|Categorieën|EU transparency|See summary details|See more|Meer weergeven|Vervolgkeuzemenu|Open Drop-down)/i.test(t)) continue;
      if (/^https?:\/\//i.test(t)) continue;
      if (t.length < 25) continue;
      textNodes.push(t);
    }
    const primaryText = textNodes.sort((a, b) => b.length - a.length)[0];

    items.push({
      external_id: externalId,
      ad_library_url: `https://www.facebook.com/ads/library/?id=${externalId}`,
      image_url: creativeImg,
      advertiser_name: advertiserName,
      advertiser_page_url: advertiserUrl,
      advertiser_logo_url: advertiserLogo,
      primary_text: primaryText,
      started_running: startedRunning,
    });
  }

  // Dedupe by external_id, prefer entries that have an image
  const map = new Map<string, ParsedItem>();
  for (const it of items) {
    if (!it.external_id) continue;
    const existing = map.get(it.external_id);
    if (!existing) { map.set(it.external_id, it); continue; }
    // Prefer the one with image_url + primary_text
    const score = (x: ParsedItem) => (x.image_url ? 2 : 0) + (x.primary_text ? 1 : 0);
    if (score(it) > score(existing)) map.set(it.external_id, it);
  }
  return Array.from(map.values());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const query: string = (body.query || "").trim();
    const mediaType: string = body.mediaType === "all" ? "all" : "image";
    const forceRefresh: boolean = !!body.forceRefresh;
    const wantSummary: boolean = !!body.wantSummary;

    if (!query) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!firecrawlKey) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // Cache check
    if (!forceRefresh) {
      const since = new Date(Date.now() - CACHE_TTL_MS).toISOString();
      const { data: cached } = await sb
        .from("inspiration_searches")
        .select("id, query, ai_summary, result_count, created_at")
        .ilike("query", query)
        .eq("media_type", mediaType)
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
        const badCacheCount = cachedItems.filter(isBadCachedItem).length;
        const cacheLooksStale = cachedItems.length === 0 || badCacheCount > Math.max(0, cachedItems.length * 0.4);
        if (cacheLooksStale) {
          console.log(`Ignoring stale inspiration cache for "${query}": ${badCacheCount}/${cachedItems.length} bad items`);
        } else {
        return new Response(
          JSON.stringify({ search: cached, items: cachedItems, cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
        }
      }
    }

    // Scrape - request rawHtml so we can extract real creative image URLs and full ad copy.
    const url = buildAdsLibraryUrl(query, mediaType);
    console.log(`Scraping: ${url}`);

    const fcResp = await fetch(FIRECRAWL_V2, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["rawHtml"],
        onlyMainContent: false,
        waitFor: 8000,
        location: { country: "NL", languages: ["nl"] },
        actions: [
          { type: "wait", milliseconds: 5000 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 3000 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 3000 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 3000 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 3000 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 3000 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 3000 },
        ],
      }),
    });

    const fcData = await fcResp.json();
    if (!fcResp.ok) {
      console.error("Firecrawl error:", fcResp.status, fcData);
      return new Response(
        JSON.stringify({ error: fcData.error || `Firecrawl ${fcResp.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawHtml: string = fcData.data?.rawHtml || fcData.rawHtml || fcData.data?.html || fcData.html || "";
    const parsed = parseAdsFromHtml(rawHtml);
    console.log(`Parsed ${parsed.length} ads from ${rawHtml.length} chars HTML`);

    // Optional AI summary
    let aiSummary: string | null = null;
    if (wantSummary && lovableKey && parsed.length > 0) {
      try {
        const sampleTexts = parsed.slice(0, 15).map((p, i) =>
          `${i + 1}. [${p.advertiser_name || "?"}] ${p.primary_text || ""}`
        ).join("\n\n");
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "Je bent een Nederlandse recruitment-marketing strateeg gespecialiseerd in zorg." },
              { role: "user", content:
`Hieronder gescrapete advertentieteksten uit Facebook Ads Library voor zoekterm "${query}".

${sampleTexts}

Geef een korte analyse (max 200 woorden) in Nederlands van:
- Veelvoorkomende hooks en openers
- Emotionele triggers
- 3 concrete inspiratie-suggesties die wij kunnen gebruiken

Wees concreet, geen marketing-fluff.` }
            ],
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          aiSummary = aiData.choices?.[0]?.message?.content || null;
        }
      } catch (e) {
        console.error("AI summary failed:", e);
      }
    }

    // Save search + items
    const { data: searchRow, error: searchErr } = await sb
      .from("inspiration_searches")
      .insert({
        query,
        country: "NL",
        media_type: mediaType,
        result_count: parsed.length,
        raw_markdown: rawHtml.substring(0, 80000),
        ai_summary: aiSummary,
      })
      .select()
      .single();

    if (searchErr) throw searchErr;

    let savedItems: any[] = [];
    if (parsed.length > 0) {
      const rows = parsed.map(p => ({
        search_id: searchRow.id,
        advertiser_name: p.advertiser_name || null,
        advertiser_page_url: p.advertiser_page_url || null,
        ad_library_url: p.ad_library_url || null,
        image_url: p.image_url || null,
        primary_text: p.primary_text || null,
        external_id: p.external_id || null,
        media_type: mediaType,
        advertiser_logo_url: p.advertiser_logo_url || null,
        started_running: p.started_running || null,
      }));
      const { data: inserted, error: itemsErr } = await sb
        .from("inspiration_items")
        .insert(rows)
        .select();
      if (itemsErr) throw itemsErr;
      savedItems = inserted || [];
    }

    return new Response(
      JSON.stringify({ search: searchRow, items: savedItems, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("scrape-ads-inspiration error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
