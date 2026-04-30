const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API = 'https://graph.facebook.com/v21.0';

interface GeoLocationItem {
  key: string;
  type: string; // 'city' | 'subcity' | 'region' | 'neighborhood' | 'country'
  radius?: number;
  distance_unit?: 'kilometer' | 'mile';
}

interface RequestBody {
  campaign_id: string;
  name: string;
  page_id: string;
  lead_form_id: string;
  daily_budget_eur: number; // euros, e.g. 20
  start_time?: string | null; // ISO
  end_time?: string | null;   // ISO
  age_min?: number;
  age_max?: number;
  genders?: number[]; // [] = all, [1]=male, [2]=female
  countries?: string[]; // ['NL']
  cities?: GeoLocationItem[];
  regions?: GeoLocationItem[];
  optimization_goal?: string; // default LEAD_GENERATION
  billing_event?: string; // default IMPRESSIONS
  performance_goal?: string; // 'maximize_leads' | 'maximize_conversion_leads'
  status?: 'PAUSED' | 'ACTIVE';
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get('META_ACCESS_TOKEN');
    const adAccount = Deno.env.get('AD_ACCOUNT_ID');
    if (!token || !adAccount) throw new Error('META_ACCESS_TOKEN of AD_ACCOUNT_ID ontbreekt.');

    const body = await req.json() as RequestBody;

    if (!body.campaign_id) throw new Error('campaign_id is verplicht.');
    if (!body.name?.trim()) throw new Error('Naam is verplicht.');
    if (!body.page_id) throw new Error('Facebook Page ID is verplicht.');
    if (!body.lead_form_id) throw new Error('Lead formulier is verplicht.');
    if (!body.daily_budget_eur || body.daily_budget_eur < 1) throw new Error('Dagbudget moet minimaal €1 zijn.');

    const account = adAccount.startsWith('act_') ? adAccount : `act_${adAccount}`;

    // Build geo_locations
    const geo: any = {};
    if (body.countries && body.countries.length) geo.countries = body.countries;

    const cityItems = (body.cities || []).map((c) => ({
      key: c.key,
      radius: c.radius ?? 17,
      distance_unit: c.distance_unit ?? 'kilometer',
    }));
    if (cityItems.length) geo.cities = cityItems;

    const regionItems = (body.regions || []).map((r) => ({ key: r.key }));
    if (regionItems.length) geo.regions = regionItems;

    if (!geo.countries && !geo.cities && !geo.regions) {
      geo.countries = ['NL'];
    }

    const targeting: any = {
      geo_locations: geo,
      age_min: body.age_min ?? 18,
      age_max: body.age_max ?? 65,
      targeting_automation: { advantage_audience: 1 },
    };
    if (body.genders && body.genders.length > 0) {
      targeting.genders = body.genders;
    }

    // Promoted object for lead-gen ad sets
    const promotedObject = {
      page_id: body.page_id,
    };

    const optimizationGoal = body.optimization_goal || 'LEAD_GENERATION';
    const billingEvent = body.billing_event || 'IMPRESSIONS';

    // Daily budget in cents
    const dailyBudget = Math.round(body.daily_budget_eur * 100);

    const params: Record<string, string> = {
      name: body.name.trim(),
      campaign_id: body.campaign_id,
      status: body.status || 'PAUSED',
      daily_budget: String(dailyBudget),
      billing_event: billingEvent,
      optimization_goal: optimizationGoal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      destination_type: 'ON_AD',
      targeting: JSON.stringify(targeting),
      promoted_object: JSON.stringify(promotedObject),
      access_token: token,
    };

    if (body.start_time) params.start_time = body.start_time;
    if (body.end_time) params.end_time = body.end_time;

    const res = await fetch(`${META_API}/${account}/adsets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const json = await res.json();
    if (json.error) {
      console.error('Meta adset create error', json.error);
      throw new Error(json.error.error_user_msg || json.error.message || 'Meta API fout');
    }

    return jsonResponse({ id: json.id, name: body.name.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('meta-create-adset error', message);
    return jsonResponse({ error: message }, 400);
  }
});
