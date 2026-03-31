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
    const { briefing_request_id } = await req.json();
    if (!briefing_request_id) throw new Error("briefing_request_id is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // 1. Fetch briefing request
    const { data: request, error: reqErr } = await sb
      .from("briefing_requests")
      .select("*")
      .eq("id", briefing_request_id)
      .single();
    if (reqErr || !request) throw new Error("Briefing request not found");

    const clientId = request.client_id;

    // 2. Fetch all client context in parallel
    const [clientRes, learningRes, uspsRes, rolesRes, locationsRes, audienceRes, learningsRes, reportsRes] = await Promise.all([
      sb.from("clients").select("*").eq("id", clientId).single(),
      sb.from("client_learning_profiles").select("*").eq("client_id", clientId).single(),
      sb.from("client_usps").select("usp_text").eq("client_id", clientId),
      sb.from("client_roles").select("*").eq("client_id", clientId),
      sb.from("client_locations").select("*").eq("client_id", clientId),
      sb.from("client_audience_insights").select("*").eq("client_id", clientId),
      sb.from("client_learnings").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(10),
      sb.from("agent_reports").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(5),
    ]);

    const client = clientRes.data;
    if (!client) throw new Error("Client not found");
    const learning = learningRes.data;
    const usps = uspsRes.data?.map((u: any) => u.usp_text) || [];
    const roles = rolesRes.data || [];
    const locations = locationsRes.data || [];
    const audience = audienceRes.data || [];
    const learnings = learningsRes.data || [];
    const reports = reportsRes.data || [];

    // 3. Build context
    const ctx: string[] = [];
    ctx.push(`## Client: ${client.name}\nZorgtype: ${client.care_type || "-"}\nMissie: ${client.mission || "-"}\nVisie: ${client.vision || "-"}`);

    if (learning) {
      ctx.push(`## Merk & Communicatie\nTone of voice: ${learning.tone_of_voice || "-"}\nCommunicatierichtlijnen: ${learning.communication_guidelines || "-"}\nEmployer branding: ${learning.employer_branding || "-"}\nWaarom hier werken: ${learning.why_work_here || "-"}\nStrategische wervingsdoelen: ${learning.strategic_recruitment_goals || "-"}\nWoorden te gebruiken: ${(learning.words_to_use || []).join(", ") || "-"}\nWoorden te vermijden: ${(learning.words_to_avoid || []).join(", ") || "-"}\nCreatieve do's: ${(learning.creative_dos || []).join(", ") || "-"}\nCreatieve don'ts: ${(learning.creative_donts || []).join(", ") || "-"}`);
    }

    if (usps.length > 0) ctx.push(`## USP's\n${usps.map((u: string) => `- ${u}`).join("\n")}`);
    if (locations.length > 0) ctx.push(`## Locaties\n${locations.map((l: any) => `- ${l.name} (${l.city || ""}, ${l.region || ""}) ${l.recruitment_region ? `[regio: ${l.recruitment_region}]` : ""}`).join("\n")}`);
    if (roles.length > 0) ctx.push(`## Rollen\n${roles.map((r: any) => `- ${r.role_title} (${r.care_domain || ""}): ${r.description || ""}\n  Kwalificaties: ${(r.qualifications || []).join(", ")}\n  Triggers: ${(r.audience_triggers || []).join(", ")}\n  Bezwaren: ${(r.audience_objections || []).join(", ")}`).join("\n")}`);
    if (audience.length > 0) ctx.push(`## Doelgroepen\n${audience.map((a: any) => `- ${a.segment_name}: ${a.description || ""}\n  Triggers: ${(a.triggers || []).join(", ")}\n  Bezwaren: ${(a.objections || []).join(", ")}`).join("\n")}`);
    if (learnings.length > 0) ctx.push(`## Recente learnings\n${learnings.slice(0, 5).map((l: any) => `- ${l.concept || "?"}: Wat werkte: ${l.what_worked || "?"} | Wat niet: ${l.what_failed || "?"}`).join("\n")}`);

    // Add agent reports context
    if (reports.length > 0) {
      const trendReports = reports.filter((r: any) => r.agent_type === "trend_scout");
      const analystReports = reports.filter((r: any) => r.agent_type === "analyst");
      if (trendReports.length > 0) {
        const latest = trendReports[0];
        const content = typeof latest.content === "string" ? latest.content : JSON.stringify(latest.content);
        ctx.push(`## Laatste Trend Analyse\n${content.slice(0, 2000)}`);
      }
      if (analystReports.length > 0) {
        const latest = analystReports[0];
        const content = typeof latest.content === "string" ? latest.content : JSON.stringify(latest.content);
        ctx.push(`## Laatste Performance Analyse\n${content.slice(0, 2000)}`);
      }
    }

    const clientContext = ctx.join("\n\n");

    // 4. Build request details
    const numVariations = request.num_variations || 1;
    const requestDetails = `
## Briefing Request
- Functie(s): ${(request.functions || []).join(", ")}
- Locatie: ${request.location || "Niet gespecificeerd"}
- Uren: ${request.hours_type || "flexible"}
- Dienstverband: ${request.employment_type || "loondienst"}
- Doelgroep: ${request.target_audience || "Niet gespecificeerd"}
- Zorgtype: ${request.care_type || "Niet gespecificeerd"}
- CTA: ${request.cta || "Niet gespecificeerd"}
- USP's: ${request.usps || "Gebruik client USP's"}
- Stijl: ${request.style || "warm"}
- Nieuw concept: ${request.is_new_concept ? "Ja" : "Nee, remake"}
- Creative type: ${request.creative_type || "static"}
- Prioriteit: ${request.priority || "balanced"}
- Harde eisen: ${request.hard_requirements || "Geen"}
- Woorden te vermijden: ${request.words_to_avoid || "Geen"}
- Extra notities: ${request.extra_notes || "Geen"}
- Aantal variaties: ${numVariations}
    `.trim();

    const systemPrompt = `Je bent een senior recruitment marketing strateeg gespecialiseerd in Nederlandse zorgwervingscampagnes op Meta (Facebook/Instagram).

Je begrijpt latente werkzoekenden — mensen die niet actief zoeken maar openstaan voor de juiste kans. Je denkt in termen van wervingspsychologie, employer branding, campagne hooks, bezwaren en triggers.

Je output moet concreet, specifiek, bruikbaar en gefundeerd zijn op de verstrekte clientcontext. Produceer nooit generiek marketingtaal. Denk altijd na over wat een zorgprofessional zou laten stoppen met scrollen.

KRITISCH: Gebruik alleen informatie uit de clientcontext. Verzin nooit informatie van andere organisaties.

${clientContext}`;

    const userPrompt = `Op basis van de clientcontext en het briefing request hieronder, genereer een gestructureerd creatief briefing.

${requestDetails}

Genereer ${numVariations} briefing variatie(s).

Gebruik de functie create_briefing_rows om de output te structureren. Elke variatie wordt een rij met: is_new, functie, locatie, hook, usps, omschrijving, en creative_inspiratie.

Genereer daarnaast een overkoepelend briefing document met strategische context.`;

    // 5. Call AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_briefing",
              description: "Create a structured creative briefing with rows for the designer",
              parameters: {
                type: "object",
                properties: {
                  client: { type: "string" },
                  role: { type: "string" },
                  region: { type: "string" },
                  target_audience: { type: "string" },
                  campaign_objective: { type: "string" },
                  key_recruitment_challenge: { type: "string" },
                  main_hook: { type: "string" },
                  audience_tension: { type: "string" },
                  core_message: { type: "string" },
                  proof_points_usps: { type: "array", items: { type: "string" } },
                  creative_direction: { type: "string" },
                  visual_concept: { type: "string" },
                  suggested_scenes: { type: "string" },
                  onscreen_copy_ideas: { type: "array", items: { type: "string" } },
                  ad_copy_starter: { type: "string" },
                  hook_variants: { type: "array", items: { type: "string" } },
                  cta_direction: { type: "string" },
                  what_to_avoid: { type: "array", items: { type: "string" } },
                  notes_for_designer: { type: "string" },
                  notes_for_recruiter: { type: "string" },
                  internal_comments: { type: "string" },
                  rows: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        is_new: { type: "boolean" },
                        functie: { type: "string" },
                        locatie: { type: "string" },
                        hook: { type: "string" },
                        usps: { type: "string" },
                        omschrijving: { type: "string" },
                        creative_inspiratie: { type: "string" },
                      },
                      required: ["functie", "hook", "omschrijving"],
                    },
                    description: "Briefing rows for the designer spreadsheet, one per variation",
                  },
                },
                required: [
                  "client", "role", "region", "target_audience", "campaign_objective",
                  "key_recruitment_challenge", "main_hook", "audience_tension", "core_message",
                  "proof_points_usps", "creative_direction", "visual_concept", "suggested_scenes",
                  "onscreen_copy_ideas", "ad_copy_starter", "hook_variants", "cta_direction",
                  "what_to_avoid", "notes_for_designer", "notes_for_recruiter", "internal_comments",
                  "rows",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_briefing" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errText = await aiResponse.text();
      console.error("AI error:", status, errText);

      await sb.from("briefing_requests").update({ status: "error" }).eq("id", briefing_request_id);

      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit bereikt, probeer het later opnieuw." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Tegoed op, voeg credits toe." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      await sb.from("briefing_requests").update({ status: "error" }).eq("id", briefing_request_id);
      throw new Error("AI did not return structured output");
    }

    const result = JSON.parse(toolCall.function.arguments);
    const { rows: briefingRows, ...briefingContent } = result;

    // 6. Create campaign_request record (FK required by generated_briefings)
    const { data: campaignReq, error: campErr } = await sb
      .from("campaign_requests")
      .insert({
        client_id: clientId,
        created_by: request.created_by,
        role_title: (request.functions || [])[0] || "Briefing",
        objective: "Content briefing",
        status: "draft",
        internal_notes: `Vanuit briefing request ${briefing_request_id}`,
      })
      .select("id")
      .single();

    if (campErr || !campaignReq) {
      console.error("Create campaign request error:", campErr);
      throw campErr || new Error("Failed to create campaign request");
    }

    // 7. Save generated briefing
    const { data: savedBriefing, error: saveErr } = await sb
      .from("generated_briefings")
      .insert({
        campaign_request_id: campaignReq.id,
        client_id: clientId,
        content: { ...briefingContent, briefing_request_id: briefing_request_id },
        status: "draft",
        version: 1,
        week_number: request.week_number,
      })
      .select("id")
      .single();

    if (saveErr) {
      console.error("Save briefing error:", saveErr);
      throw saveErr;
    }

    // 7. Save briefing rows
    if (Array.isArray(briefingRows) && briefingRows.length > 0 && savedBriefing) {
      const rowInserts = briefingRows.map((row: any, idx: number) => ({
        briefing_id: savedBriefing.id,
        client_id: clientId,
        is_new: row.is_new ?? request.is_new_concept ?? true,
        functie: row.functie || (request.functions || [])[0] || null,
        locatie: row.locatie || request.location || null,
        hook: row.hook || null,
        usps: row.usps || request.usps || null,
        omschrijving: row.omschrijving || null,
        creative_inspiratie: row.creative_inspiratie || null,
        sort_order: idx,
      }));

      const { error: rowErr } = await sb.from("briefing_rows").insert(rowInserts);
      if (rowErr) console.error("Save rows error:", rowErr);
    }

    return new Response(
      JSON.stringify({
        briefing_id: savedBriefing.id,
        briefing: briefingContent,
        rows: briefingRows || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-briefing error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
