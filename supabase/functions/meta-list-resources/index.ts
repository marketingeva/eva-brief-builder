const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API = 'https://graph.facebook.com/v21.0';
const VALID_RESOURCES = new Set(['campaigns', 'adsets', 'leadforms', 'location_search', 'instagram_accounts']);

type MetaResource = 'campaigns' | 'adsets' | 'leadforms' | 'location_search' | 'instagram_accounts';

type RequestBody = {
  resource?: unknown;
  campaign_id?: unknown;
  adset_id?: unknown;
  ad_id?: unknown;
  name_filter?: unknown;
  page_id?: unknown;
  query?: unknown;
  country_code?: unknown;
};

async function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchAll(url: string, token: string) {
  const out: any[] = [];
  let next: string | null = `${url}${url.includes('?') ? '&' : '?'}access_token=${token}&limit=200`;
  let safety = 0;

  while (next && safety < 100) {
    let attempt = 0;
    let json: any = null;

    while (attempt < 4) {
      const response = await fetch(next);
      json = await response.json();

      const err = json?.error;
      const isRateLimit = err && (err.code === 17 || err.code === 4 || err.code === 32 || err.code === 613 ||
        /request limit|rate limit|user request limit/i.test(err.message || ''));

      if (isRateLimit && attempt < 3) {
        await sleep(1500 * (attempt + 1));
        attempt += 1;
        continue;
      }

      if (err) {
        throw new Error(err.message || 'Meta error');
      }

      break;
    }

    if (Array.isArray(json.data)) {
      out.push(...json.data);
    }

    next = json.paging?.next || null;
    safety += 1;
  }

  return out;
}

function asTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMetaName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[|/\\()[\]{}.,:;'"`´’‘“”+*&^%$#@!?=<>~_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesName(name: string, rawFilter: string) {
  const normalizedFilter = normalizeMetaName(rawFilter);
  if (!normalizedFilter) return true;

  const normalizedName = normalizeMetaName(name || '');
  if (!normalizedName) return false;

  if (normalizedName.includes(normalizedFilter)) return true;

  const filterTokens = normalizedFilter.split(' ').filter(Boolean);
  return filterTokens.every((token) => normalizedName.includes(token));
}

function isVisibleStatus(status?: string | null) {
  return status !== 'DELETED' && status !== 'ARCHIVED';
}

function statusRank(item: { effective_status?: string | null; status?: string | null }) {
  const s = item.effective_status || item.status || '';
  if (s === 'ACTIVE') return 0;
  if (s === 'PAUSED') return 1;
  return 2;
}

function sortActiveFirst<T extends { name?: string | null; effective_status?: string | null; status?: string | null }>(items: T[]) {
  return [...items].sort((a, b) => {
    const r = statusRank(a) - statusRank(b);
    if (r !== 0) return r;
    return (a.name || '').localeCompare(b.name || '', 'nl', { sensitivity: 'base' });
  });
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get('META_ACCESS_TOKEN');
    const adAccount = Deno.env.get('AD_ACCOUNT_ID');

    if (!token || !adAccount) {
      throw new Error('META_ACCESS_TOKEN of AD_ACCOUNT_ID ontbreekt.');
    }

    const body = await req.json().catch(() => ({})) as RequestBody;
    const resource = asTrimmedString(body.resource) as MetaResource;
    const nameFilter = asTrimmedString(body.name_filter);
    const campaignId = asTrimmedString(body.campaign_id);
    const adsetId = asTrimmedString(body.adset_id);
    const adId = asTrimmedString(body.ad_id);
    const pageId = asTrimmedString(body.page_id);
    const searchQuery = asTrimmedString(body.query);
    const countryCode = asTrimmedString(body.country_code) || 'NL';

    if (!VALID_RESOURCES.has(resource)) {
      return jsonResponse({ data: [], error: 'Ongeldige resource opgevraagd.', fallback: true }, 400);
    }

    let data: any[] = [];

    if (resource === 'campaigns') {
      const account = adAccount.startsWith('act_') ? adAccount : `act_${adAccount}`;
      const items = await fetchAll(
        `${META_API}/${account}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy`,
        token,
      );

      data = sortActiveFirst(
        items
          .filter((c) => isVisibleStatus(c.effective_status))
          .filter((c) => matchesName(c.name || '', nameFilter)),
      );
    }

    if (resource === 'adsets') {
      if (!campaignId) {
        return jsonResponse({ data: [], error: 'campaign_id ontbreekt.', fallback: true }, 400);
      }

      // Use the campaign-scoped endpoint (proven to return all adsets without rate-limit issues).
      const items = await fetchAll(
        `${META_API}/${campaignId}/adsets?fields=id,name,status,effective_status,optimization_goal,billing_event,daily_budget,lifetime_budget`,
        token,
      );

      data = sortActiveFirst(
        items.filter((a) => isVisibleStatus(a.effective_status)),
      );
    }

    if (resource === 'location_search') {
      if (!searchQuery || searchQuery.length < 2) {
        return jsonResponse({ data: [] });
      }
      const params = new URLSearchParams({
        location_types: JSON.stringify(['city', 'subcity', 'region', 'neighborhood']),
        type: 'adgeolocation',
        q: searchQuery,
        country_code: countryCode,
        limit: '20',
        access_token: token,
      });
      const res = await fetch(`${META_API}/search?${params.toString()}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || 'Meta location search error');
      data = (json.data || []).map((it: any) => ({
        key: it.key,
        name: it.name,
        type: it.type,
        country_code: it.country_code,
        country_name: it.country_name,
        region: it.region,
        primary_city: it.primary_city,
        supports_region: it.supports_region,
        supports_city: it.supports_city,
      }));
      return jsonResponse({ data, meta: { total: data.length } });
    }

    if (resource === 'leadforms') {
      if (!pageId) {
        return jsonResponse({ data: [], error: 'page_id ontbreekt voor leadforms.', fallback: true }, 400);
      }

      let pageToken: string | null = null;
      let debugInfo = '';

      const directRes = await fetch(`${META_API}/${pageId}?fields=access_token,name&access_token=${token}`);
      const directJson = await directRes.json();

      if (directJson.access_token) {
        pageToken = directJson.access_token;
      } else {
        debugInfo += `Direct lookup failed: ${directJson.error?.message || 'no access_token returned'}. `;

        const accountsRes = await fetch(
          `${META_API}/me/accounts?fields=id,name,access_token&limit=200&access_token=${token}`,
        );
        const accountsJson = await accountsRes.json();

        if (accountsJson.error) {
          debugInfo += `me/accounts failed: ${accountsJson.error.message}. `;
        } else {
          const match = (accountsJson.data || []).find((page: any) => page.id === pageId);
          if (match?.access_token) {
            pageToken = match.access_token;
          } else {
            const availableIds = (accountsJson.data || [])
              .map((page: any) => `${page.name} (${page.id})`)
              .join(', ');
            debugInfo += `Page ${pageId} niet gevonden in toegankelijke pages. Beschikbaar: ${availableIds || '(geen)'}. `;
          }
        }
      }

      if (!pageToken) {
        throw new Error(
          `Kon geen Page Access Token ophalen voor page ${pageId}. ${debugInfo}` +
            'Controleer: (1) de Page ID klopt, (2) de token de scopes pages_show_list, pages_read_engagement, pages_manage_ads en leads_retrieval heeft, ' +
            '(3) de gebruiker of system user toegang heeft tot deze page in Meta Business Manager.',
        );
      }

      const items = await fetchAll(
        `${META_API}/${pageId}/leadgen_forms?fields=id,name,status`,
        pageToken,
      );

      data = sortActiveFirst(
        items.filter((form) => isVisibleStatus(form.status)),
      );
    }

    if (resource === 'instagram_accounts') {
      if (!pageId) {
        return jsonResponse({ data: [], error: 'page_id ontbreekt voor instagram_accounts.', fallback: true }, 400);
      }

      // Stap 1: Page Access Token ophalen — Instagram-koppeling vereist page token,
      // niet de gewone user/system-user token.
      let pageToken: string | null = null;
      let debugInfo = '';

      const directRes = await fetch(`${META_API}/${pageId}?fields=access_token,name&access_token=${token}`);
      const directJson = await directRes.json();

      if (directJson.access_token) {
        pageToken = directJson.access_token;
      } else {
        debugInfo += `Direct lookup failed: ${directJson.error?.message || 'no access_token returned'}. `;
        const accountsRes = await fetch(
          `${META_API}/me/accounts?fields=id,name,access_token&limit=200&access_token=${token}`,
        );
        const accountsJson = await accountsRes.json();
        if (accountsJson.error) {
          debugInfo += `me/accounts failed: ${accountsJson.error.message}. `;
        } else {
          const match = (accountsJson.data || []).find((p: any) => p.id === pageId);
          if (match?.access_token) pageToken = match.access_token;
          else debugInfo += `Page ${pageId} niet gevonden in toegankelijke pages. `;
        }
      }

      if (!pageToken) {
        throw new Error(
          `Kon geen Page Access Token ophalen voor page ${pageId}. ${debugInfo}` +
            'Controleer of de Page ID klopt en de token toegang heeft tot deze page.',
        );
      }

      // Stap 2: Verzamel alle Instagram identities die aan deze Page/ad account hangen.
      // Belangrijk: Ads Manager gebruikt vaak de actor/user ID (niet de 1784… Graph ID),
      // dus ad-account identities krijgen voorrang.
      const seen = new Map<string, { id: string; name: string; source: string }>();
      const add = (id: any, name: any, source: string) => {
        const sid = String(id ?? '').trim();
        if (!/^\d{6,}$/.test(sid)) return;
        if (seen.has(sid)) return;
        seen.set(sid, { id: sid, name: String(name ?? '') || `Instagram ${sid}`, source });
      };

      // a) Ad-account Instagram accounts: dit is dezelfde identity-familie die
      // Meta Ads Manager gebruikt in de Instagram-profiel dropdown.
      try {
        const account = adAccount.startsWith('act_') ? adAccount : `act_${adAccount}`;
        const r = await fetch(`${META_API}/${account}/instagram_accounts?fields=id,ig_id,username,name&limit=200&access_token=${token}`);
        const j = await r.json();
        for (const it of j.data || []) {
          add(it.ig_id, it.username || it.name, 'ad_account.instagram_accounts.ig_id');
          add(it.id, it.username || it.name, 'ad_account.instagram_accounts');
        }
      } catch (e) {
        console.warn('IG ad account lookup failed', e);
      }

      // b) instagram_business_account + connected_instagram_account op de page
      try {
        const r = await fetch(
          `${META_API}/${pageId}?fields=instagram_business_account{id,ig_id,username,name},connected_instagram_account{id,ig_id,username,name}&access_token=${pageToken}`,
        );
        const j = await r.json();
        if (j.instagram_business_account?.id) {
          const a = j.instagram_business_account;
          add(a.ig_id, a.username || a.name, 'instagram_business_account.ig_id');
          add(a.id, a.username || a.name, 'instagram_business_account');
        }
        if (j.connected_instagram_account?.id) {
          const a = j.connected_instagram_account;
          add(a.ig_id, a.username || a.name, 'connected_instagram_account.ig_id');
          add(a.id, a.username || a.name, 'connected_instagram_account');
        }
      } catch (e) {
        console.warn('IG fields lookup failed', e);
      }

      // b) /{page}/instagram_accounts
      try {
        const r = await fetch(`${META_API}/${pageId}/instagram_accounts?fields=id,username,name&limit=50&access_token=${pageToken}`);
        const j = await r.json();
        for (const it of j.data || []) add(it.id, it.username || it.name, 'instagram_accounts');
      } catch (e) {
        console.warn('IG accounts lookup failed', e);
      }

      // c) /{page}/page_backed_instagram_accounts (fallback voor pages zonder gekoppeld IG)
      try {
        const r = await fetch(`${META_API}/${pageId}/page_backed_instagram_accounts?fields=id,username,name&limit=50&access_token=${pageToken}`);
        const j = await r.json();
        for (const it of j.data || []) add(it.id, it.username || it.name, 'page_backed_instagram_accounts');
      } catch (e) {
        console.warn('IG page_backed lookup failed', e);
      }

      // Sorteer: Ads Manager actor/user IDs eerst; 1784… Graph IDs blijven fallback.
      data = Array.from(seen.values()).sort((a, b) => {
        const rank = (it: { id: string; source: string }) => {
          if (!/^1784\d+$/.test(it.id) && it.source.startsWith('ad_account.')) return 0;
          if (!/^1784\d+$/.test(it.id)) return 1;
          if (it.source.startsWith('ad_account.')) return 2;
          return 3;
        };
        return rank(a) - rank(b) || a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' });
      });
    }

    // template_ads / template_ad_detail removed: launcher now auto-copies a source ad.

    return jsonResponse({
      data,
      meta: {
        normalized_filter: normalizeMetaName(nameFilter),
        total: data.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('meta-list-resources error', message);
    return jsonResponse({ data: [], error: message, fallback: true });
  }
});
