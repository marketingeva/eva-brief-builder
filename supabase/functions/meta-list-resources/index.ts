// Lists Meta campaigns / ad sets / lead forms, filtered by client name filter.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API = 'https://graph.facebook.com/v21.0';

async function fetchAll(url: string, token: string) {
  const out: any[] = [];
  let next: string | null = `${url}${url.includes('?') ? '&' : '?'}access_token=${token}&limit=100`;
  let safety = 0;
  while (next && safety < 20) {
    const r = await fetch(next);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || 'Meta error');
    if (Array.isArray(j.data)) out.push(...j.data);
    next = j.paging?.next || null;
    safety++;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get('META_ACCESS_TOKEN');
    const adAccount = Deno.env.get('AD_ACCOUNT_ID');
    if (!token || !adAccount) throw new Error('META_ACCESS_TOKEN or AD_ACCOUNT_ID not configured');

    const body = await req.json().catch(() => ({}));
    const { resource, campaign_id, name_filter, page_id } = body as {
      resource: 'campaigns' | 'adsets' | 'leadforms';
      campaign_id?: string;
      name_filter?: string;
      page_id?: string;
    };

    const filter = (name_filter || '').trim().toLowerCase();
    const matches = (n: string) => !filter || (n || '').toLowerCase().includes(filter);

    let data: any[] = [];

    if (resource === 'campaigns') {
      const account = adAccount.startsWith('act_') ? adAccount : `act_${adAccount}`;
      const items = await fetchAll(
        `${META_API}/${account}/campaigns?fields=id,name,status,effective_status,objective`,
        token,
      );
      data = items
        .filter((c) => matches(c.name))
        .filter((c) => c.effective_status !== 'DELETED' && c.effective_status !== 'ARCHIVED');
    } else if (resource === 'adsets') {
      if (!campaign_id) throw new Error('campaign_id required');
      const items = await fetchAll(
        `${META_API}/${campaign_id}/adsets?fields=id,name,status,effective_status,optimization_goal,billing_event`,
        token,
      );
      data = items.filter((a) => a.effective_status !== 'DELETED' && a.effective_status !== 'ARCHIVED');
    } else if (resource === 'leadforms') {
      if (!page_id) throw new Error('page_id required for leadforms');
      // Lead forms require a Page Access Token. Exchange the user/system token for one.
      const pageTokenRes = await fetch(
        `${META_API}/${page_id}?fields=access_token&access_token=${token}`,
      );
      const pageTokenJson = await pageTokenRes.json();
      if (pageTokenJson.error || !pageTokenJson.access_token) {
        throw new Error(
          `Kon geen Page Access Token ophalen voor page ${page_id}: ${pageTokenJson.error?.message || 'geen access_token in response. Controleer of de token rechten heeft op deze Page (pages_show_list, pages_manage_ads, leads_retrieval, pages_read_engagement).'}`,
        );
      }
      const pageToken = pageTokenJson.access_token as string;
      const items = await fetchAll(
        `${META_API}/${page_id}/leadgen_forms?fields=id,name,status`,
        pageToken,
      );
      data = items.filter((f) => matches(f.name)).filter((f) => f.status !== 'ARCHIVED');
    } else {
      throw new Error('Unknown resource');
    }

    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('meta-list-resources error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
