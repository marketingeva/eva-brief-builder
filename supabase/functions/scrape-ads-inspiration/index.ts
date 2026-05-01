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
    media_type: mediaType, // "image" | "all"
  });
  return `${ADS_LIBRARY_BASE}?${params.toString()}`;
}

interface ParsedItem {
  advertiser_name?: string;
  advertiser_page_url?: string;
  ad_library_url?: string;
  image_url?: string;
  primary_text?: string;
  external_id?: string;
}

/**
 * Parse Firecrawl markdown into ad items. Facebook's Ads Library renders each ad
 * as a block with the advertiser name, an image, and the ad copy. We extract these
 * heuristically from the markdown / links output.
 */
function parseAdsFromMarkdown(markdown: string, links: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];

  // Find all image URLs in markdown - Facebook ad images come from scontent/fbcdn
  const imgRegex = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  const allImages: { alt: string; url: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = imgRegex.exec(markdown)) !== null) {
    const url = m[2];
    // Skip avatars, icons, blank pixels
    if (
      url.includes("scontent") ||
      url.includes("fbcdn.net") ||
      url.includes("/ads/image/")
    ) {
      // Skip tiny profile pics (often have small numeric paths)
      if (!/\/p\d{2,3}x\d{2,3}\//.test(url)) {
        allImages.push({ alt: m[1], url, index: m.index });
      }
    }
  }

  // Find ad library detail links (format: /ads/library/?id=12345 or ?ids=)
  const libIdRegex = /facebook\.com\/ads\/library\/\?(?:id|ids?)=(\d+)/g;
  const libLinks: { id: string; index: number }[] = [];
  while ((m = libIdRegex.exec(markdown)) !== null) {
    libLinks.push({ id: m[1], index: m.index });
  }

  // Split markdown into ad-blocks by "Library ID" markers (Facebook always shows this)
  const blocks = markdown.split(/(?=Library ID:|Bibliotheek-?ID:|Ad Library ID)/i);

  for (const block of blocks) {
    if (block.length < 50) continue;

    // Extract Library ID
    const idMatch = block.match(/(?:Library ID|Bibliotheek-?ID|Ad Library ID)[:\s]*(\d+)/i);
    if (!idMatch) continue;
    const externalId = idMatch[1];

    // Extract first big image in this block
    let imageUrl: string | undefined;
    const blockImg = block.match(/!\[[^\]]*\]\((https?:\/\/(?:scontent|[^)]*?fbcdn\.net)[^)\s]+)\)/);
    if (blockImg) imageUrl = blockImg[1];

    // Extract advertiser name - usually first link or bold text near top
    let advertiserName: string | undefined;
    let advertiserUrl: string | undefined;
    const advMatch = block.match(/\[([^\]]{2,80})\]\((https?:\/\/(?:www\.)?facebook\.com\/[^)\s?]+)\)/);
    if (advMatch && !/ads\/library/.test(advMatch[2])) {
      advertiserName = advMatch[1].trim();
      advertiserUrl = advMatch[2];
    }

    // Extract primary text - longest paragraph in the block, excluding metadata lines
    const lines = block.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const textCandidates = lines.filter(l =>
      l.length > 30 &&
      l.length < 1500 &&
      !/^(Library ID|Bibliotheek|Started running|Gestart|Platforms?|Categorieën|Categories|See ad details|Bekijk advertentiedetails)/i.test(l) &&
      !/^!\[/.test(l) &&
      !/^\[.*\]\(/.test(l) &&
      !/^\d{1,2}\s+\w+\s+\d{4}/.test(l)
    );
    const primaryText = textCandidates.sort((a, b) => b.length - a.length)[0];

    items.push({
      external_id: externalId,
      ad_library_url: `https://www.facebook.com/ads/library/?id=${externalId}`,
      image_url: imageUrl,
      advertiser_name: advertiserName,
      advertiser_page_url: advertiserUrl,
      primary_text: primaryText,
    });
  }

  // Dedupe by external_id
  const seen = new Set<string>();
  const deduped = items.filter(i => {
    if (!i.external_id || seen.has(i.external_id)) return false;
    seen.add(i.external_id);
    return true;
  });

  return deduped;
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

    // Check cache (within TTL)
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

    // Scrape
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
        formats: ["markdown", "links"],
        onlyMainContent: true,
        waitFor: 4000,
        location: { country: "NL", languages: ["nl"] },
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
    const links: string[] = fcData.data?.links || fcData.links || [];

    const parsed = parseAdsFromMarkdown(markdown, links);
    console.log(`Parsed ${parsed.length} ads`);

    // Optional AI summary of patterns
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
        raw_markdown: markdown.substring(0, 50000),
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
