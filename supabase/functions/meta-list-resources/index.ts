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

      // Try to get a Page Access Token. Two strategies:
      // 1) Direct: GET /{page_id}?fields=access_token  (works for User tokens that admin the page)
      // 2) Fallback: GET /me/accounts (works for System User tokens assigned to the page)
      let pageToken: string | null = null;
      let debugInfo = '';

      const directRes = await fetch(
        `${META_API}/${page_id}?fields=access_token,name&access_token=${token}`,
      );
      const directJson = await directRes.json();
      console.log('Page token direct lookup:', JSON.stringify(directJson));
      if (directJson.access_token) {
        pageToken = directJson.access_token;
      } else {
        debugInfo += `Direct lookup failed: ${directJson.error?.message || 'no access_token returned'}. `;

        // Fallback: list all pages the token can access
        const accountsRes = await fetch(
          `${META_API}/me/accounts?fields=id,name,access_token&limit=200&access_token=${token}`,
        );
        const accountsJson = await accountsRes.json();
        console.log('me/accounts lookup:', JSON.stringify({ error: accountsJson.error, count: accountsJson.data?.length }));
        if (accountsJson.error) {
          debugInfo += `me/accounts failed: ${accountsJson.error.message}. `;
        } else {
          const match = (accountsJson.data || []).find((p: any) => p.id === page_id);
          if (match?.access_token) {
            pageToken = match.access_token;
          } else {
            const availableIds = (accountsJson.data || []).map((p: any) => `${p.name} (${p.id})`).join(', ');
            debugInfo += `Page ${page_id} niet gevonden in toegankelijke pages. Beschikbaar: ${availableIds || '(geen)'}. `;
          }
        }
      }

      if (!pageToken) {
        throw new Error(
          `Kon geen Page Access Token ophalen voor page ${page_id}. ${debugInfo}` +
          `Controleer: (1) Page ID is correct, (2) je META_ACCESS_TOKEN heeft de scopes pages_show_list, pages_read_engagement, pages_manage_ads en leads_retrieval, ` +
          `(3) de System User of gebruiker is toegevoegd als admin/advertiser op deze Page in Meta Business Manager.`,
        );
      }

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
