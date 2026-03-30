import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

interface MetaInsight {
  campaign_id: string;
  campaign_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  reach: string;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
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

    // Map date range to Meta API time_range
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

    // Fetch campaigns and insights in parallel
    const [campaignsRes, insightsRes] = await Promise.all([
      fetch(
        `${META_BASE}/${actId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget&limit=50&access_token=${accessToken}`
      ),
      fetch(
        `${META_BASE}/${actId}/insights?fields=campaign_id,campaign_name,spend,impressions,clicks,ctr,reach,actions,cost_per_action_type&time_range={"since":"${since}","until":"${until}"}&level=campaign&limit=50&access_token=${accessToken}`
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

    const campaigns: MetaCampaign[] = campaignsData.data || [];
    const insights: MetaInsight[] = insightsData.data || [];

    // Build insights lookup by campaign_id
    const insightsMap = new Map<string, MetaInsight>();
    for (const ins of insights) {
      insightsMap.set(ins.campaign_id, ins);
    }

    // Merge campaigns with insights
    const mergedCampaigns = campaigns.map((c) => {
      const ins = insightsMap.get(c.id);
      const spend = ins ? parseFloat(ins.spend) : 0;
      const impressions = ins ? parseInt(ins.impressions) : 0;
      const clicks = ins ? parseInt(ins.clicks) : 0;
      const reach = ins ? parseInt(ins.reach) : 0;
      const ctr = ins ? parseFloat(ins.ctr) : 0;

      // Extract leads from actions
      const leadAction = ins?.actions?.find(
        (a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
      );
      const leads = leadAction ? parseInt(leadAction.value) : 0;

      // Extract CPL
      const cplAction = ins?.cost_per_action_type?.find(
        (a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped"
      );
      const cpl = cplAction ? parseFloat(cplAction.value) : leads > 0 ? spend / leads : 0;

      return {
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        daily_budget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
        lifetime_budget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
        spend,
        impressions,
        clicks,
        reach,
        ctr,
        leads,
        cpl,
      };
    });

    // Calculate summary
    const activeCampaigns = mergedCampaigns.filter((c) => c.status === "ACTIVE");
    const totalSpend = mergedCampaigns.reduce((sum, c) => sum + c.spend, 0);
    const totalLeads = mergedCampaigns.reduce((sum, c) => sum + c.leads, 0);
    const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;

    const result = {
      summary: {
        active_campaigns: activeCampaigns.length,
        total_campaigns: mergedCampaigns.length,
        total_spend: totalSpend,
        total_leads: totalLeads,
        avg_cpl: avgCpl,
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
