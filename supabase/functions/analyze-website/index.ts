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
            content: `Je bent een expert in het analyseren van zorgorganisatie-websites voor recruitment marketing.

Analyseer de website URL grondig. Probeer niet alleen de homepage maar ook over-ons, zorgaanbod, locaties, werkenbij en vacaturepagina's te begrijpen.

BELANGRIJK:
- Wees eerlijk als je iets niet kunt vinden — laat het veld dan leeg
- Focus op feitelijke informatie, geen verzinsels
- Schrijf in het Nederlands
- Wees concreet en specifiek`,
          },
          {
            role: "user",
            content: `Analyseer deze zorgorganisatie website grondig voor recruitment marketing: ${website_url}

Extraheer zoveel mogelijk:
1. Organisatiebeschrijving (kort maar informatief)
2. Missie en visie (als gevonden, anders leeg laten)
3. Tone of voice / communicatiestijl
4. Employer branding hints (waarom hier werken)
5. Alle locaties, steden, regio's die genoemd worden
6. Zorgtypen (kies uit: thuiszorg, revalidatie, verpleeghuis, intramuraal, extramuraal, PG, somatiek, flexpool, wijkzorg, dementiezorg, gehandicaptenzorg, jeugdzorg, GGZ, hospice, geriatrische revalidatiezorg — of voeg toe als relevant)
7. Functies/rollen op werkenbij pagina's
8. USP's of werkgeversvoordelen`,
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
                  mission: { type: "string", description: "Missie indien gevonden, anders leeg" },
                  vision: { type: "string", description: "Visie indien gevonden, anders leeg" },
                  tone_of_voice: { type: "string", description: "Gedetecteerde tone of voice" },
                  employer_branding: { type: "string", description: "Employer branding signalen" },
                  why_work_here: { type: "string", description: "Waarom hier werken" },
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
                  },
                  care_types: {
                    type: "array",
                    items: { type: "string" },
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
                  },
                  usps: {
                    type: "array",
                    items: { type: "string" },
                  },
                  confidence_notes: { type: "string" },
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
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Onvoldoende credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return structured output");

    const analysis = JSON.parse(toolCall.function.arguments);

    // === DIRECTLY WRITE INTO THE CORRECT TABLES ===

    // 1. Update clients table with description, mission, vision
    const clientUpdate: Record<string, any> = {};
    if (analysis.description) clientUpdate.description = analysis.description;
    if (analysis.mission) clientUpdate.mission = analysis.mission;
    if (analysis.vision) clientUpdate.vision = analysis.vision;
    if (Object.keys(clientUpdate).length > 0) {
      await sb.from("clients").update(clientUpdate).eq("id", client_id);
    }

    // 2. Upsert learning profile with tone, care_types, employer branding, etc.
    const fieldStatuses: Record<string, string> = {};
    const profileData: Record<string, any> = {
      client_id: client_id,
      website_analysis_data: analysis,
      website_analyzed_at: new Date().toISOString(),
    };

    if (analysis.tone_of_voice) {
      profileData.tone_of_voice = analysis.tone_of_voice;
      fieldStatuses.tone_of_voice = "suggested";
    }
    if (analysis.employer_branding) {
      profileData.employer_branding = analysis.employer_branding;
      fieldStatuses.employer_branding = "suggested";
    }
    if (analysis.why_work_here) {
      profileData.why_work_here = analysis.why_work_here;
      fieldStatuses.why_work_here = "suggested";
    }
    if (analysis.care_types?.length) {
      profileData.care_types = analysis.care_types;
      fieldStatuses.care_types = "suggested";
    }
    if (analysis.description) fieldStatuses.description = "suggested";
    if (analysis.mission) fieldStatuses.mission = "suggested";
    if (analysis.vision) fieldStatuses.vision = "suggested";

    profileData.field_statuses = fieldStatuses;

    const { data: existing } = await sb
      .from("client_learning_profiles")
      .select("id")
      .eq("client_id", client_id)
      .single();

    if (existing) {
      await sb.from("client_learning_profiles").update(profileData).eq("client_id", client_id);
    } else {
      await sb.from("client_learning_profiles").insert(profileData);
    }

    // 3. Insert locations
    if (analysis.locations?.length) {
      const locInserts = analysis.locations.map((l: any) => ({
        client_id: client_id,
        name: l.name,
        city: l.city || null,
        region: l.region || null,
      }));
      await sb.from("client_locations").insert(locInserts);
      fieldStatuses.locations = "suggested";
      // Update field_statuses again
      await sb.from("client_learning_profiles").update({ field_statuses: fieldStatuses }).eq("client_id", client_id);
    }

    // 4. Insert roles
    if (analysis.roles?.length) {
      const roleInserts = analysis.roles.map((r: any) => ({
        client_id: client_id,
        role_title: r.role_title,
        care_domain: r.care_domain || null,
        description: r.description || null,
      }));
      await sb.from("client_roles").insert(roleInserts);
      fieldStatuses.roles = "suggested";
      await sb.from("client_learning_profiles").update({ field_statuses: fieldStatuses }).eq("client_id", client_id);
    }

    // 5. Insert USPs
    if (analysis.usps?.length) {
      const uspInserts = analysis.usps.map((u: string, i: number) => ({
        client_id: client_id,
        usp_text: u,
        sort_order: i,
      }));
      await sb.from("client_usps").insert(uspInserts);
      fieldStatuses.usps = "suggested";
      await sb.from("client_learning_profiles").update({ field_statuses: fieldStatuses }).eq("client_id", client_id);
    }

    return new Response(
      JSON.stringify({ success: true }),
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
