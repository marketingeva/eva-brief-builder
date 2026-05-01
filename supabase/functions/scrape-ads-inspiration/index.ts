import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2/scrape";
const ADS_LIBRARY_BASE = "https://www.facebook.com/ads/library/";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 uur

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

interface ParsedItem {
  advertiser_name?: string;
  advertiser_page_url?: string;
  advertiser_logo_url?: string;
  ad_library_url?: string;
  image_url?: string;
  primary_text?: string;
  external_id?: string;
  started_running?: string;
  platforms?: string[];
}

/**
 * Parse Firecrawl markdown into ad items.
 * Each ad block on Facebook Ads Library follows this pattern:
 *   Actief / Inactief
 *   Bibliotheek-ID: <id>
 *   Uitgevoerd vanaf <date>  (or: Started running on <date>)
 *   Platformen + icons
 *   ... metadata ...
 *   Advertentiegegevens bekijken
 *   * * *
 *   ![<advertiser>](<small avatar>)
 *   [<advertiser>](<page url>)
 *   **Gesponsord**
 *   <primary text>
 *   [![](<creative image url>) ... <link card text>](<destination url>)
 */
function parseAdsFromMarkdown(markdown: string): ParsedItem[] {
  const items: ParsedItem[] = [];

  // Split into blocks starting at each library id marker
  const blocks = markdown.split(/(?=Bibliotheek-?ID:|Library ID:|Ad Library ID)/i);

  for (const block of blocks) {
    if (block.length < 80) continue;

    const idMatch = block.match(/(?:Bibliotheek-?ID|Library ID|Ad Library ID)[:\s]*(\d+)/i);
    if (!idMatch) continue;
    const externalId = idMatch[1];

    // started running date
    let startedRunning: string | undefined;
    const dateMatch = block.match(/(?:Uitgevoerd vanaf|Started running on|Gestart op)\s+([^\n]+?)(?:\n|$)/i);
    if (dateMatch) startedRunning = dateMatch[1].trim();

    // Find all images in this block
    const imgs: { alt: string; url: string; index: number }[] = [];
    const imgRegex = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = imgRegex.exec(block)) !== null) {
      imgs.push({ alt: m[1], url: m[2], index: m.index });
    }

    // Advertiser logo: first small image (s60x60 or s90x90)
    const logoImg = imgs.find(i => /s\d{2,3}x\d{2,3}/.test(i.url));
    const advertiserLogo = logoImg?.url;

    // Creative: first non-logo (large) image, OR second image overall
    const creativeImg = imgs.find(i =>
      i !== logoImg &&
      !/s60x60|s90x90/.test(i.url)
    ) || imgs.find(i => i !== logoImg);
    const imageUrl = creativeImg?.url;

    // Advertiser link: facebook.com/<page>/ link that's not ads/library
    let advertiserName: string | undefined;
    let advertiserUrl: string | undefined;
    const advRegex = /\[([^\]]{2,80})\]\((https?:\/\/(?:www\.)?facebook\.com\/[^)\s?#]+)\)/g;
    while ((m = advRegex.exec(block)) !== null) {
      if (/ads\/library/.test(m[2])) continue;
      advertiserName = m[1].trim();
      advertiserUrl = m[2];
      break;
    }

    // Primary text: line right after **Gesponsord**, OR longest content paragraph
    let primaryText: string | undefined;
    const sponsoredIdx = block.search(/\*\*Gesponsord\*\*|\*\*Sponsored\*\*/i);
    if (sponsoredIdx >= 0) {
      const after = block.substring(sponsoredIdx).split(/\n+/).slice(1);
      for (const raw of after) {
        const line = raw.trim();
        if (!line) continue;
        if (/^!\[/.test(line)) break; // hit the creative image, stop
        if (/^\[!\[/.test(line)) break; // hit the link-wrapped creative
        if (line.length < 15) continue;
        if (/^(Bibliotheek|Library ID|Actief|Inactief|Categorieën|Categories|Platformen|Platforms|Transparantie|EU transparency|Advertentiegegevens|See ad details)/i.test(line)) break;
        primaryText = line.replace(/^\*+|\*+$/g, "").trim();
        break;
      }
    }

    if (!primaryText) {
      const lines = block.split(/\n+/).map(l => l.trim()).filter(Boolean);
      const candidates = lines.filter(l =>
        l.length > 30 && l.length < 1500 &&
        !/^!\[/.test(l) && !/^\[/.test(l) && !/^\*\*/.test(l) &&
        !/^(Bibliotheek|Library ID|Uitgevoerd|Started|Actief|Inactief|Categorieën|Categories|Platformen|Platforms|Transparantie|EU transparency|Advertentiegegevens|See ad details|Vervolgkeuzemenu|Gesponsord|Sponsored)/i.test(l) &&
        !/^\d{1,2}\s+\w{3,}\s+\d{4}/i.test(l)
      );
      primaryText = candidates.sort((a, b) => b.length - a.length)[0];
    }

    items.push({
      external_id: externalId,
      ad_library_url: `https://www.facebook.com/ads/library/?id=${externalId}`,
      image_url: imageUrl,
      advertiser_name: advertiserName,
      advertiser_page_url: advertiserUrl,
      advertiser_logo_url: advertiserLogo,
      primary_text: primaryText,
      started_running: startedRunning,
    });
  }

  // Dedupe by external_id
  const seen = new Set<string>();
  return items.filter(i => {
    if (!i.external_id || seen.has(i.external_id)) return false;
    seen.add(i.external_id);
    return true;
  });
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
        return new Response(
          JSON.stringify({ search: cached, items: items || [], cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Scrape - use actions to scroll and load more ads
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
        formats: ["markdown"],
        onlyMainContent: false,
        waitFor: 6000,
        location: { country: "NL", languages: ["nl"] },
        actions: [
          { type: "wait", milliseconds: 4000 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 2500 },
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
      console.error("Firecrawl error:", fcResp.status, fcData);
      return new Response(
        JSON.stringify({ error: fcData.error || `Firecrawl ${fcResp.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const markdown: string = fcData.data?.markdown || fcData.markdown || "";
    const parsed = parseAdsFromMarkdown(markdown);
    console.log(`Parsed ${parsed.length} ads from ${markdown.length} chars`);

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
        raw_markdown: markdown.substring(0, 80000),
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
        metadata: {
          advertiser_logo_url: p.advertiser_logo_url || null,
          started_running: p.started_running || null,
        },
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
