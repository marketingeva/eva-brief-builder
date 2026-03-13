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
    const { creative_upload_id, client_id } = await req.json();
    if (!creative_upload_id || !client_id) {
      return new Response(JSON.stringify({ error: "creative_upload_id and client_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch upload info
    const { data: upload } = await sb
      .from("creative_uploads")
      .select("*")
      .eq("id", creative_upload_id)
      .single();
    if (!upload) throw new Error("Upload not found");

    // Create generation record with 'generating' status
    const { data: gen, error: genErr } = await sb
      .from("creative_copy_generations")
      .insert({ creative_upload_id, client_id, status: "generating" })
      .select()
      .single();
    if (genErr) throw genErr;

    // Fetch client context in parallel
    const [clientRes, learningRes, uspsRes, rolesRes, locationsRes] = await Promise.all([
      sb.from("clients").select("*").eq("id", client_id).single(),
      sb.from("client_learning_profiles").select("*").eq("client_id", client_id).single(),
      sb.from("client_usps").select("usp_text").eq("client_id", client_id),
      sb.from("client_roles").select("role_title, care_domain, description").eq("client_id", client_id),
      sb.from("client_locations").select("name, city, region").eq("client_id", client_id),
    ]);

    const client = clientRes.data;
    const learning = learningRes.data;
    const usps = uspsRes.data?.map((u: any) => u.usp_text) || [];
    const roles = rolesRes.data || [];
    const locations = locationsRes.data || [];

    // Get a signed URL for the image so the AI can see it
    let imageUrl = "";
    const isImage = upload.file_type?.startsWith("image/");
    if (isImage) {
      const { data: signedData } = await sb.storage
        .from("creative-uploads")
        .createSignedUrl(upload.file_path, 600);
      imageUrl = signedData?.signedUrl || "";
    }

    // Build system prompt
    const systemPrompt = `Je bent een top-tier recruitment marketing copywriter bij Eva Zorg. Je schrijft high-performing Meta-advertentieteksten voor zorgprofessionals.

JE DOELGROEP:
Latente werkzoekenden in de zorg — mensen die NIET actief zoeken maar WEL openstaan voor iets beters. Ze scrollen door hun feed, zijn moe van hun huidige werkgever, missen waardering, of willen betere werktijden. Ze moeten gestopt worden in hun scroll en het gevoel krijgen: "hé, dit past bij mij."

DENKPROCES (doe dit ALTIJD intern voordat je schrijft):
1. Wat communiceert het creative visueel? Welke sfeer, welk gevoel?
2. Staat er tekst op het beeld? Zo ja: herhaal dit NIET letterlijk in de copy. Schrijf copy die het beeld AANVULT.
3. Wie is de meest waarschijnlijke doelgroep voor dit creative? Welke zorgprofessional?
4. Wat is de grootste frustratie of wens van deze doelgroep?
5. Wat maakt DEZE werkgever concreet aantrekkelijk voor die persoon?
6. Welke emotionele of praktische trigger is het sterkst?
7. Welke toon past het best: warm, direct, rustig, persoonlijk, urgent, teamgericht, inhoudelijk?
8. Helpen emoticons hier of niet?

CLIENTCONTEXT:
Naam: ${client?.name || "Onbekend"}
Zorgtype: ${client?.care_type || "Onbekend"}
Missie: ${client?.mission || "-"}
Visie: ${client?.vision || "-"}
Tone of voice: ${learning?.tone_of_voice || "Warm, professioneel, direct"}
Communicatierichtlijnen: ${learning?.communication_guidelines || "-"}
Employer branding: ${learning?.employer_branding || "-"}
Waarom hier werken: ${learning?.why_work_here || "-"}
USPs: ${usps.length ? usps.join(", ") : "-"}
Rollen: ${roles.length ? roles.map((r: any) => r.role_title).join(", ") : "-"}
Locaties: ${locations.length ? locations.map((l: any) => `${l.name} (${l.city || l.region || ""})`).join(", ") : "-"}
Woorden te gebruiken: ${learning?.words_to_use?.join(", ") || "-"}
Woorden te vermijden: ${learning?.words_to_avoid?.join(", ") || "-"}
Creatieve do's: ${learning?.creative_dos?.join(", ") || "-"}
Creatieve don'ts: ${learning?.creative_donts?.join(", ") || "-"}

COPYREGELS VOOR META ADS:
- De EERSTE ZIN moet de scroll stoppen. Geen saaie intro. Begin met een herkenbare emotie, een prikkelende vraag, of een concrete situatie.
- Schrijf KORTE ALINEA'S. Maximaal 2-3 zinnen per blok. Gebruik witruimte tussen gedachten.
- De copy moet scanbaar zijn op mobiel. Geen muren van tekst.
- Wees CONCREET. Geen "wij bieden een fijne werksfeer" maar specifiek wat dat betekent.
- Schrijf vanuit het perspectief en de beleving van de kandidaat, niet vanuit de organisatie.
- Maak het PERSOONLIJK en HERKENBAAR. De lezer moet denken: "dit gaat over mij."
- Eindig met een CTA die natuurlijk aanvoelt, niet pushy.
- Maximaal 125 woorden primary text.

EMOTICONS:
- Gebruik 0 tot maximaal 3 subtiele emoticons per primary text.
- Alleen als ze de leesbaarheid of warmte ECHT verbeteren.
- Nooit schreeuwerig, nooit kinderachtig. Denk: 🤝 💚 ✨ → niet: 🔥🔥🔥 🚀💪😍
- Bij twijfel: gebruik GEEN emoticons. Professioneel > leuk.
- Emoticons mogen NIET in headlines.

VARIATIE:
- Schrijf NIET elke keer dezelfde structuur. Wissel af op basis van het creative en de context.
- Soms is een vraag de beste opener. Soms een statement. Soms een herkenbare situatie.
- Soms werken korte bullets. Soms werkt een vloeiend verhaal beter.
- Kies wat het BESTE past bij dit specifieke creative en deze specifieke doelgroep.

VERBODEN:
- Geen generieke filler ("Ben jij een enthousiaste zorgprofessional die...")
- Geen letterlijke herhaling van beeldtekst
- Geen lange inleidende alinea's
- Geen opsommingen van 6+ bullets
- Geen overdreven commerciële taal
- Geen woorden uit de "woorden te vermijden" lijst
- Headline max 40 tekens
- Alt headline max 30 tekens`;

    const userContent: any[] = [];

    if (imageUrl && isImage) {
      userContent.push({
        type: "image_url",
        image_url: { url: imageUrl },
      });
    }

    userContent.push({
      type: "text",
      text: `Analyseer dit recruitment creative voor ${client?.name || "deze client"}.

Bestandsnaam: ${upload.file_name}

Analyseer eerst:
1. Welke functie/doelgroep spreekt dit creative aan?
2. Is de sfeer warm, urgent, praktisch, premium, of employer-brand gericht?
3. Staat er al tekst op het beeld? Zo ja, welke?
4. Is dit een campagne-creative of awareness-creative?

Genereer dan passende Meta ad copy.`,
    });

    // Call AI with tool calling for structured output
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
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_ad_copy",
              description: "Generate structured ad copy for a recruitment creative",
              parameters: {
                type: "object",
                properties: {
                  analysis_notes: {
                    type: "string",
                    description: "Korte analyse van het creative: doelgroep, sfeer, eventuele tekst op beeld",
                  },
                  primary_text: {
                    type: "string",
                    description: "De primary text / ad copy voor de Meta advertentie (max 125 woorden)",
                  },
                  headline: {
                    type: "string",
                    description: "De headline voor de advertentie (max 40 tekens)",
                  },
                  alt_headline: {
                    type: "string",
                    description: "Een alternatieve kortere headline (max 30 tekens)",
                  },
                  cta_suggestion: {
                    type: "string",
                    description: "Voorgestelde CTA richting, bijv 'Solliciteer direct', 'Bel voor een kennismaking'",
                  },
                },
                required: ["analysis_notes", "primary_text", "headline", "alt_headline", "cta_suggestion"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_ad_copy" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);

      await sb
        .from("creative_copy_generations")
        .update({ status: "error", analysis_notes: `AI error: ${aiResponse.status}` })
        .eq("id", gen.id);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit bereikt, probeer het later opnieuw." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Tegoed op, voeg credits toe." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      await sb.from("creative_copy_generations").update({ status: "error", analysis_notes: "No tool call in AI response" }).eq("id", gen.id);
      throw new Error("AI did not return structured output");
    }

    const result = JSON.parse(toolCall.function.arguments);

    // Update generation record
    const { error: updateErr } = await sb
      .from("creative_copy_generations")
      .update({
        primary_text: result.primary_text,
        headline: result.headline,
        alt_headline: result.alt_headline,
        cta_suggestion: result.cta_suggestion,
        analysis_notes: result.analysis_notes,
        status: "completed",
      })
      .eq("id", gen.id);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ generation_id: gen.id, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-creative error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
