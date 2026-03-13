import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { campaign_request_id } = await req.json();
    if (!campaign_request_id) throw new Error("campaign_request_id is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch campaign request
    const { data: request, error: reqErr } = await supabase
      .from("campaign_requests")
      .select("*")
      .eq("id", campaign_request_id)
      .single();
    if (reqErr || !request) throw new Error("Campaign request not found");

    const clientId = request.client_id;

    // 2. Fetch all client context in parallel
    const [clientRes, brandRes, locationsRes, rolesRes, audienceRes, learningsRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", clientId).single(),
      supabase.from("client_brand_profiles").select("*").eq("client_id", clientId).single(),
      supabase.from("client_locations").select("*").eq("client_id", clientId),
      supabase.from("client_roles").select("*").eq("client_id", clientId),
      supabase.from("client_audience_insights").select("*").eq("client_id", clientId),
      supabase.from("client_learnings").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(10),
    ]);

    const client = clientRes.data;
    if (!client) throw new Error("Client not found");

    const brand = brandRes.data;
    const locations = locationsRes.data || [];
    const roles = rolesRes.data || [];
    const audience = audienceRes.data || [];
    const learnings = learningsRes.data || [];

    // 3. Build context prompt
    const contextSections: string[] = [];

    contextSections.push(`## Client: ${client.name}\nCare type: ${client.care_type || "Not specified"}\nDescription: ${client.description || "Not specified"}`);

    if (brand) {
      contextSections.push(`## Employer Branding\nTone of voice: ${brand.tone_of_voice || "Not specified"}\nEmployer branding: ${brand.employer_branding || "Not specified"}\nWhy work here: ${brand.why_work_here || "Not specified"}\nVisual style: ${brand.visual_style_notes || "Not specified"}\nWords to use: ${(brand.words_to_use || []).join(", ") || "Not specified"}\nWords to avoid: ${(brand.words_to_avoid || []).join(", ") || "Not specified"}`);
    }

    if (locations.length > 0) {
      const locList = locations.map((l: any) => `- ${l.name} (${l.city || ""}, ${l.region || ""}) ${l.is_commute_friendly ? "[commute-friendly]" : ""} ${l.notes || ""}`).join("\n");
      contextSections.push(`## Locations\n${locList}`);
    }

    if (roles.length > 0) {
      const roleList = roles.map((r: any) => `- ${r.role_title} (${r.care_domain || ""}): ${r.description || ""}\n  Qualifications: ${(r.qualifications || []).join(", ")}\n  Audience triggers: ${(r.audience_triggers || []).join(", ")}\n  Audience objections: ${(r.audience_objections || []).join(", ")}`).join("\n");
      contextSections.push(`## Roles\n${roleList}`);
    }

    if (audience.length > 0) {
      const audList = audience.map((a: any) => `- ${a.segment_name}: ${a.description || ""}\n  Triggers: ${(a.triggers || []).join(", ")}\n  Objections: ${(a.objections || []).join(", ")}\n  Platform notes: ${a.platform_notes || ""}`).join("\n");
      contextSections.push(`## Audience Insights\n${audList}`);
    }

    if (learnings.length > 0) {
      const learnList = learnings.map((l: any) => `- Concept: ${l.concept || "?"} | Hook: ${l.hook_used || "?"} | Result: ${l.result || "?"}\n  What worked: ${l.what_worked || "?"}\n  What failed: ${l.what_failed || "?"}\n  Audience resonance: ${l.audience_resonance || "?"}`).join("\n");
      contextSections.push(`## Recent Campaign Learnings\n${learnList}`);
    }

    const clientContext = contextSections.join("\n\n");

    const campaignDetails = `
## Campaign Request
- Role/vacancy: ${request.role_title || "Not specified"}
- Region: ${request.region || "Not specified"}
- Channel: ${request.channel || "Meta"}
- Objective: ${request.objective || "Generate applications"}
- Creative type: ${request.creative_type || "Static image"}
- Priority audience: ${request.priority_audience || "Not specified"}
- Campaign focus: ${request.campaign_focus || "Not specified"}
- Angle preference: ${request.angle_preference || "Mix of both"}
- Urgency: ${request.urgency || "Normal"}
- Internal notes: ${request.internal_notes || "None"}
    `.trim();

    const systemPrompt = `You are a senior recruitment marketing strategist specialized in Dutch healthcare recruitment campaigns on Meta (Facebook/Instagram).

You understand latent job-seeking candidates — people not actively searching but open to the right opportunity. You think in terms of recruitment psychology, employer branding, campaign hooks, audience objections and triggers, and practical creative direction.

Your output must be concrete, specific, usable, and grounded in the client context provided. Never produce generic marketing fluff. Always think about what would make a healthcare professional stop scrolling on their phone.

CRITICAL: Only use information from the client context below. Never mix or invent information from other organizations.

${clientContext}`;

    const userPrompt = `Based on the client context and the campaign request below, generate a structured creative briefing.

${campaignDetails}

Return a JSON object with EXACTLY these keys:
- client (string): client name
- role (string): the specific role
- region (string): target region
- target_audience (string): description of the target audience
- campaign_objective (string): what we want to achieve
- key_recruitment_challenge (string): main challenge in recruiting for this role
- main_hook (string): the primary hook to stop scrolling
- audience_tension (string): the emotional tension or trigger we're leveraging
- core_message (string): the central message of the campaign
- proof_points_usps (array of strings): 3-5 concrete proof points / USPs
- creative_direction (string): overall creative approach
- visual_concept (string): what the visual should look like
- suggested_scenes (string): specific scene or static concept description
- onscreen_copy_ideas (array of strings): 3-4 on-screen text suggestions
- ad_copy_starter (string): a draft ad copy paragraph
- hook_variants (array of strings): 3-4 alternative hooks
- cta_direction (string): call-to-action direction
- what_to_avoid (array of strings): 3-5 things to avoid
- notes_for_designer (string): practical notes for the designer
- notes_for_recruiter (string): practical notes for the recruiter
- internal_comments (string): any strategic observations

Write all content in Dutch unless the field name is English-only. The ad copy and hooks MUST be in Dutch.`;

    // 4. Call Lovable AI with tool calling for structured output
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
              description: "Create a structured creative briefing for a recruitment campaign",
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
                },
                required: [
                  "client", "role", "region", "target_audience", "campaign_objective",
                  "key_recruitment_challenge", "main_hook", "audience_tension", "core_message",
                  "proof_points_usps", "creative_direction", "visual_concept", "suggested_scenes",
                  "onscreen_copy_ideas", "ad_copy_starter", "hook_variants", "cta_direction",
                  "what_to_avoid", "notes_for_designer", "notes_for_recruiter", "internal_comments",
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
      if (status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", status, errText);
      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return structured output");

    const briefingContent = JSON.parse(toolCall.function.arguments);

    // 5. Save to database
    const { data: savedBriefing, error: saveErr } = await supabase
      .from("generated_briefings")
      .insert({
        campaign_request_id: campaign_request_id,
        client_id: clientId,
        content: briefingContent,
        status: "draft",
        version: 1,
      })
      .select("id")
      .single();

    if (saveErr) {
      console.error("Save error:", saveErr);
      // Still return the briefing even if save fails
    }

    // Update campaign request status
    await supabase
      .from("campaign_requests")
      .update({ status: "generated" })
      .eq("id", campaign_request_id);

    return new Response(
      JSON.stringify({
        briefing: briefingContent,
        briefing_id: savedBriefing?.id || null,
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
