import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

function extractMetrics(ins: any) {
  const spend = ins ? parseFloat(ins.spend || "0") : 0;
  const impressions = ins ? parseInt(ins.impressions || "0") : 0;
  const clicks = ins ? parseInt(ins.clicks || "0") : 0;
  const ctr = ins ? parseFloat(ins.ctr || "0") : 0;
  const reach = ins ? parseInt(ins.reach || "0") : 0;
  const leadAction = ins?.actions?.find((x: any) => x.action_type === "lead" || x.action_type === "onsite_conversion.lead_grouped");
  const leads = leadAction ? parseInt(leadAction.value) : 0;
  const cplAction = ins?.cost_per_action_type?.find((x: any) => x.action_type === "lead" || x.action_type === "onsite_conversion.lead_grouped");
  const cpl = cplAction ? parseFloat(cplAction.value) : leads > 0 ? spend / leads : 0;
  return { spend, impressions, clicks, ctr, reach, leads, cpl };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    const adAccountId = Deno.env.get("AD_ACCOUNT_ID");

    if (!accessToken || !adAccountId) {
      return new Response(
        JSON.stringify({ error: "Meta API credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const dateRange = body.dateRange || "last_7d";
    const customSince = body.since || null;
    const customUntil = body.until || null;
    const campaignId = body.campaignId || null;
    const adsetId = body.adsetId || null;

    let since: string;
    let until: string;
    const now = new Date();

    if (customSince && customUntil) {
      since = customSince;
      until = customUntil;
    } else {
      until = now.toISOString().split("T")[0];
      switch (dateRange) {
        case "today": since = until; break;
        case "last_30d": since = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0]; break;
        default: since = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0]; break;
      }
    }

    const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

    // Drill-down: ads under an adset
    if (adsetId) {
      const [adsRes, insightsRes] = await Promise.all([
        fetch(`${META_BASE}/${adsetId}/ads?fields=id,name,status,effective_status,configured_status&limit=100&access_token=${accessToken}`),
        fetch(`${META_BASE}/${adsetId}/insights?fields=ad_id,ad_name,spend,impressions,clicks,ctr,actions,cost_per_action_type&time_range=${timeRange}&level=ad&limit=100&access_token=${accessToken}`),
      ]);

      const adsData = adsRes.ok ? await adsRes.json() : { data: [] };
      const insData = insightsRes.ok ? await insightsRes.json() : { data: [] };
      const insMap = new Map();
      for (const i of (insData.data || [])) insMap.set(i.ad_id, i);

      // Only include ads where configured_status or effective_status is ACTIVE (on/off toggle = on)
      const ads = (adsData.data || [])
        .filter((a: any) => a.configured_status === "ACTIVE" || a.effective_status === "ACTIVE")
        .map((a: any) => {
          const m = extractMetrics(insMap.get(a.id));
          return { id: a.id, name: a.name, status: a.effective_status || a.status, ...m };
        });

      return new Response(JSON.stringify({ type: "ads", data: ads, date_range: { since, until }, fetched_at: new Date().toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Drill-down: adsets under a campaign
    if (campaignId) {
      const [adsetsRes, insightsRes] = await Promise.all([
        fetch(`${META_BASE}/${campaignId}/adsets?fields=id,name,status,effective_status,configured_status,daily_budget,lifetime_budget&limit=100&access_token=${accessToken}`),
        fetch(`${META_BASE}/${campaignId}/insights?fields=adset_id,adset_name,spend,impressions,clicks,ctr,actions,cost_per_action_type&time_range=${timeRange}&level=adset&limit=100&access_token=${accessToken}`),
      ]);

      const adsetsData = adsetsRes.ok ? await adsetsRes.json() : { data: [] };
      const insData = insightsRes.ok ? await insightsRes.json() : { data: [] };
      const insMap = new Map();
      for (const i of (insData.data || [])) insMap.set(i.adset_id, i);

      const adsets = (adsetsData.data || [])
        .filter((a: any) => a.configured_status === "ACTIVE" || a.effective_status === "ACTIVE")
        .map((a: any) => {
          const m = extractMetrics(insMap.get(a.id));
          return {
            id: a.id, name: a.name, status: a.effective_status || a.status,
            daily_budget: a.daily_budget ? parseFloat(a.daily_budget) / 100 : null,
            ...m,
          };
        });

      return new Response(JSON.stringify({ type: "adsets", data: adsets, date_range: { since, until }, fetched_at: new Date().toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: campaigns - only where configured_status (on/off toggle) is ACTIVE
    const [campaignsRes, insightsRes] = await Promise.all([
      fetch(`${META_BASE}/${actId}/campaigns?fields=id,name,status,effective_status,configured_status,objective,daily_budget,lifetime_budget&limit=100&access_token=${accessToken}`),
      fetch(`${META_BASE}/${actId}/insights?fields=campaign_id,campaign_name,spend,impressions,clicks,ctr,reach,actions,cost_per_action_type&time_range=${timeRange}&level=campaign&limit=100&access_token=${accessToken}`),
    ]);

    if (!campaignsRes.ok) {
      const err = await campaignsRes.text();
      console.error("Meta campaigns error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to fetch campaigns from Meta", detail: err }),
        { status: campaignsRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const campaignsData = await campaignsRes.json();
    const insightsData = insightsRes.ok ? await insightsRes.json() : { data: [] };

    const insightsMap = new Map();
    for (const ins of (insightsData.data || [])) insightsMap.set(ins.campaign_id, ins);

    // Filter: only campaigns where the on/off toggle is ON (configured_status === ACTIVE)
    const campaigns = (campaignsData.data || [])
      .filter((c: any) => c.configured_status === "ACTIVE")
      .map((c: any) => {
        const m = extractMetrics(insightsMap.get(c.id));
        return {
          id: c.id, name: c.name, status: c.effective_status || c.status, objective: c.objective,
          daily_budget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
          lifetime_budget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
          ...m,
        };
      });

    const totalSpend = campaigns.reduce((s: number, c: any) => s + c.spend, 0);
    const totalLeads = campaigns.reduce((s: number, c: any) => s + c.leads, 0);

    return new Response(JSON.stringify({
      type: "campaigns",
      summary: {
        active_campaigns: campaigns.length,
        total_spend: totalSpend,
        total_leads: totalLeads,
        avg_cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      },
      campaigns,
      date_range: { since, until },
      fetched_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-meta-ads error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
