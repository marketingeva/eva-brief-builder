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

    // Get client context for relevant search
    const { data: client } = await sb.from("clients").select("name, care_type, description").eq("id", client_id).single();
    const clientName = client?.name || "";
    const careType = client?.care_type || "zorg";

    // Default search terms based on care type
    const defaultTerms = [
      `${careType} vacature`,
      `werken in de ${careType}`,
      "zorgpersoneel gezocht",
      "verpleegkundige vacature",
    ];
    const terms = search_terms?.length ? search_terms : defaultTerms;

    // Search Facebook Ads Library
    const allAds: any[] = [];
    for (const term of terms.slice(0, 4)) {
      const url = `https://graph.facebook.com/${META_API_VERSION}/ads_archive?search_terms=${encodeURIComponent(term)}&ad_type=POLITICAL_AND_ISSUE_ADS&ad_reached_countries=NL&fields=id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_creative_link_descriptions,page_name,ad_delivery_start_time&limit=25&access_token=${accessToken}`;

      try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.data) {
          allAds.push(...data.data.map((ad: any) => ({
            ...ad,
            search_term: term,
          })));
        }
      } catch (err) {
        console.error(`Ads Library search failed for "${term}":`, err);
      }
    }

    // Also try non-political search (employment ads)
    for (const term of terms.slice(0, 2)) {
      const url = `https://graph.facebook.com/${META_API_VERSION}/ads_archive?search_terms=${encodeURIComponent(term)}&ad_reached_countries=NL&fields=id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_creative_link_descriptions,page_name,ad_delivery_start_time&limit=25&access_token=${accessToken}`;

      try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.data) {
          allAds.push(...data.data.map((ad: any) => ({
            ...ad,
            search_term: term,
          })));
        }
      } catch (err) {
        console.error(`Ads Library search failed for "${term}":`, err);
      }
    }

    // Deduplicate by id
    const uniqueAds = Array.from(new Map(allAds.map(a => [a.id, a])).values());

    // Build analysis prompt
    const adSummaries = uniqueAds.slice(0, 40).map((ad, i) => {
      const body = ad.ad_creative_bodies?.[0] || "";
      const title = ad.ad_creative_link_titles?.[0] || "";
      const desc = ad.ad_creative_link_descriptions?.[0] || "";
      return `[${i + 1}] Pagina: ${ad.page_name || "?"} | Titel: ${title} | Body: ${body.substring(0, 200)} | CTA/Desc: ${desc}`;
    }).join("\n");

    const prompt = `Je bent een trend-analist gespecialiseerd in recruitment advertising in de Nederlandse zorgsector.

Analyseer de volgende ${uniqueAds.length} advertenties uit de Facebook Ads Library (zoektermen: ${terms.join(", ")}).

## Gevonden advertenties
${adSummaries || "Geen advertenties gevonden."}

## Context
Client: ${clientName} (${careType})

Geef een trendrapport in het Nederlands met:
1. **Trending hooks**: Welke openers/hooks worden veel gebruikt? Welke vallen op?
2. **Copy patronen**: Veelvoorkomende copywriting technieken (urgentie, emotie, voordelen-focus, etc.)
3. **CTA trends**: Welke call-to-actions worden ingezet?
4. **Visuele stijlen**: Als je patronen ziet in beschrijvingen van beeldmateriaal
5. **Kansen voor ${clientName}**: Wat doet de concurrentie NIET? Waar liggen kansen?
6. **Concrete suggesties**: 3-5 concrete hook/copy ideeën die ${clientName} kan testen

Wees specifiek en geef voorbeelden.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Je bent een AI trend scout die de Facebook Ads Library analyseert op patronen in recruitment advertising voor de zorgsector." },
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
      report_source: "manual",
      title: `Trend Scan — ${clientName} (${new Date().toLocaleDateString("nl-NL")})`,
      content: {
        analysis,
        search_terms: terms,
        ads_found: uniqueAds.length,
        generated_at: new Date().toISOString(),
      },
    }).select().single();

    return new Response(JSON.stringify({ success: true, report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("agent-trend-scout error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
