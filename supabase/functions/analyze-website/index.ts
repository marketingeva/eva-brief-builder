import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { client_id, website_url } = await req.json();
    if (!client_id || !website_url) {
      return new Response(JSON.stringify({ error: "client_id and website_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Use AI to analyze the website URL and extract structured data
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Je bent een expert in het analyseren van zorgorganisatie-websites voor recruitment marketing doeleinden.

Analyseer de website URL die je krijgt en probeer zoveel mogelijk relevante informatie te extraheren.

BELANGRIJK:
- Markeer alles als "suggested" — niets is bevestigd
- Wees eerlijk als je iets niet kunt vinden
- Focus op informatie die relevant is voor recruitment marketing
- Schrijf in het Nederlands
- Wees concreet, niet vaag`,
          },
          {
            role: "user",
            content: `Analyseer deze zorgorganisatie website voor recruitment marketing: ${website_url}

Extraheer zoveel mogelijk van het volgende:

1. Organisatiebeschrijving
2. Missie en visie (als gevonden)
3. Tone of voice / communicatiestijl
4. Werkgeversverhaal hints
5. Locaties die genoemd worden
6. Zorgtypen die aangeboden worden (thuiszorg, revalidatie, verpleeghuis, intramuraal, extramuraal, PG, somatiek, flexpool, wijkzorg, dementiezorg, gehandicaptenzorg, jeugdzorg, GGZ, hospice, geriatrische revalidatiezorg)
7. Functies/rollen die vermeld worden op werkenbij pagina's
8. USP's of werkgeversvoordelen
9. Employer branding signalen
10. Waarom kandidaten hier zouden willen werken`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_website_analysis",
              description: "Save structured website analysis results",
              parameters: {
                type: "object",
                properties: {
                  description: { type: "string", description: "Korte organisatiebeschrijving" },
                  mission: { type: "string", description: "Missie indien gevonden" },
                  vision: { type: "string", description: "Visie indien gevonden" },
                  tone_of_voice: { type: "string", description: "Gedetecteerde tone of voice / communicatiestijl" },
                  employer_branding: { type: "string", description: "Employer branding signalen" },
                  why_work_here: { type: "string", description: "Waarom hier werken, volgens de website" },
                  locations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        city: { type: "string" },
                        region: { type: "string" },
                      },
                      required: ["name"],
                    },
                    description: "Gevonden locaties",
                  },
                  care_types: {
                    type: "array",
                    items: { type: "string" },
                    description: "Geïdentificeerde zorgtypen",
                  },
                  roles: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        role_title: { type: "string" },
                        care_domain: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["role_title"],
                    },
                    description: "Gevonden functies/rollen",
                  },
                  usps: {
                    type: "array",
                    items: { type: "string" },
                    description: "Werkgevers USP's",
                  },
                  confidence_notes: { type: "string", description: "Notities over de betrouwbaarheid van de analyse, wat je wel/niet kon vinden" },
                },
                required: ["description", "care_types", "confidence_notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_website_analysis" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errText = await aiResponse.text();
      console.error("AI error:", status, errText);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit bereikt, probeer het later opnieuw." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return structured output");

    const analysis = JSON.parse(toolCall.function.arguments);

    // Store analysis data in learning profile
    const { data: existing } = await sb
      .from("client_learning_profiles")
      .select("id")
      .eq("client_id", client_id)
      .single();

    const updateData = {
      website_analysis_data: analysis,
      website_analyzed_at: new Date().toISOString(),
    };

    if (existing) {
      await sb.from("client_learning_profiles").update(updateData).eq("client_id", client_id);
    } else {
      await sb.from("client_learning_profiles").insert({ client_id, ...updateData });
    }

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-website error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
