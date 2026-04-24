const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API = 'https://graph.facebook.com/v21.0';
const VALID_RESOURCES = new Set(['campaigns', 'adsets', 'leadforms']);

type MetaResource = 'campaigns' | 'adsets' | 'leadforms';

type RequestBody = {
  resource?: unknown;
  campaign_id?: unknown;
  name_filter?: unknown;
  page_id?: unknown;
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
    const pageId = asTrimmedString(body.page_id);

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
        items
          .filter((form) => isVisibleStatus(form.status))
          .filter((form) => matchesName(form.name || '', nameFilter)),
      );
    }

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
