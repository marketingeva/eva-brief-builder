import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRECRAWL_API = "https://api.firecrawl.dev/v1/scrape";
const ADS_LIBRARY_BASE = "https://www.facebook.com/ads/library/";

function buildAdsLibraryUrl(term: string): string {
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "NL",
    q: term,
    media_type: "all",
  });
  return `${ADS_LIBRARY_BASE}?${params.toString()}`;
}

async function scrapeAdsLibrary(term: string, apiKey: string): Promise<{ term: string; markdown: string; error?: string }> {
  const url = buildAdsLibraryUrl(term);
  console.log(`Scraping Ads Library for: "${term}" → ${url}`);

  try {
    const resp = await fetch(FIRECRAWL_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const errMsg = data.error || `HTTP ${resp.status}`;
      console.error(`Firecrawl error for "${term}":`, errMsg);
      return { term, markdown: "", error: errMsg };
    }

    const markdown = data.data?.markdown || data.markdown || "";
    console.log(`Scraped "${term}": ${markdown.length} chars`);
    return { term, markdown };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`Fetch error for "${term}":`, errMsg);
    return { term, markdown: "", error: errMsg };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { client_id, search_terms } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
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
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // Get client context
    const { data: client } = await sb.from("clients").select("name, care_type, description").eq("id", client_id).single();
    const clientName = client?.name || "";
    const careType = client?.care_type || "zorg";

    // Build search terms
    const defaultTerms = [
      clientName,
      "verpleegkundige vacature",
      "zorg medewerker gezocht",
      "Buurtzorg",
      "thuiszorg vacature",
    ].filter(Boolean);
    const terms = (search_terms?.length ? search_terms : defaultTerms).slice(0, 5);

    // Scrape each term sequentially to conserve credits
    const scrapeResults: { term: string; markdown: string; error?: string }[] = [];
    for (const term of terms) {
      const result = await scrapeAdsLibrary(term, firecrawlKey);
      scrapeResults.push(result);
      // Small delay between requests
      if (terms.indexOf(term) < terms.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const successfulScrapes = scrapeResults.filter(r => r.markdown.length > 50);
    const errors = scrapeResults.filter(r => r.error).map(r => `"${r.term}": ${r.error}`);

    console.log(`Scraping complete: ${successfulScrapes.length}/${terms.length} successful`);

    // Combine all scraped content
    const combinedContent = scrapeResults
      .map((r, i) => {
        if (!r.markdown) return `## Zoekterm ${i + 1}: "${r.term}"\nGeen resultaten gevonden.`;
        return `## Zoekterm ${i + 1}: "${r.term}"\n${r.markdown.substring(0, 5000)}`;
      })
      .join("\n\n---\n\n");

    // AI analysis prompt
    const prompt = `Je bent een trend-analist gespecialiseerd in recruitment advertising in de Nederlandse zorgsector.

Analyseer de volgende gescrapete content uit de Facebook Ads Library (zoektermen: ${terms.join(", ")}).

## Gescrapete advertentie-content
${combinedContent || "Geen advertenties gevonden via scraping. Geef alsnog een trendrapport op basis van je kennis van de huidige zorgmarkt en recruitment trends."}

${errors.length ? `## Scraping opmerkingen\n${errors.join("\n")}` : ""}

## Context
Client: ${clientName} (${careType})

Geef een trendrapport in het Nederlands met:
1. **Trending hooks**: Welke openers/hooks worden veel gebruikt? Welke vallen op? Geef concrete voorbeelden uit de gevonden advertenties.
2. **Copy patronen**: Veelvoorkomende copywriting technieken (urgentie, emotie, voordelen-focus, etc.) met voorbeelden.
3. **CTA trends**: Welke call-to-actions worden ingezet? Wat werkt het beste?
4. **Concurrentie-analyse**: Welke organisaties adverteren actief? Wat doen zij goed/slecht?
5. **Kansen voor ${clientName}**: Wat doet de concurrentie NIET? Waar liggen kansen?
6. **Concrete suggesties**: 5 concrete hook/copy ideeën die ${clientName} kan testen, inclusief volledige voorbeeldteksten.

Wees specifiek, geef concrete voorbeelden en maak het rapport direct actionable.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Je bent een AI trend scout die gescrapete Facebook Ads Library data analyseert op patronen in recruitment advertising voor de zorgsector. Je geeft altijd concrete voorbeelden." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit bereikt, probeer het later opnieuw." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits op." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const analysis = aiData.choices?.[0]?.message?.content || "Geen analyse beschikbaar.";

    // Store report
    const { data: report } = await sb.from("agent_reports").insert({
      client_id,
      agent_type: "trend_scout",
      report_type: "trend_scan",
      report_source: "firecrawl",
      title: `Trend Scan — ${clientName} (${new Date().toLocaleDateString("nl-NL")})`,
      content: {
        analysis,
        search_terms: terms,
        scrapes_successful: successfulScrapes.length,
        scrapes_total: terms.length,
        scrape_errors: errors.length ? errors : undefined,
        generated_at: new Date().toISOString(),
      },
    }).select().single();

    return new Response(JSON.stringify({
      success: true,
      report,
      meta: { scrapes_successful: successfulScrapes.length, scrapes_total: terms.length, errors },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("agent-trend-scout error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
