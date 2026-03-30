import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

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
    const campaignId = body.campaignId || null; // for drill-down
    const adsetId = body.adsetId || null; // for drill-down to ads

    const now = new Date();
    let since: string;
    const until = now.toISOString().split("T")[0];

    switch (dateRange) {
      case "today":
        since = until;
        break;
      case "last_30d":
        since = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
        break;
      case "last_7d":
      default:
        since = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
        break;
    }

    const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
    const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

    // If requesting ads under an adset
    if (adsetId) {
      const [adsRes, insightsRes] = await Promise.all([
        fetch(
          `${META_BASE}/${adsetId}/ads?fields=id,name,status,effective_status&limit=100&access_token=${accessToken}`
        ),
        fetch(
          `${META_BASE}/${adsetId}/insights?fields=ad_id,ad_name,spend,impressions,clicks,ctr,actions,cost_per_action_type&time_range=${timeRange}&level=ad&limit=100&access_token=${accessToken}`
        ),
      ]);

      const adsData = adsRes.ok ? await adsRes.json() : { data: [] };
      const insData = insightsRes.ok ? await insightsRes.json() : { data: [] };

      const insMap = new Map();
      for (const i of (insData.data || [])) {
        insMap.set(i.ad_id, i);
      }

      const ads = (adsData.data || [])
        .filter((a: any) => a.effective_status === "ACTIVE" || a.status === "ACTIVE")
        .map((a: any) => {
          const ins = insMap.get(a.id);
          const spend = ins ? parseFloat(ins.spend) : 0;
          const impressions = ins ? parseInt(ins.impressions) : 0;
          const clicks = ins ? parseInt(ins.clicks) : 0;
          const ctr = ins ? parseFloat(ins.ctr) : 0;
          const leadAction = ins?.actions?.find((x: any) => x.action_type === "lead" || x.action_type === "onsite_conversion.lead_grouped");
          const leads = leadAction ? parseInt(leadAction.value) : 0;
          const cplAction = ins?.cost_per_action_type?.find((x: any) => x.action_type === "lead" || x.action_type === "onsite_conversion.lead_grouped");
          const cpl = cplAction ? parseFloat(cplAction.value) : leads > 0 ? spend / leads : 0;

          return { id: a.id, name: a.name, status: a.effective_status || a.status, spend, impressions, clicks, ctr, leads, cpl };
        });

      return new Response(JSON.stringify({ type: "ads", data: ads, date_range: { since, until }, fetched_at: new Date().toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If requesting adsets under a campaign
    if (campaignId) {
      const [adsetsRes, insightsRes] = await Promise.all([
        fetch(
          `${META_BASE}/${campaignId}/adsets?fields=id,name,status,effective_status,daily_budget,lifetime_budget&limit=100&access_token=${accessToken}`
        ),
        fetch(
          `${META_BASE}/${campaignId}/insights?fields=adset_id,adset_name,spend,impressions,clicks,ctr,actions,cost_per_action_type&time_range=${timeRange}&level=adset&limit=100&access_token=${accessToken}`
        ),
      ]);

      const adsetsData = adsetsRes.ok ? await adsetsRes.json() : { data: [] };
      const insData = insightsRes.ok ? await insightsRes.json() : { data: [] };

      const insMap = new Map();
      for (const i of (insData.data || [])) {
        insMap.set(i.adset_id, i);
      }

      const adsets = (adsetsData.data || [])
        .filter((a: any) => a.effective_status === "ACTIVE" || a.status === "ACTIVE")
        .map((a: any) => {
          const ins = insMap.get(a.id);
          const spend = ins ? parseFloat(ins.spend) : 0;
          const impressions = ins ? parseInt(ins.impressions) : 0;
          const clicks = ins ? parseInt(ins.clicks) : 0;
          const ctr = ins ? parseFloat(ins.ctr) : 0;
          const leadAction = ins?.actions?.find((x: any) => x.action_type === "lead" || x.action_type === "onsite_conversion.lead_grouped");
          const leads = leadAction ? parseInt(leadAction.value) : 0;
          const cplAction = ins?.cost_per_action_type?.find((x: any) => x.action_type === "lead" || x.action_type === "onsite_conversion.lead_grouped");
          const cpl = cplAction ? parseFloat(cplAction.value) : leads > 0 ? spend / leads : 0;

          return {
            id: a.id, name: a.name, status: a.effective_status || a.status,
            daily_budget: a.daily_budget ? parseFloat(a.daily_budget) / 100 : null,
            spend, impressions, clicks, ctr, leads, cpl,
          };
        });

      return new Response(JSON.stringify({ type: "adsets", data: adsets, date_range: { since, until }, fetched_at: new Date().toISOString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: fetch campaigns
    const [campaignsRes, insightsRes] = await Promise.all([
      fetch(
        `${META_BASE}/${actId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE"]}]&limit=100&access_token=${accessToken}`
      ),
      fetch(
        `${META_BASE}/${actId}/insights?fields=campaign_id,campaign_name,spend,impressions,clicks,ctr,reach,actions,cost_per_action_type&time_range=${timeRange}&level=campaign&filtering=[{"field":"campaign.effective_status","operator":"IN","value":["ACTIVE"]}]&limit=100&access_token=${accessToken}`
      ),
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

    const campaigns = campaignsData.data || [];
    const insights = insightsData.data || [];

    const insightsMap = new Map();
    for (const ins of insights) {
      insightsMap.set(ins.campaign_id, ins);
    }

    const mergedCampaigns = campaigns.map((c: any) => {
      const ins = insightsMap.get(c.id);
      const spend = ins ? parseFloat(ins.spend) : 0;
      const impressions = ins ? parseInt(ins.impressions) : 0;
      const clicks = ins ? parseInt(ins.clicks) : 0;
      const reach = ins ? parseInt(ins.reach) : 0;
      const ctr = ins ? parseFloat(ins.ctr) : 0;

      const leadAction = ins?.actions?.find((a: any) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped");
      const leads = leadAction ? parseInt(leadAction.value) : 0;
      const cplAction = ins?.cost_per_action_type?.find((a: any) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped");
      const cpl = cplAction ? parseFloat(cplAction.value) : leads > 0 ? spend / leads : 0;

      return {
        id: c.id, name: c.name, status: c.status, objective: c.objective,
        daily_budget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
        lifetime_budget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
        spend, impressions, clicks, reach, ctr, leads, cpl,
      };
    });

    const totalSpend = mergedCampaigns.reduce((s: number, c: any) => s + c.spend, 0);
    const totalLeads = mergedCampaigns.reduce((s: number, c: any) => s + c.leads, 0);

    const result = {
      type: "campaigns",
      summary: {
        active_campaigns: mergedCampaigns.length,
        total_spend: totalSpend,
        total_leads: totalLeads,
        avg_cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      },
      campaigns: mergedCampaigns,
      date_range: { since, until },
      fetched_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(result), {
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
