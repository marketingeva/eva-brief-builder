import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  analyst: `Je bent de Ads Performance Analyst, een AI-agent binnen een recruitment marketing team voor de zorgsector.
Je specialisatie: analyseren van Meta Ads campagnedata en het geven van strategische aanbevelingen.
Je hebt toegang tot de campagnedata en learnings van deze specifieke klant.
Antwoord altijd in het Nederlands. Wees concreet, data-driven en actionable.`,

  trend_scout: `Je bent de Trend Scout, een AI-agent die de Facebook Ads Library monitort voor trends in recruitment advertising.
Je specialisatie: het identificeren van trending hooks, copy-patronen en creatieve strategieën in de zorgsector.
Je hebt toegang tot eerdere trendscans en de context van deze specifieke klant.
Antwoord altijd in het Nederlands. Geef concrete voorbeelden en inspiratie.`,

  copywriter: `Je bent de Creative Copywriter, een AI-agent gespecialiseerd in het schrijven van high-performance recruitment ad copy.
Je specialisatie: Meta ad copy (primary text, headlines, CTAs) die latent werkzoekenden in de zorg aanspreekt.
Je schrijft altijd op basis van het Learning profiel van de klant — tone of voice, USPs, employer branding.
Antwoord altijd in het Nederlands. Schrijf scroll-stopping copy met emotionele hooks.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { client_id, agent_type, messages } = await req.json();
    if (!client_id || !agent_type || !messages?.length) {
      return new Response(JSON.stringify({ error: "client_id, agent_type, and messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch client context
    const [clientRes, learningRes, uspsRes, reportsRes] = await Promise.all([
      sb.from("clients").select("name, care_type, description, mission, vision, website_url").eq("id", client_id).single(),
      sb.from("client_learning_profiles").select("*").eq("client_id", client_id).single(),
      sb.from("client_usps").select("usp_text").eq("client_id", client_id),
      sb.from("agent_reports").select("agent_type, report_type, content, created_at")
        .eq("client_id", client_id).order("created_at", { ascending: false }).limit(5),
    ]);

    const client = clientRes.data;
    const learning = learningRes.data;
    const usps = uspsRes.data?.map((u: any) => u.usp_text) || [];
    const recentReports = reportsRes.data || [];

    // Build context block
    let contextBlock = `## Klant: ${client?.name || "Onbekend"}
Type zorg: ${client?.care_type || "n/a"}
Beschrijving: ${client?.description || "n/a"}
Website: ${client?.website_url || "n/a"}
Missie: ${client?.mission || "n/a"}
`;

    if (learning) {
      contextBlock += `
## Learning profiel
Tone of voice: ${learning.tone_of_voice || "n/a"}
Employer branding: ${learning.employer_branding || "n/a"}
Why work here: ${learning.why_work_here || "n/a"}
Communicatie richtlijnen: ${learning.communication_guidelines || "n/a"}
Woorden gebruiken: ${learning.words_to_use?.join(", ") || "n/a"}
Woorden vermijden: ${learning.words_to_avoid?.join(", ") || "n/a"}
Creative do's: ${learning.creative_dos?.join(", ") || "n/a"}
Creative don'ts: ${learning.creative_donts?.join(", ") || "n/a"}
`;
    }

    if (usps.length > 0) {
      contextBlock += `\n## USPs\n${usps.map((u: string) => `- ${u}`).join("\n")}`;
    }

    if (recentReports.length > 0) {
      contextBlock += `\n## Recente agent rapporten`;
      for (const r of recentReports.slice(0, 3)) {
        const content = r.content as any;
        const summary = content?.analysis?.substring(0, 500) || content?.summary || "n/a";
        contextBlock += `\n### ${r.agent_type} - ${r.report_type} (${new Date(r.created_at).toLocaleDateString("nl-NL")})\n${summary}...`;
      }
    }

    const systemPrompt = (SYSTEM_PROMPTS[agent_type] || SYSTEM_PROMPTS.analyst) +
      `\n\n## KLANT CONTEXT (gebruik dit in je antwoorden)\n${contextBlock}`;

    // Stream response from AI
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
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

    return new Response(aiResp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("agent-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
