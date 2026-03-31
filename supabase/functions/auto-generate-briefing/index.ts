import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Optional: specific client_id from body, otherwise all clients
    let targetClientIds: string[] = [];
    try {
      const body = await req.json();
      if (body.client_id) targetClientIds = [body.client_id];
    } catch { /* no body = all clients */ }

    if (targetClientIds.length === 0) {
      const { data: clients } = await sb.from("clients").select("id");
      targetClientIds = (clients || []).map((c: any) => c.id);
    }

    const weekNumber = getWeekNumber(new Date());
    const results: any[] = [];

    for (const clientId of targetClientIds) {
      try {
        // Check if briefing already exists for this week
        const { data: existing } = await sb
          .from("generated_briefings")
          .select("id")
          .eq("client_id", clientId)
          .eq("week_number", weekNumber)
          .limit(1);

        if (existing && existing.length > 0) {
          results.push({ clientId, status: "skipped", reason: "already_exists" });
          continue;
        }

        // Fetch all client context in parallel
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
        if (!client) {
          results.push({ clientId, status: "error", reason: "client_not_found" });
          continue;
        }

        const learning = learningRes.data;
        const usps = uspsRes.data?.map((u: any) => u.usp_text) || [];
        const roles = rolesRes.data || [];
        const locations = locationsRes.data || [];
        const audience = audienceRes.data || [];
        const learnings = learningsRes.data || [];
        const reports = reportsRes.data || [];

        // Build context
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

        // Add agent reports context (trend scout + analyst)
        if (reports.length > 0) {
          const trendReports = reports.filter((r: any) => r.agent_type === "trend_scout");
          const analystReports = reports.filter((r: any) => r.agent_type === "analyst");

          if (trendReports.length > 0) {
            const latest = trendReports[0];
            const content = typeof latest.content === "string" ? latest.content : JSON.stringify(latest.content);
            ctx.push(`## Laatste Trend Analyse (${new Date(latest.created_at).toLocaleDateString("nl-NL")})\n${content.slice(0, 3000)}`);
          }
          if (analystReports.length > 0) {
            const latest = analystReports[0];
            const content = typeof latest.content === "string" ? latest.content : JSON.stringify(latest.content);
            ctx.push(`## Laatste Performance Analyse (${new Date(latest.created_at).toLocaleDateString("nl-NL")})\n${content.slice(0, 3000)}`);
          }
        }

        const clientContext = ctx.join("\n\n");

        // Build auto-briefing prompt — AI decides what to brief based on all available data
        const systemPrompt = `Je bent een senior recruitment marketing strateeg gespecialiseerd in Nederlandse zorgwervingscampagnes op Meta (Facebook/Instagram).

Je begrijpt latente werkzoekenden — mensen die niet actief zoeken maar openstaan voor de juiste kans. Je denkt in termen van wervingspsychologie, employer branding, campagne hooks, bezwaren en triggers.

Je output moet concreet, specifiek, bruikbaar en gefundeerd zijn op de verstrekte clientcontext. Produceer nooit generiek marketingtaal.

KRITISCH: Gebruik alleen informatie uit de clientcontext. Verzin nooit informatie van andere organisaties.

${clientContext}`;

        const userPrompt = `Dit is een automatisch wekelijks briefing voor week ${weekNumber}.

Op basis van ALLE beschikbare informatie over deze client — rollen, locaties, USP's, recente learnings, trendanalyses en performance data — genereer een strategisch content briefing voor deze week.

Richtlijnen:
- Focus op de rollen en locaties die het meest urgent zijn (op basis van learnings en trends)
- Gebruik hooks en copy-patronen die recent goed presteerden
- Vermijd aanpakken die niet werkten (zie learnings)
- Gebruik actuele markttrends als die beschikbaar zijn
- Genereer 3-5 variaties (briefing rows) met verschillende hooks en invalshoeken
- Elke rij moet een andere functie/locatie combinatie of een andere creatieve invalshoek zijn

Gebruik de functie create_briefing om het briefing te structureren.`;

        // Call AI
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
          const errText = await aiResponse.text();
          console.error(`AI error for client ${clientId}:`, aiResponse.status, errText);
          results.push({ clientId, status: "error", reason: `ai_error_${aiResponse.status}` });
          continue;
        }

        const aiData = await aiResponse.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall) {
          results.push({ clientId, status: "error", reason: "no_structured_output" });
          continue;
        }

        const result = JSON.parse(toolCall.function.arguments);
        const { rows: briefingRows, ...briefingContent } = result;

        // Create a campaign_request for the auto-briefing
        const { data: autoRequest, error: reqErr } = await sb
          .from("campaign_requests")
          .insert({
            client_id: clientId,
            created_by: "00000000-0000-0000-0000-000000000000",
            role_title: briefingContent.role || "Auto-briefing",
            objective: "Wekelijkse automatische briefing",
            status: "draft",
            internal_notes: `Auto-gegenereerd voor week ${weekNumber}`,
          })
          .select("id")
          .single();

        if (reqErr || !autoRequest) {
          console.error("Create campaign request error:", reqErr);
          results.push({ clientId, status: "error", reason: "campaign_request_failed" });
          continue;
        }

        // Save generated briefing
        const { data: savedBriefing, error: saveErr } = await sb
          .from("generated_briefings")
          .insert({
            campaign_request_id: autoRequest.id,
            client_id: clientId,
            content: { ...briefingContent, auto_generated: true },
            status: "draft",
            version: 1,
            week_number: weekNumber,
          })
          .select("id")
          .single();

        if (saveErr || !savedBriefing) {
          console.error("Save briefing error:", saveErr);
          results.push({ clientId, status: "error", reason: "save_failed" });
          continue;
        }

        // Save briefing rows
        if (Array.isArray(briefingRows) && briefingRows.length > 0) {
          const rowInserts = briefingRows.map((row: any, idx: number) => ({
            briefing_id: savedBriefing.id,
            client_id: clientId,
            is_new: row.is_new ?? true,
            functie: row.functie || null,
            locatie: row.locatie || null,
            hook: row.hook || null,
            usps: row.usps || null,
            omschrijving: row.omschrijving || null,
            creative_inspiratie: row.creative_inspiratie || null,
            sort_order: idx,
          }));
          await sb.from("briefing_rows").insert(rowInserts);
        }

        results.push({ clientId, status: "success", briefingId: savedBriefing.id });
      } catch (clientErr) {
        console.error(`Error for client ${clientId}:`, clientErr);
        results.push({ clientId, status: "error", reason: String(clientErr) });
      }
    }

    return new Response(
      JSON.stringify({ week: weekNumber, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("auto-generate-briefing error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
