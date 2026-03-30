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
    const adDetailId = body.adDetailId || null;

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

    // ── Ad detail: fetch creative info (image, text, CTA, lead form) ──
    if (adDetailId) {
      // Fetch ad with creative details
      const adRes = await fetch(
        `${META_BASE}/${adDetailId}?fields=id,name,status,effective_status,creative{id,name,title,body,image_url,thumbnail_url,object_story_spec,call_to_action_type,link_url}&access_token=${accessToken}`
      );

      if (!adRes.ok) {
        const err = await adRes.text();
        console.error("Meta ad detail error:", err);
        return new Response(
          JSON.stringify({ error: "Failed to fetch ad detail", detail: err }),
          { status: adRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const adData = await adRes.json();
      const creative = adData.creative || {};
      const objectStorySpec = creative.object_story_spec || {};
      const linkData = objectStorySpec.link_data || {};
      const videoData = objectStorySpec.video_data || {};

      // Try to get full-resolution image from the creative endpoint
      let fullImageUrl: string | null = null;
      if (creative.id) {
        try {
          const creativeRes = await fetch(
            `${META_BASE}/${creative.id}?fields=image_url,thumbnail_url,object_story_spec&access_token=${accessToken}`
          );
          if (creativeRes.ok) {
            const creativeData = await creativeRes.json();
            fullImageUrl = creativeData.image_url || null;
            // Also try full_picture from link_data
            const cLinkData = creativeData.object_story_spec?.link_data || {};
            if (!fullImageUrl && cLinkData.image_hash) {
              // image_hash can't be used directly, but picture should be available
              fullImageUrl = cLinkData.picture || null;
            }
          } else {
            await creativeRes.text(); // consume body
          }
        } catch (e) {
          console.error("Error fetching creative image:", e);
        }
      }

      // Extract the image - prefer full-resolution, then try multiple sources
      const imageUrl = fullImageUrl
        || linkData.picture
        || creative.image_url
        || videoData.image_url
        || creative.thumbnail_url
        || null;

      // Extract text from object_story_spec (most reliable source)
      const primaryText = linkData.message
        || videoData.message
        || creative.body
        || null;

      // Extract headline
      const headline = linkData.name
        || videoData.title
        || creative.title
        || null;

      // Extract description
      const description = linkData.description || videoData.link_description || null;

      // Extract CTA
      const ctaType = linkData.call_to_action?.type
        || videoData.call_to_action?.type
        || creative.call_to_action_type
        || null;

      // Extract link URL
      const linkUrl = linkData.link
        || videoData.call_to_action?.value?.link
        || creative.link_url
        || null;

      // Fetch lead gen form details if available
      let leadFormData = null;
      const formId = linkData.call_to_action?.value?.lead_gen_form_id
        || videoData.call_to_action?.value?.lead_gen_form_id
        || objectStorySpec.template_data?.call_to_action?.value?.lead_gen_form_id
        || null;
      if (formId) {
        try {
          const formRes = await fetch(
            `${META_BASE}/${formId}?fields=id,name,status,questions,privacy_policy_url,thank_you_page&access_token=${accessToken}`
          );
          if (formRes.ok) {
            leadFormData = await formRes.json();
          } else {
            await formRes.text(); // consume body
          }
        } catch (e) {
          console.error("Error fetching lead form:", e);
        }
      }

      return new Response(JSON.stringify({
        type: "ad_detail",
        data: {
          id: adData.id,
          name: adData.name,
          status: adData.effective_status || adData.status,
          image_url: imageUrl,
          primary_text: primaryText,
          headline,
          description,
          cta_type: ctaType,
          link_url: linkUrl,
          creative_id: creative.id || null,
          lead_form: leadFormData ? {
            id: leadFormData.id,
            name: leadFormData.name,
            status: leadFormData.status,
            questions: leadFormData.questions || [],
          } : null,
        },
        fetched_at: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Drill-down: ads under an adset ──
    if (adsetId) {
      const [adsRes, insightsRes] = await Promise.all([
        fetch(`${META_BASE}/${adsetId}/ads?fields=id,name,status,effective_status,configured_status&limit=100&access_token=${accessToken}`),
        fetch(`${META_BASE}/${adsetId}/insights?fields=ad_id,ad_name,spend,impressions,clicks,ctr,actions,cost_per_action_type&time_range=${timeRange}&level=ad&limit=100&access_token=${accessToken}`),
      ]);

      const adsData = adsRes.ok ? await adsRes.json() : { data: [] };
      const insData = insightsRes.ok ? await insightsRes.json() : { data: [] };
      const insMap = new Map();
      for (const i of (insData.data || [])) insMap.set(i.ad_id, i);

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

    // ── Drill-down: adsets under a campaign ──
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

    // ── Default: campaigns ──
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
