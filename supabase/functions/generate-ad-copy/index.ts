// Generate ad copy variations (primary text, headlines, descriptions) via Lovable AI.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY missing');

    const { client_name, role, context, count = 3 } = await req.json();

    const prompt = `Genereer ${count} korte advertentievariaties in het Nederlands voor recruitment.
Klant: ${client_name || 'onbekend'}
Functie/context: ${role || context || 'algemeen'}

Geef terug als JSON met deze structuur:
{
  "primary_texts": ["...", "..."],
  "headlines": ["...", "..."],
  "descriptions": ["...", "..."]
}

Regels:
- Primary text: max 125 karakters, wervend, gericht op zorgmedewerkers
- Headline: max 40 karakters
- Description: max 30 karakters
- Geen emoji's overdrijven, geen overdreven uitroeptekens`;

    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      throw new Error(`AI gateway: ${r.status} ${t}`);
    }
    const j = await r.json();
    const content = j.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('generate-ad-copy', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
