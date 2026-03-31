import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { client_id } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    const adAccountId = Deno.env.get("AD_ACCOUNT_ID");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!accessToken || !adAccountId) {
      return new Response(JSON.stringify({ error: "Meta API credentials not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch client info + learning context
    const [clientRes, learningRes, learningsRes] = await Promise.all([
      sb.from("clients").select("name, care_type, description").eq("id", client_id).single(),
      sb.from("client_learning_profiles").select("*").eq("client_id", client_id).single(),
      sb.from("client_learnings").select("*").eq("client_id", client_id).order("created_at", { ascending: false }).limit(20),
    ]);

    const clientName = clientRes.data?.name || "Onbekend";

    // Fetch last 30 days of ad data from Meta
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const until = now.toISOString().split("T")[0];

    const campaignsUrl = `${META_BASE}/act_${adAccountId}/campaigns?fields=id,name,status,objective&filtering=[{"field":"campaign.name","operator":"CONTAIN","value":"${encodeURIComponent(clientName)}"}]&limit=50&access_token=${accessToken}`;
    const campaignsResp = await fetch(campaignsUrl);
    const campaignsData = await campaignsResp.json();
    const campaigns = campaignsData.data || [];

    if (campaigns.length === 0) {
      // Save empty report
      await sb.from("agent_reports").insert({
        client_id,
        agent_type: "analyst",
        report_type: "performance_summary",
        content: { summary: "Geen actieve campagnes gevonden voor deze klant in de afgelopen 30 dagen.", campaigns: [] },
      });
      return new Response(JSON.stringify({ success: true, message: "No campaigns found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch insights per campaign
    const campaignInsights = [];
    for (const camp of campaigns.slice(0, 10)) {
      const insUrl = `${META_BASE}/${camp.id}/insights?fields=spend,impressions,clicks,ctr,reach,actions,cost_per_action_type&time_range={"since":"${since}","until":"${until}"}&access_token=${accessToken}`;
      const insResp = await fetch(insUrl);
      const insData = await insResp.json();
      const ins = insData.data?.[0];

      const spend = ins ? parseFloat(ins.spend || "0") : 0;
      const impressions = ins ? parseInt(ins.impressions || "0") : 0;
      const clicks = ins ? parseInt(ins.clicks || "0") : 0;
      const ctr = ins ? parseFloat(ins.ctr || "0") : 0;
      const leadAction = ins?.actions?.find((x: any) => x.action_type === "lead" || x.action_type === "onsite_conversion.lead_grouped");
      const leads = leadAction ? parseInt(leadAction.value) : 0;
      const cplAction = ins?.cost_per_action_type?.find((x: any) => x.action_type === "lead" || x.action_type === "onsite_conversion.lead_grouped");
      const cpl = cplAction ? parseFloat(cplAction.value) : leads > 0 ? spend / leads : 0;

      campaignInsights.push({
        campaign_id: camp.id,
        campaign_name: camp.name,
        status: camp.status,
        objective: camp.objective,
        spend, impressions, clicks, ctr, leads, cpl,
      });
    }

    // Build AI prompt
    const learningContext = learningRes.data ? `
Tone of voice: ${learningRes.data.tone_of_voice || "n/a"}
Employer branding: ${learningRes.data.employer_branding || "n/a"}
Why work here: ${learningRes.data.why_work_here || "n/a"}
` : "";

    const pastLearnings = (learningsRes.data || []).slice(0, 5).map((l: any) =>
      `- ${l.concept || "Geen concept"}: ${l.what_worked || ""} | ${l.what_failed || ""}`
    ).join("\n");

    const dataBlock = campaignInsights.map(c =>
      `Campagne: ${c.campaign_name} | Status: ${c.status} | Spend: €${c.spend.toFixed(2)} | Impressions: ${c.impressions} | Clicks: ${c.clicks} | CTR: ${c.ctr.toFixed(2)}% | Leads: ${c.leads} | CPL: €${c.cpl.toFixed(2)}`
    ).join("\n");

    const prompt = `Je bent een senior performance marketeer gespecialiseerd in recruitment advertising voor de zorgsector.

Analyseer de volgende campagnedata voor klant "${clientName}" (periode: afgelopen 30 dagen).

## Campagnedata
${dataBlock}

## Client context
${learningContext}

## Eerdere learnings
${pastLearnings || "Geen eerdere learnings beschikbaar."}

Geef een analyse in het Nederlands met:
1. **Samenvatting**: Korte overview van de totale performance
2. **Top performers**: Welke campagnes presteren het best en waarom?
3. **Underperformers**: Welke campagnes hebben aandacht nodig?
4. **Aanbevelingen**: Concrete actiepunten voor optimalisatie (budget shifts, creatieve updates, targeting aanpassingen)
5. **Trends**: Opvallende patronen in de data

Houd het praktisch en actionable.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Je bent een AI ads performance analyst voor recruitment marketing bureaus in de zorgsector. Je analyseert Meta Ads data en geeft strategische aanbevelingen." },
          { role: "user", content: prompt },
        ],
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
        return new Response(JSON.stringify({ error: "AI credits op. Voeg credits toe via Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const analysis = aiData.choices?.[0]?.message?.content || "Geen analyse beschikbaar.";

    // Store report
    const { data: report, error: reportErr } = await sb.from("agent_reports").insert({
      client_id,
      agent_type: "analyst",
      report_type: "performance_summary",
      report_source: "manual",
      title: `Performance Analyse — ${clientName} (${since} t/m ${until})`,
      content: {
        analysis,
        campaigns: campaignInsights,
        period: { since, until },
        generated_at: new Date().toISOString(),
      },
    }).select().single();

    if (reportErr) console.error("Report save error:", reportErr);

    return new Response(JSON.stringify({ success: true, report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("agent-analyst error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
