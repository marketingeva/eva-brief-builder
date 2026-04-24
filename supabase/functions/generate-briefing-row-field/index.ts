// Edge Function: AI-tekst genereren voor een briefing-rij veld (hook / usps / omschrijving)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { client_id, field, functies = [], locaties = [], context = "" } = await req.json();

    if (!client_id || !field) {
      return new Response(JSON.stringify({ error: "client_id en field zijn verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY niet geconfigureerd");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Klant + learnings + USPs
    const [{ data: client }, { data: learning }, { data: usps }] = await Promise.all([
      supabase.from("clients").select("name, care_type, mission, vision, description").eq("id", client_id).maybeSingle(),
      supabase.from("client_learning_profiles").select("tone_of_voice, why_work_here, employer_branding, words_to_use, words_to_avoid, communication_guidelines").eq("client_id", client_id).maybeSingle(),
      supabase.from("client_usps").select("usp_text").eq("client_id", client_id).order("sort_order"),
    ]);

    const fieldInstructions: Record<string, string> = {
      hook: "Schrijf één pakkende hook (max 1 zin, 8-14 woorden) voor een wervingsadvertentie. Direct, menselijk, geen marketingtaal. Spreek de doelgroep aan.",
      usps: "Geef 3 korte, krachtige USP-bullets (elk max 8 woorden). Concreet en specifiek voor deze functie/locatie. Geen clichés. Eén USP per regel, beginnend met •.",
      omschrijving: "Schrijf een korte omschrijving (max 2 zinnen) van wat er visueel op de advertentie te zien moet zijn. Beschrijf scène, emotie, sfeer. Voor de grafisch vormgever.",
    };
    const instruction = fieldInstructions[field];
    if (!instruction) {
      return new Response(JSON.stringify({ error: "Onbekend veld" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const systemPrompt = `Je bent een Nederlandse zorg-recruitment marketingstrateeg voor ${client?.name || "een zorgorganisatie"}. Schrijf altijd in het Nederlands. Geen marketingfluff, geen overdrijvingen.

KLANT: ${client?.name || ""}${client?.care_type ? ` (${client.care_type})` : ""}
${client?.description ? `Over: ${client.description}` : ""}
${learning?.tone_of_voice ? `Tone of voice: ${learning.tone_of_voice}` : ""}
${learning?.why_work_here ? `Waarom hier werken: ${learning.why_work_here}` : ""}
${learning?.employer_branding ? `Employer branding: ${learning.employer_branding}` : ""}
${usps?.length ? `Klant-USPs: ${usps.map((u: any) => u.usp_text).join(" | ")}` : ""}
${learning?.words_to_use?.length ? `Gebruik woorden: ${learning.words_to_use.join(", ")}` : ""}
${learning?.words_to_avoid?.length ? `Vermijd woorden: ${learning.words_to_avoid.join(", ")}` : ""}
${learning?.communication_guidelines ? `Richtlijnen: ${learning.communication_guidelines}` : ""}`;

    const userPrompt = `Functie(s): ${functies.join(", ") || "niet gespecificeerd"}
Locatie(s): ${locaties.join(", ") || "niet gespecificeerd"}
${context ? `Extra context: ${context}` : ""}

OPDRACHT: ${instruction}

Geef alleen de tekst terug, geen toelichting, geen aanhalingstekens.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Even wachten — te veel verzoeken." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Lovable AI tegoed op." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway fout" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const json = await aiResp.json();
    const text = json.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-briefing-row-field error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
