import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HookItem {
  hook_text: string;
  hook_category: string;
  rationale?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const role = (body.role || body.query || "").toString().trim();
    const clientId: string | null = body.client_id || null;
    const locationId: string | null = body.location_id || null;

    if (!role) {
      return new Response(JSON.stringify({ error: "role is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== Fetch klant- en locatie-context indien aanwezig =====
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    let clientContext = "";
    let locationContext = "";

    if (clientId) {
      const { data: client } = await supabase
        .from("clients")
        .select("name, description, care_type, mission, vision, website_url")
        .eq("id", clientId)
        .maybeSingle();

      if (client) {
        const parts: string[] = [`Klant: ${client.name}`];
        if (client.care_type) parts.push(`Type zorg: ${client.care_type}`);
        if (client.description) parts.push(`Omschrijving: ${client.description}`);
        if (client.mission) parts.push(`Missie: ${client.mission}`);
        if (client.vision) parts.push(`Visie: ${client.vision}`);

        // Brand profile (tone of voice etc.)
        const { data: brand } = await supabase
          .from("client_brand_profiles")
          .select("*")
          .eq("client_id", clientId)
          .maybeSingle();
        if (brand) {
          if (brand.tone_of_voice) parts.push(`Tone of voice: ${brand.tone_of_voice}`);
          if (brand.brand_values) parts.push(`Kernwaarden: ${brand.brand_values}`);
          if (brand.target_audience) parts.push(`Doelgroep: ${brand.target_audience}`);
          if (brand.usp) parts.push(`USP: ${brand.usp}`);
        }

        clientContext = parts.join("\n");
      }
    }

    if (locationId) {
      const { data: loc } = await supabase
        .from("client_locations")
        .select("name, region, city, recruitment_region, notes, is_commute_friendly")
        .eq("id", locationId)
        .maybeSingle();

      if (loc) {
        const parts: string[] = [`Locatie: ${loc.name}`];
        if (loc.city) parts.push(`Plaats: ${loc.city}`);
        if (loc.region) parts.push(`Regio: ${loc.region}`);
        if (loc.recruitment_region) parts.push(`Wervingsgebied: ${loc.recruitment_region}`);
        if (loc.notes) parts.push(`Notities: ${loc.notes}`);
        if (loc.is_commute_friendly) parts.push(`Goed bereikbaar (woon-werkverkeer-vriendelijk).`);
        locationContext = parts.join("\n");
      }
    }

    const systemPrompt = `Je bent een Nederlandse marketing strateeg voor zorg-recruitment. Je schrijft confronterende, herkenbare openingszinnen ("hooks") voor social media advertenties die zorgprofessionals direct raken in de scroll.

Regels:
- Altijd in het Nederlands, informeel ("je"/"jij").
- Geen marketing-jargon, geen clichés ("Word jij ook...", "Wij zoeken jou!").
- Confronterend, herkenbaar, of nieuwsgierig makend.
- Maximaal 14 woorden per hook.
- Variatie in stijl: pijnpunt-vraag, herkenbaar moment, statement, controversieel, belofte, onverwacht.
- Specifiek voor de functie, niet generiek.
- Wanneer er klant- of locatie-context is meegegeven: stem de hooks daarop af (bijv. regio, type zorg, tone of voice, USP). Noem de klantnaam alleen als het natuurlijk past, gebruik plaatsnaam/regio waar het de hook sterker maakt.`;

    const contextBlock = [clientContext, locationContext].filter(Boolean).join("\n\n");

    const userPrompt = `Genereer 12 confronterende hooks voor advertenties die ${role} aanspreken.${
      contextBlock ? `\n\nContext om de hooks op af te stemmen:\n${contextBlock}` : ""
    }

Geef terug als JSON array met objecten: { "hook_text": "...", "hook_category": "Pijnpunt | Herkenning | Belofte | Vraag | Statement | Controversieel", "rationale": "korte uitleg in 1 zin waarom dit werkt voor deze functie${contextBlock ? " én deze klant/locatie" : ""}" }

Geef alleen de JSON terug, geen extra tekst.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(JSON.stringify({ error: `AI error: ${errText}` }), {
        status: aiRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const content: string = aiData?.choices?.[0]?.message?.content || "";
    let hooks: HookItem[] = [];
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        hooks = JSON.parse(jsonMatch[0]);
      } catch (_e) {
        hooks = [];
      }
    }

    hooks = (hooks || [])
      .filter((h) => h && typeof h.hook_text === "string" && h.hook_text.trim().length > 0)
      .map((h, i) => ({
        hook_text: h.hook_text.trim(),
        hook_category: (h.hook_category || "Algemeen").trim(),
        rationale: h.rationale?.trim() || "",
        id: `hook-${Date.now()}-${i}`,
      }));

    return new Response(JSON.stringify({ role, hooks, used_context: !!contextBlock }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
