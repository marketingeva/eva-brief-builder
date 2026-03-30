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
      // Fetch ad with nested creative fields via field expansion
      const adRes = await fetch(
        `${META_BASE}/${adDetailId}?fields=id,name,status,effective_status,creative{id,image_url,asset_feed_spec,object_story_spec{link_data{message,name,description,picture,image_hash,link,call_to_action},video_data{message,title,image_url,link_description,call_to_action},template_data{message,name,call_to_action}},effective_object_story_id},adcreatives{body,image_url,link_url,object_story_spec,asset_feed_spec}&access_token=${accessToken}`
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
      console.log("RAW META AD RESPONSE:", JSON.stringify({ creative: adData.creative, adcreatives: adData.adcreatives }, null, 2));
      const c = adData.creative ?? {};
      // Check both creative-level and adcreatives-level object_story_spec
      const ac0 = adData.adcreatives?.data?.[0] ?? {};
      const s = c.object_story_spec ?? ac0.object_story_spec ?? {};
      const l = s.link_data ?? {};
      const v = s.video_data ?? {};
      const t = s.template_data ?? {};
      const afs = c.asset_feed_spec ?? ac0.asset_feed_spec ?? {};

      // Pick the best image - skip tiny preview URLs (p64x64 etc.)
      const candidates = [
        c.image_url, l.picture, v.image_url,
        afs.images?.[0]?.url,
        ac0.image_url,
      ].filter(Boolean);
      const hiRes = candidates.find((u: string) => !/p\d+x\d+/.test(u));
      const imageUrl = hiRes ?? candidates[0] ?? null;

      // If image_url is still low-res and we have an image_hash, try resolving it
      let finalImageUrl = imageUrl;
      if (finalImageUrl && /p\d+x\d+/.test(finalImageUrl) && l.image_hash) {
        try {
          const hashRes = await fetch(
            `${META_BASE}/${actId}/adimages?hashes=["${l.image_hash}"]&fields=url_128,url&access_token=${accessToken}`
          );
          if (hashRes.ok) {
            const hashData = await hashRes.json();
            const imgEntry = hashData.data?.[0] || Object.values(hashData.images || {})[0];
            if (imgEntry?.url) finalImageUrl = imgEntry.url;
          } else {
            await hashRes.text();
          }
        } catch (e) {
          console.error("Error resolving image_hash:", e);
        }
      }

      const primaryText = l.message ?? v.message ?? t.message
        ?? afs.bodies?.[0]?.text ?? ac0.body ?? null;
      const headline = l.name ?? v.title ?? t.name
        ?? afs.titles?.[0]?.text ?? null;
      const description = l.description ?? v.link_description
        ?? afs.descriptions?.[0]?.text ?? null;
      const ctaType = l.call_to_action?.type ?? v.call_to_action?.type ?? t.call_to_action?.type
        ?? afs.call_to_action_types?.[0] ?? null;
      
      // Build link URL with fb.me filtering
      const rawLinkUrl = l.link ?? v.call_to_action?.value?.link ?? t.call_to_action?.value?.link
        ?? afs.link_urls?.[0]?.website_url ?? ac0.link_url ?? null;
      const linkUrl = rawLinkUrl && /^https?:\/\/(www\.)?fb\.me\/?$/i.test(rawLinkUrl) ? null : rawLinkUrl;

      // Lead form ID from CTA value
      let leadFormData = null;
      const formId = l.call_to_action?.value?.lead_gen_form_id
        ?? v.call_to_action?.value?.lead_gen_form_id
        ?? t.call_to_action?.value?.lead_gen_form_id
        ?? null;
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
          image_url: finalImageUrl,
          primary_text: primaryText,
          headline,
          description,
          cta_type: ctaType,
          link_url: linkUrl,
          creative_id: c.id || null,
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
