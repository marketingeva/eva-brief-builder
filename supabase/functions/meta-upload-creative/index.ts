// Uploads creatives (incl. bundles met meerdere aspect-ratio's) naar Meta en
// maakt advertenties aan onder de gekozen ad set via de Ads Copy API.
//
// Bundling: één "creative" in de payload kan meerdere `variants` hebben, elk
// met een eigen aspect-ratio (1:1, 4:5, 9:16, 16:9). Per bundle wordt één
// Meta-ad aangemaakt waarin alle ratio's via `asset_customization_rules` aan
// de juiste placements gekoppeld worden ("rapid ad"-stijl).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API = 'https://graph.facebook.com/v21.0';

type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9';

interface PlacementSpec {
  publisher_platforms: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  messenger_positions?: string[];
  audience_network_positions?: string[];
}

const RATIO_TO_PLACEMENTS: Record<AspectRatio, PlacementSpec> = {
  '1:1': {
    publisher_platforms: ['facebook', 'instagram', 'audience_network'],
    facebook_positions: ['feed', 'marketplace', 'search', 'video_feeds'],
    instagram_positions: ['stream', 'explore', 'explore_home'],
    audience_network_positions: ['classic'],
  },
  '4:5': {
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: ['feed'],
    instagram_positions: ['stream', 'explore'],
  },
  '9:16': {
    publisher_platforms: ['facebook', 'instagram', 'messenger'],
    facebook_positions: ['story', 'facebook_reels'],
    instagram_positions: ['story', 'reels'],
    messenger_positions: ['story'],
  },
  '16:9': {
    publisher_platforms: ['facebook', 'audience_network'],
    facebook_positions: ['instream_video', 'right_hand_column'],
    audience_network_positions: ['rewarded_video'],
  },
};

const RATIO_PRIORITY: AspectRatio[] = ['1:1', '4:5', '9:16', '16:9'];

function placementsForRatio(ratio: AspectRatio, availableRatios: Set<AspectRatio>): PlacementSpec {
  // Als 4:5 aanwezig is, moet die de feed-placements krijgen. Anders matcht
  // de brede 1:1-regel dezelfde placements en toont Meta overal de 1:1 asset.
  if (ratio === '1:1' && availableRatios.has('4:5')) {
    return {
      publisher_platforms: ['facebook', 'instagram', 'audience_network'],
      facebook_positions: ['marketplace', 'search', 'video_feeds'],
      instagram_positions: ['explore_home'],
      audience_network_positions: ['classic'],
    };
  }
  return RATIO_TO_PLACEMENTS[ratio];
}

interface CreativeText {
  primary_texts: string[];
  headlines: string[];
  descriptions: string[];
  cta: string;
  link_url: string;
}

interface CreativeVariant {
  ratio: AspectRatio | null;
  storage_path: string;
  file_name: string;
  file_type: string;
}

interface CreativeBundle {
  base_name: string;
  texts: CreativeText;
  variants: CreativeVariant[];
}

interface LaunchBody {
  client_id: string;
  campaign_id: string;
  adset_id: string;
  lead_form_id: string;
  page_id: string;
  instagram_account_id?: string | null;
  status?: 'PAUSED' | 'ACTIVE';
  creatives: CreativeBundle[];
}

function metaErrorMessage(prefix: string, error: any) {
  if (!error) return prefix;
  const parts = [error.message, error.error_user_title, error.error_user_msg]
    .filter(Boolean)
    .join(' — ');
  const codes = [error.code, error.error_subcode].filter(Boolean).join('/');
  return `${prefix}: ${parts || 'Onbekende Meta fout'}${codes ? ` (code ${codes})` : ''}`;
}

async function postToMeta(path: string, token: string, payload: Record<string, unknown>) {
  const params = new URLSearchParams();
  params.set('access_token', token);
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  const response = await fetch(`${META_API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const json = await response.json();
  if (json.error) {
    throw new Error(metaErrorMessage(path.split('/').pop() || 'meta', json.error));
  }
  return json;
}

async function uploadImage(adAccount: string, token: string, blob: Blob, filename: string) {
  const fd = new FormData();
  fd.append('access_token', token);
  fd.append('source', blob, filename);
  const r = await fetch(`${META_API}/${adAccount}/adimages`, { method: 'POST', body: fd });
  const j = await r.json();
  if (j.error) throw new Error(`adimages: ${j.error.message}`);
  const key = Object.keys(j.images || {})[0];
  return j.images[key].hash as string;
}

async function uploadVideo(adAccount: string, token: string, blob: Blob, filename: string) {
  const fd = new FormData();
  fd.append('access_token', token);
  fd.append('source', blob, filename);
  const r = await fetch(`${META_API}/${adAccount}/advideos`, { method: 'POST', body: fd });
  const j = await r.json();
  if (j.error) throw new Error(`advideos: ${j.error.message}`);
  return j.id as string;
}

async function getFromMeta(pathOrUrl: string, token: string) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${META_API}/${pathOrUrl}`;
  const sep = url.includes('?') ? '&' : '?';
  const r = await fetch(`${url}${sep}access_token=${encodeURIComponent(token)}`);
  return await r.json();
}

function rawAdAccountId(adAccount: string) {
  return adAccount.replace(/^act_/, '');
}

function cleanVariants(values: string[]) {
  return (values || []).map((value) => (value ?? '').trim()).filter(Boolean);
}

interface UploadedAsset {
  ratio: AspectRatio | null;
  file_name: string;
  image_hash?: string;
  video_id?: string;
  is_video: boolean;
}

function buildCreativeParameters(opts: {
  text: CreativeText;
  leadFormId: string;
  assets: UploadedAsset[];
}) {
  const { text, leadFormId, assets } = opts;

  const primaryTexts = cleanVariants(text.primary_texts).slice(0, 5);
  const headlines = cleanVariants(text.headlines).slice(0, 5);
  const descriptions = cleanVariants(text.descriptions).slice(0, 5);

  const mainPrimary = primaryTexts[0] || '';
  const mainHeadline = headlines[0] || '';
  const mainDescription = descriptions[0] || '';

  const link = text.link_url || 'http://fb.me/';
  const ctaType = text.cta || 'SIGN_UP';
  const callToAction = {
    type: ctaType,
    value: { link, lead_gen_form_id: leadFormId },
  };

  // Kies "primary" asset: voorkeur 1:1, anders eerste bekende ratio, anders eerste.
  const primary =
    RATIO_PRIORITY.map((r) => assets.find((a) => a.ratio === r)).find(Boolean) ??
    assets[0];
  const allVideo = assets.every((a) => a.is_video);
  const allImage = assets.every((a) => !a.is_video);

  const params: Record<string, unknown> = {
    body: mainPrimary,
    title: mainHeadline,
    link_description: mainDescription,
    link_url: link,
  };

  const hasMultipleText =
    primaryTexts.length > 1 || headlines.length > 1 || descriptions.length > 1;
  const hasMultipleAssets = assets.length > 1;

  if (!hasMultipleAssets && primary?.image_hash) params.image_hash = primary.image_hash;

  if (hasMultipleText || hasMultipleAssets) {
    const sharedLabels = [{ name: 'shared_copy' }];
    const asset_feed_spec: Record<string, unknown> = {
      ad_formats: [allVideo ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE'],
      bodies: (primaryTexts.length ? primaryTexts : [mainPrimary]).map((t) => ({ text: t, adlabels: sharedLabels })),
      titles: (headlines.length ? headlines : [mainHeadline]).map((t) => ({ text: t, adlabels: sharedLabels })),
      descriptions: (descriptions.length ? descriptions : [mainDescription]).map((t) => ({ text: t, adlabels: sharedLabels })),
      link_urls: [{ website_url: link, adlabels: sharedLabels }],
      call_to_action_types: [ctaType],
      call_to_actions: [{ ...callToAction, adlabels: sharedLabels }],
    };

    // Bouw stabiele labels per asset (verplicht voor asset_customization_rules).
    const labelFor = (a: UploadedAsset, i: number) =>
      `asset_${i}_${(a.ratio || 'auto').replace(':', 'x')}`;

    if (allVideo) {
      asset_feed_spec.videos = assets
        .filter((a) => a.video_id)
        .map((a, i) => ({
          video_id: a.video_id,
          adlabels: [{ name: labelFor(a, i) }],
        }));
    } else if (allImage) {
      asset_feed_spec.images = assets
        .filter((a) => a.image_hash)
        .map((a, i) => ({
          hash: a.image_hash,
          adlabels: [{ name: labelFor(a, i) }],
        }));
    }

    // Placement-customization: alleen toepassen als er meer dan 1 asset is
    // én elk asset een bekende ratio heeft.
    const ratioAssets = assets.filter((a) => a.ratio && (a.image_hash || a.video_id));
    if (hasMultipleAssets && ratioAssets.length === assets.length && (allImage || allVideo)) {
      const availableRatios = new Set(ratioAssets.map((a) => a.ratio as AspectRatio));
      asset_feed_spec.optimization_type = 'PLACEMENT';
      asset_feed_spec.asset_customization_rules = assets.map((a, i) => {
        const rule: Record<string, unknown> = {
          customization_spec: placementsForRatio(a.ratio as AspectRatio, availableRatios),
          body_label: sharedLabels[0],
          title_label: sharedLabels[0],
          description_label: sharedLabels[0],
          link_url_label: sharedLabels[0],
          call_to_action_label: sharedLabels[0],
        };
        if (a.is_video) rule.video_label = { name: labelFor(a, i) };
        else rule.image_label = { name: labelFor(a, i) };
        return rule;
      });
    }

    params.asset_feed_spec = asset_feed_spec;
  }

  // Meta vereist dat we expliciet afzonderlijke features opt-outen i.p.v.
  // het oude 'standard enhancements' veld. Alleen de door Meta toegestane
  // keys in creative_features_spec gebruiken.
  params.degrees_of_freedom_spec = {
    creative_features_spec: {
      standard_enhancements_catalog: { enroll_status: 'OPT_OUT' },
      image_animation: { enroll_status: 'OPT_OUT' },
      text_overlay_translation: { enroll_status: 'OPT_OUT' },
      ig_video_native_subtitle: { enroll_status: 'OPT_OUT' },
      product_metadata_automation: { enroll_status: 'OPT_OUT' },
      profile_card: { enroll_status: 'OPT_OUT' },
      product_browsing: { enroll_status: 'OPT_OUT' },
    },
  };

  return params;
}

// Meta heeft vaak TWEE Instagram-ID's per profiel:
//  - Legacy actor/user ID (bv. 1646…)  → alleen gebruiken om te matchen / koppelen
//  - Graph Instagram User ID (1784…)   → enige ID die Meta accepteert als `instagram_user_id`
// Sinds API v22 is `instagram_actor_id` deprecated, dus dat sturen we niet meer mee.

interface IgIdentity {
  actorId: string | null;    // legacy / ads-manager dropdown ID (niet-1784)
  businessId: string | null; // 1784… IGBA
  source: string;
}

type IgPayloadMode = 'business_only';

function isGraphId(id: string) {
  return /^1784\d+$/.test(id);
}

function adLevelInstagramId(identity: IgIdentity | null, mode: IgPayloadMode) {
  if (!identity) return null;
  return identity.businessId;
}

function storyInstagramId(identity: IgIdentity | null, mode: IgPayloadMode) {
  if (!identity) return null;
  return identity.businessId;
}

function payloadModesForIdentity(identity: IgIdentity): IgPayloadMode[] {
  if (identity.businessId) return ['business_only'];
  return [];
}

function isPageBackedFallback(identity: IgIdentity) {
  const source = identity.source || '';
  const hasRealAssetSource = /instagram_business_account|connected_instagram_account|ad_account\.|business\.|page\.instagram_accounts/.test(source);
  return Boolean(identity.businessId && !identity.actorId && source.includes('page_backed') && !hasRealAssetSource);
}

async function resolveIgIdentity(
  token: string,
  adAccount: string,
  pageId: string,
  explicitId: string | null,
): Promise<IgIdentity[]> {
  const pairs: IgIdentity[] = [];
  const seenKey = new Set<string>();
  const push = (actor: string | null, biz: string | null, source: string) => {
    let a = (actor || '').trim() || null;
    let b = (biz || '').trim() || null;
    if (a && isGraphId(a)) {
      b = b || a;
      a = null;
    }
    if (b && !isGraphId(b)) {
      a = a || b;
      b = null;
    }
    if (!a && !b) return;
    if (a && a === String(pageId).trim()) return; // page-id is nooit een IG-id
    const key = `${a || ''}|${b || ''}`;
    if (seenKey.has(key)) return;
    seenKey.add(key);
    pairs.push({ actorId: a, businessId: b, source });
  };

  // 1) Page lookup: levert het paar direct (id = 1784…, ig_id = actor/legacy).
  let pageAccessToken: string | null = null;
  try {
    const pageRes = await getFromMeta(
      `${pageId}?fields=access_token,instagram_business_account{id,ig_id,username},connected_instagram_account{id,ig_id,username}`,
      token,
    );
    if (pageRes?.access_token) pageAccessToken = pageRes.access_token;
    const iba = pageRes?.instagram_business_account;
    if (iba?.id || iba?.ig_id) push(iba?.ig_id || null, iba?.id || null, 'page.instagram_business_account');
    const cia = pageRes?.connected_instagram_account;
    if (cia?.id || cia?.ig_id) push(cia?.ig_id || null, cia?.id || null, 'page.connected_instagram_account');
  } catch (e) {
    console.warn('IG identity: page lookup failed', e);
  }

  // 2) Ad-account instagram_accounts: levert ook beide id's.
  try {
    const accountIg = await getFromMeta(
      `${adAccount}/instagram_accounts?fields=id,ig_id,username&limit=200`,
      token,
    );
    for (const it of accountIg?.data || []) {
      push(it?.ig_id || null, it?.id || null, 'ad_account.instagram_accounts');
    }
  } catch (e) {
    console.warn('IG identity: ad account lookup failed', e);
  }

  // 2b) Nieuwe aanbevolen edge voor ads: expliciet aan het ad account gekoppelde IG-profielen.
  try {
    const connectedIg = await getFromMeta(
      `${adAccount}/connected_instagram_accounts?fields=id,ig_id,username&limit=200`,
      token,
    );
    for (const it of connectedIg?.data || []) {
      push(it?.ig_id || null, it?.id || null, 'ad_account.connected_instagram_accounts');
    }
  } catch (e) {
    console.warn('IG identity: ad account connected lookup failed', e);
  }

  // 2c) Business Manager assets: Ads Manager haalt de identity-dropdown vaak uit
  // business-level Instagram assets, niet alleen uit page-backed fallbacks.
  const businessIds = new Set<string>();
  const diagnostics: string[] = [];
  try {
    const accountInfo = await getFromMeta(`${adAccount}?fields=business{id,name},owner_business{id,name}`, token);
    if (accountInfo?.error) diagnostics.push(`Ad account business lookup: ${accountInfo.error.message}`);
    if (accountInfo?.business?.id) businessIds.add(accountInfo.business.id);
    if (accountInfo?.owner_business?.id) businessIds.add(accountInfo.owner_business.id);
    if (businessIds.size === 0) diagnostics.push('Meta geeft geen business/owner_business terug voor dit ad account.');
  } catch (e) {
    console.warn('IG identity: ad account business lookup failed', e);
  }
  for (const businessId of businessIds) {
    for (const edge of ['instagram_accounts', 'owned_instagram_accounts', 'client_instagram_accounts']) {
      try {
        const businessIg = await getFromMeta(
          `${businessId}/${edge}?fields=id,ig_id,username,name&limit=200`,
          token,
        );
        for (const it of businessIg?.data || []) {
          push(it?.ig_id || null, it?.id || null, `business.${edge}`);
        }
      } catch (e) {
        console.warn(`IG identity: business ${edge} lookup failed`, e);
      }
    }
  }

  // 2d) Als de gebruiker het echte IG actor-ID heeft opgeslagen maar het ad account
  // deze asset nog niet ziet, probeer de officiële Business Manager-koppeling:
  // POST /{IG_USER_ID}/authorized_adaccounts met business + account_id.
  if (explicitId && !isGraphId(explicitId) && businessIds.size > 0) {
    for (const businessId of businessIds) {
      try {
        await postToMeta(`${explicitId}/authorized_adaccounts`, token, {
          business: businessId,
          account_id: rawAdAccountId(adAccount),
        });
        console.log('IG identity: authorized ad account for explicit IG actor', `ig=${explicitId} business=${businessId}`);
        const accountIg = await getFromMeta(
          `${adAccount}/instagram_accounts?fields=id,ig_id,username&limit=200`,
          token,
        );
        for (const it of accountIg?.data || []) {
          push(it?.ig_id || null, it?.id || null, 'ad_account.instagram_accounts+authorized');
        }
      } catch (e) {
        diagnostics.push(`Instagram-profiel autoriseren voor ad account mislukt: ${e instanceof Error ? e.message : String(e)}`);
        console.warn('IG identity: authorize ad account failed', e);
      }
    }
  }

  // 3) Page-token paths (extra info, ook hier krijgen we id/ig_id).
  if (pageAccessToken) {
    try {
      const pg = await getFromMeta(`${pageId}/instagram_accounts?fields=id,ig_id,username`, pageAccessToken);
      for (const it of pg?.data || []) push(it?.ig_id || null, it?.id || null, 'page.instagram_accounts');
    } catch (e) { console.warn('IG identity: page.instagram_accounts failed', e); }
    try {
      const pbia = await getFromMeta(`${pageId}/page_backed_instagram_accounts?fields=id,ig_id,username`, pageAccessToken);
      for (const it of pbia?.data || []) push(it?.ig_id || null, it?.id || null, 'page.page_backed_instagram_accounts');
    } catch (e) { console.warn('IG identity: page.page_backed failed', e); }
  }

  // 4) Expliciete keuze: zoek bijbehorend paar; als Meta de ID's los teruggeeft,
  // combineer de handmatig gekozen ID met de beste gevonden tegenhanger.
  if (explicitId) {
    const eid = explicitId.trim();
    const matched = pairs.find((p) => p.actorId === eid || p.businessId === eid);
    if (matched) {
      const idx = pairs.indexOf(matched);
      pairs.splice(idx, 1);
      pairs.unshift({ ...matched, source: `${matched.source}+client_setting` });
    } else if (isGraphId(eid)) {
      const inferredActor = pairs.find((p) => p.actorId && !p.source.includes('page_backed'))?.actorId || null;
      pairs.unshift({
        actorId: inferredActor,
        businessId: eid,
        source: inferredActor ? 'client_setting+inferred_actor' : 'client_setting',
      });
    } else {
      const inferredBusiness = pairs.find((p) => p.businessId && !p.source.includes('page_backed'))?.businessId || null;
      pairs.unshift({
        actorId: eid,
        businessId: inferredBusiness,
        source: inferredBusiness ? 'client_setting+inferred_business' : 'client_setting',
      });
    }
  }

  if (diagnostics.length > 0) {
    console.warn('IG identity diagnostics:', diagnostics.join(' | '));
    for (const pair of pairs) {
      pair.source = `${pair.source}+diagnostics:${diagnostics.join(' / ')}`;
    }
  }

  return pairs;
}

function buildDirectCreativePayload(opts: {
  pageId: string;
  identity: IgIdentity | null;
  mode: IgPayloadMode;
  includeStoryLinkData?: boolean;
  name: string;
  text: CreativeText;
  leadFormId: string;
  assets: UploadedAsset[];
}) {
  const params = buildCreativeParameters({ text: opts.text, leadFormId: opts.leadFormId, assets: opts.assets });
  delete params.body;
  delete params.title;
  delete params.link_description;
  delete params.link_url;
  delete params.image_hash;

  const primaryTexts = cleanVariants(opts.text.primary_texts);
  const headlines = cleanVariants(opts.text.headlines);
  const descriptions = cleanVariants(opts.text.descriptions);
  const primary =
    RATIO_PRIORITY.map((r) => opts.assets.find((a) => a.ratio === r)).find(Boolean) ??
    opts.assets[0];
  const link = opts.text.link_url || 'http://fb.me/';
  const callToAction = {
    type: opts.text.cta || 'SIGN_UP',
    value: { link, lead_gen_form_id: opts.leadFormId },
  };

  const story: any = { page_id: opts.pageId };
  const id = opts.identity;
  const storyIg = storyInstagramId(id, opts.mode);
  const adLevelIg = adLevelInstagramId(id, opts.mode);
  if (storyIg) story.instagram_user_id = storyIg;

  if (opts.includeStoryLinkData !== false) {
    if (primary?.is_video && primary.video_id && !params.asset_feed_spec) {
      story.video_data = {
        video_id: primary.video_id,
        message: primaryTexts[0] || '',
        title: headlines[0] || '',
        call_to_action: callToAction,
      };
    } else {
      story.link_data = {
        message: primaryTexts[0] || '',
        name: headlines[0] || '',
        description: descriptions[0] || '',
        link,
        call_to_action: callToAction,
        ...(primary?.image_hash && !params.asset_feed_spec ? { image_hash: primary.image_hash } : {}),
      };
    }
  }

  const payload: Record<string, unknown> = {
    name: opts.name,
    object_story_spec: story,
    ...params,
  };
  if (adLevelIg) payload.instagram_user_id = adLevelIg;
  return payload;
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get('META_ACCESS_TOKEN');
    const adAccountRaw = Deno.env.get('AD_ACCOUNT_ID');
    if (!token || !adAccountRaw) throw new Error('META_ACCESS_TOKEN or AD_ACCOUNT_ID missing');
    const adAccount = adAccountRaw.startsWith('act_') ? adAccountRaw : `act_${adAccountRaw}`;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = (await req.json()) as LaunchBody;
    const status = body.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';

    const sourceAdId: string | null = null;

    const results: any[] = [];

    for (const bundle of body.creatives) {
      const ratiosLabel = bundle.variants.map((v) => v.ratio || 'auto').join(', ');
      const adName = `${bundle.base_name}${bundle.variants.length > 1 ? ` (${bundle.variants.length} formaten)` : ''}`;
      const filenameLabel = `${bundle.base_name} [${ratiosLabel}]`;

      const launchRowBase: any = {
        client_id: body.client_id,
        campaign_id: body.campaign_id,
        adset_id: body.adset_id,
        lead_form_id: body.lead_form_id,
        creative_filename: filenameLabel,
      };

      try {
        // 1) Upload elk variant-bestand naar Meta
        const assets: UploadedAsset[] = [];
        for (const v of bundle.variants) {
          const { data: fileData, error: dlErr } = await supabase.storage
            .from('ad-launcher-uploads')
            .download(v.storage_path);
          if (dlErr || !fileData) throw new Error(`storage download (${v.file_name}): ${dlErr?.message}`);
          const isVideo = (v.file_type || '').startsWith('video');
          if (isVideo) {
            const video_id = await uploadVideo(adAccount, token, fileData, v.file_name);
            assets.push({ ratio: v.ratio, file_name: v.file_name, video_id, is_video: true });
          } else {
            const image_hash = await uploadImage(adAccount, token, fileData, v.file_name);
            assets.push({ ratio: v.ratio, file_name: v.file_name, image_hash, is_video: false });
          }
        }

        let newAdId: string | undefined;
        let newCreativeId: string | undefined;
        {
          console.log('Creating explicit Instagram creative for bundle', bundle.base_name, 'variants:', bundle.variants.length);
          const explicitIg = (body.instagram_account_id || '').trim() || null;
          const identities = await resolveIgIdentity(token, adAccount, body.page_id, explicitIg);
          console.log(
            'IG identities:',
            identities.map((p) => `[actor=${p.actorId || '-'} business=${p.businessId || '-'} ${p.source}]`).join(', ') || '<none>',
          );
          if (identities.length === 0) {
            throw new Error(
              'Geen Instagram-account gevonden voor deze Facebook Page of ad account. ' +
              'Koppel een Instagram Business Account aan de Page in Meta Business Settings, of vul het Instagram Account ID in bij Meta-instellingen.',
            );
          }

          // Ads Manager gebruikt de top-level instagram_user_id als ad-level identity.
          // Bij sommige accounts is dat de legacy actor ID, terwijl object_story_spec
          // juist de 1784… Graph ID nodig heeft. Daarom proberen we expliciete modes.
          let creativeJson: any = null;
          let acceptedIdentity: IgIdentity | null = null;
          let acceptedMode: IgPayloadMode | null = null;
          let lastErr: Error | null = null;
          for (const ident of identities) {
            if (isPageBackedFallback(ident)) {
              lastErr = new Error(
                'Alleen een Page-backed Instagram fallback gevonden, niet het echte Instagram-profiel. ' +
                'Koppel of wijs het Instagram-profiel toe aan dezelfde Facebook Page én hetzelfde ad account in Meta Business.',
              );
              console.warn('IG identity skipped: page-backed fallback only', `business=${ident.businessId || '-'} (${ident.source})`);
              continue;
            }
            const modes = payloadModesForIdentity(ident);
            if (modes.length === 0) {
              if (ident.actorId && !ident.businessId) {
                lastErr = new Error(
                  `Instagram-profiel ${ident.actorId} is alleen als oude actor-ID bekend. ` +
                  'Meta accepteert voor nieuwe creatives alleen het 1784… Instagram User ID. ' +
                  `Wijs dit Instagram-profiel toe aan ad account ${rawAdAccountId(adAccount)} in Meta Business, of sla het 1784… Instagram User ID op.`,
                );
                console.warn('IG identity skipped: actor-only without Graph Instagram User ID', `actor=${ident.actorId} (${ident.source})`);
              }
              continue;
            }
            for (const mode of modes) {
              try {
                creativeJson = await postToMeta(`${adAccount}/adcreatives`, token, buildDirectCreativePayload({
                  pageId: body.page_id,
                  identity: ident,
                  mode,
                  includeStoryLinkData: true,
                  name: adName,
                  text: bundle.texts,
                  leadFormId: body.lead_form_id,
                  assets,
                }));
                acceptedIdentity = ident;
                acceptedMode = mode;
                console.log('IG identity accepted:', `mode=${mode} actor=${ident.actorId || '-'} business=${ident.businessId || '-'} (${ident.source})`);
                break;
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                lastErr = err instanceof Error ? err : new Error(msg);
                if (/object_story_spec|link_data|asset_feed_spec|cannot be used together|Invalid parameter/i.test(msg)) {
                  try {
                    creativeJson = await postToMeta(`${adAccount}/adcreatives`, token, buildDirectCreativePayload({
                      pageId: body.page_id,
                      identity: ident,
                      mode,
                      includeStoryLinkData: false,
                      name: adName,
                      text: bundle.texts,
                      leadFormId: body.lead_form_id,
                      assets,
                    }));
                    acceptedIdentity = { ...ident, source: `${ident.source}+minimal_story_retry` };
                    acceptedMode = mode;
                    console.log('IG identity accepted with minimal story spec:', `mode=${mode} actor=${ident.actorId || '-'} business=${ident.businessId || '-'} (${ident.source})`);
                    break;
                  } catch (retryErr) {
                    const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
                    lastErr = retryErr instanceof Error ? retryErr : new Error(retryMsg);
                    console.warn('IG identity minimal-story retry rejected:', `mode=${mode} actor=${ident.actorId || '-'} business=${ident.businessId || '-'} (${ident.source})`, '-', retryMsg);
                  }
                }
                if (!/instagram_user_id|instagram_actor_id|valid Instagram account|Instagram-account|Old Instagram ID|deprecated|1772103|2238281/i.test(msg)) {
                  throw err;
                }
                console.warn('IG identity rejected:', `mode=${mode} actor=${ident.actorId || '-'} business=${ident.businessId || '-'} (${ident.source})`, '-', msg);
              }
              if (creativeJson) break;
            }
            if (creativeJson) break;
          }
          if (!creativeJson || !acceptedIdentity || !acceptedMode) {
            throw lastErr || new Error('Meta accepteerde geen enkele Instagram-identiteit.');
          }
          newCreativeId = creativeJson.id;

          // Verifieer welk IG ID Meta daadwerkelijk op ad-level én story-level heeft gezet.
          try {
            const verify = await getFromMeta(
              `${creativeJson.id}?fields=object_story_spec,instagram_user_id,actor_id,effective_object_story_id,effective_instagram_media_id,asset_feed_spec`,
              token,
            );
            const expectedAdLevelIg = adLevelInstagramId(acceptedIdentity, acceptedMode);
            const expectedStoryIg = storyInstagramId(acceptedIdentity, acceptedMode);
            const actualAdLevelIg = verify?.instagram_user_id || verify?.actor_id || null;
            const actualStoryIg = verify?.object_story_spec?.instagram_user_id || null;
            console.log('Creative verify:', JSON.stringify({
              id: creativeJson.id,
              mode: acceptedMode,
              instagram_user_id: verify?.instagram_user_id,
              oss_ig: verify?.object_story_spec?.instagram_user_id,
              oss_page: verify?.object_story_spec?.page_id,
              actor_id: verify?.actor_id,
              effective_object_story_id: verify?.effective_object_story_id,
              expected_ad_level_ig: expectedAdLevelIg,
              expected_story_ig: expectedStoryIg,
              ad_level_matched: !expectedAdLevelIg || actualAdLevelIg === expectedAdLevelIg,
              story_matched: !expectedStoryIg || actualStoryIg === expectedStoryIg,
            }));
            if (expectedAdLevelIg && actualAdLevelIg !== expectedAdLevelIg) {
              throw new Error(`Meta creative koppelde ad-level Instagram ${actualAdLevelIg || 'niet'} in plaats van ${expectedAdLevelIg}.`);
            }
            if (expectedStoryIg && actualStoryIg !== expectedStoryIg) {
              throw new Error(`Meta creative koppelde story Instagram ${actualStoryIg || 'niet'} in plaats van ${expectedStoryIg}.`);
            }
          } catch (e) {
            throw new Error(`Creative Instagram-verificatie mislukt: ${e instanceof Error ? e.message : String(e)}`);
          }

          // Sla het actor-id op (Ads Manager dropdown), maar alleen als de gebruiker zelf nog niets had gekozen.
          if (acceptedIdentity && !explicitIg && acceptedIdentity.actorId) {
            try {
              await supabase
                .from('clients')
                .update({ meta_instagram_account_id: acceptedIdentity.actorId } as any)
                .eq('id', body.client_id);
              console.log('Persisted accepted IG actor ID to client:', acceptedIdentity.actorId);
            } catch (e) {
              console.warn('Persist IG ID failed', e);
            }
          }

          const adJson = await postToMeta(`${adAccount}/ads`, token, {
            name: adName,
            adset_id: body.adset_id,
            creative: { creative_id: creativeJson.id },
            status,
          });
          newAdId = adJson.id;
          try {
            const adVerify = await getFromMeta(
              `${newAdId}?fields=id,name,creative{id,object_story_spec,instagram_user_id,actor_id,effective_object_story_id,effective_instagram_media_id,asset_feed_spec}`,
              token,
            );
            const expectedAdLevelIg = adLevelInstagramId(acceptedIdentity, acceptedMode);
            const expectedStoryIg = storyInstagramId(acceptedIdentity, acceptedMode);
            const actualAdLevelIg = adVerify?.creative?.instagram_user_id || adVerify?.creative?.actor_id || null;
            const actualStoryIg = adVerify?.creative?.object_story_spec?.instagram_user_id || null;
            console.log('Ad verify:', JSON.stringify({
              id: adVerify?.id,
              creative_id: adVerify?.creative?.id,
              mode: acceptedMode,
              instagram_user_id: adVerify?.creative?.instagram_user_id,
              oss_ig: adVerify?.creative?.object_story_spec?.instagram_user_id,
              oss_page: adVerify?.creative?.object_story_spec?.page_id,
              actor_id: adVerify?.creative?.actor_id,
              effective_object_story_id: adVerify?.creative?.effective_object_story_id,
              expected_ad_level_ig: expectedAdLevelIg,
              expected_story_ig: expectedStoryIg,
              ad_level_matched: !expectedAdLevelIg || actualAdLevelIg === expectedAdLevelIg,
              story_matched: !expectedStoryIg || actualStoryIg === expectedStoryIg,
            }));
            if (expectedAdLevelIg && actualAdLevelIg !== expectedAdLevelIg) {
              throw new Error(`Meta ad koppelde ad-level Instagram ${actualAdLevelIg || 'niet'} in plaats van ${expectedAdLevelIg}.`);
            }
            if (expectedStoryIg && actualStoryIg !== expectedStoryIg) {
              throw new Error(`Meta ad koppelde story Instagram ${actualStoryIg || 'niet'} in plaats van ${expectedStoryIg}.`);
            }
          } catch (e) {
            throw new Error(`Ad Instagram-verificatie mislukt: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (!newAdId) {
          throw new Error('Geen nieuw ad_id terug van Meta.');
        }

        try {
          await postToMeta(`${newAdId}`, token, { name: adName });
        } catch (e) {
          console.warn('rename copy failed', e);
        }

        await supabase.from('ad_launches').insert({
          ...launchRowBase,
          ad_id: newAdId,
          creative_id: newCreativeId,
          status: 'success',
        });

        results.push({
          base_name: bundle.base_name,
          file_name: filenameLabel,
          ad_id: newAdId,
          variants_count: bundle.variants.length,
          source_ad_id: sourceAdId,
          success: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Launch failed for', bundle.base_name, msg);
        await supabase.from('ad_launches').insert({
          ...launchRowBase,
          status: 'failed',
          error: msg,
        });
        results.push({ base_name: bundle.base_name, file_name: filenameLabel, error: msg, success: false });
      }
    }

    return new Response(
      JSON.stringify({ results, source_ad_id: sourceAdId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('meta-upload-creative error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
