import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API_VERSION = "v21.0";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { client_id, search_terms } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "META_ACCESS_TOKEN not configured" }), {
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

    // Improved search terms: specific competitors + care-sector recruitment terms
    const defaultTerms = [
      "verpleegkundige vacature",
      "zorg medewerker gezocht",
      "Buurtzorg",
      "thuiszorg vacature",
      "werken in de zorg",
      clientName, // also search for client's own ads
    ].filter(Boolean);
    const terms = search_terms?.length ? search_terms : defaultTerms;

    // Try multiple ad_type values for maximum coverage
    const adTypes = ["ALL", "EMPLOYMENT_ADS", "POLITICAL_AND_ISSUE_ADS"];
    const allAds: any[] = [];
    const apiErrors: string[] = [];

    for (const adType of adTypes) {
      for (const term of terms.slice(0, 5)) {
        const params = new URLSearchParams({
          search_terms: term,
          ad_reached_countries: "NL",
          ad_type: adType,
          fields: "id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_creative_link_descriptions,page_name,ad_delivery_start_time,ad_snapshot_url",
          limit: "25",
          access_token: accessToken,
        });

        const url = `https://graph.facebook.com/${META_API_VERSION}/ads_archive?${params.toString()}`;

        try {
          const resp = await fetch(url);
          const data = await resp.json();

          if (data.error) {
            const errMsg = `[${adType}] "${term}": ${data.error.message} (code: ${data.error.code})`;
            console.error("Ads Library API error:", errMsg);
            apiErrors.push(errMsg);
            // If this ad_type is not supported, skip remaining terms for it
            if (data.error.code === 100 || data.error.message?.includes("ad_type")) {
              console.log(`ad_type=${adType} not supported, skipping remaining terms`);
              break;
            }
            continue;
          }

          if (data.data?.length) {
            console.log(`[${adType}] "${term}": found ${data.data.length} ads`);
            allAds.push(...data.data.map((ad: any) => ({
              ...ad,
              search_term: term,
              ad_type_used: adType,
            })));
          } else {
            console.log(`[${adType}] "${term}": 0 ads found`);
          }
        } catch (err) {
          const errMsg = `[${adType}] "${term}": fetch failed: ${err}`;
          console.error(errMsg);
          apiErrors.push(errMsg);
        }
      }

      // If we already found enough ads, stop trying other ad_types
      if (allAds.length >= 30) break;
    }

    // Deduplicate by id
    const uniqueAds = Array.from(new Map(allAds.map(a => [a.id, a])).values());
    console.log(`Total unique ads found: ${uniqueAds.length} (from ${allAds.length} raw results)`);

    // Build analysis prompt
    const adSummaries = uniqueAds.slice(0, 50).map((ad, i) => {
      const body = ad.ad_creative_bodies?.[0] || "";
      const title = ad.ad_creative_link_titles?.[0] || "";
      const desc = ad.ad_creative_link_descriptions?.[0] || "";
      const startDate = ad.ad_delivery_start_time || "?";
      return `[${i + 1}] Pagina: ${ad.page_name || "?"} | Start: ${startDate} | Titel: ${title} | Body: ${body.substring(0, 300)} | CTA/Desc: ${desc} | Zoekterm: ${ad.search_term}`;
    }).join("\n");

    const prompt = `Je bent een trend-analist gespecialiseerd in recruitment advertising in de Nederlandse zorgsector.

Analyseer de volgende ${uniqueAds.length} advertenties uit de Facebook Ads Library (zoektermen: ${terms.join(", ")}).

## Gevonden advertenties
${adSummaries || "Geen advertenties gevonden via de API. Geef alsnog een trendrapport op basis van je kennis van de huidige zorgmarkt en recruitment trends."}

${apiErrors.length ? `## API Opmerkingen\n${apiErrors.slice(0, 5).join("\n")}` : ""}

## Context
Client: ${clientName} (${careType})

Geef een trendrapport in het Nederlands met:
1. **Trending hooks**: Welke openers/hooks worden veel gebruikt? Welke vallen op? Geef concrete voorbeelden uit de gevonden advertenties.
2. **Copy patronen**: Veelvoorkomende copywriting technieken (urgentie, emotie, voordelen-focus, etc.) met voorbeelden.
3. **CTA trends**: Welke call-to-actions worden ingezet? Wat werkt het beste?
4. **Concurrentie-analyse**: Welke organisaties adverteren actief? Wat doen zij goed/slecht?
5. **Kansen voor ${clientName}**: Wat doet de concurrentie NIET? Waar liggen kansen?
6. **Concrete suggesties**: 5 concrete hook/copy ideeën die ${clientName} kan testen, inclusief volledige voorbeeldteksten.

## Bronnen & referenties
Verwijs in je analyse naar specifieke advertenties (gebruik de nummering [1], [2] etc.) en benoem welke concurrenten je hebt geanalyseerd.

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
          { role: "system", content: "Je bent een AI trend scout die de Facebook Ads Library analyseert op patronen in recruitment advertising voor de zorgsector. Je geeft altijd concrete voorbeelden en referenties naar specifieke advertenties." },
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

    // Store report with metadata about what was found
    const { data: report } = await sb.from("agent_reports").insert({
      client_id,
      agent_type: "trend_scout",
      report_type: "trend_scan",
      report_source: "manual",
      title: `Trend Scan — ${clientName} (${new Date().toLocaleDateString("nl-NL")})`,
      content: {
        analysis,
        search_terms: terms,
        ads_found: uniqueAds.length,
        api_errors: apiErrors.length ? apiErrors : undefined,
        ad_types_tried: adTypes,
        sample_ads: uniqueAds.slice(0, 10).map(a => ({
          page_name: a.page_name,
          title: a.ad_creative_link_titles?.[0],
          body: (a.ad_creative_bodies?.[0] || "").substring(0, 200),
          start_date: a.ad_delivery_start_time,
          search_term: a.search_term,
        })),
        generated_at: new Date().toISOString(),
      },
    }).select().single();

    return new Response(JSON.stringify({ success: true, report, meta: { ads_found: uniqueAds.length, api_errors: apiErrors } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("agent-trend-scout error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
