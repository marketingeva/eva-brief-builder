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

function cleanVariants(values: string[]) {
  return (values || []).map((value) => (value ?? '').trim()).filter(Boolean);
}

async function pickSourceAd(token: string, adsetId: string): Promise<string | null> {
  const url = `${META_API}/${adsetId}/ads?fields=id,name,status,effective_status&limit=50&access_token=${token}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) {
    console.error('pickSourceAd list error', j.error);
    return null;
  }
  const ads: any[] = j.data || [];
  return (
    ads.find((a) => a.effective_status === 'ACTIVE')?.id ??
    ads.find((a) => a.effective_status === 'PAUSED')?.id ??
    ads[0]?.id ??
    null
  );
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

// Meta accepteert verschillende ID-formaten voor `instagram_user_id`:
//  - 1784… (Instagram Business Account ID via Graph API)
//  - andere numerieke IDs voor page-connected accounts (mits gepaard met juiste page_id)
// We verzamelen daarom ALLE plausibele kandidaten en proberen ze één voor één
// tegen de Meta adcreatives endpoint tot er één geaccepteerd wordt.

// Verzamel ALLEEN echte Instagram-account IDs. We negeren expliciet `payload.id`
// (= meestal de Facebook Page ID) en root-level objecten zonder IG-context,
// zodat we niet per ongeluk de Page ID als instagram_user_id proberen.
function collectIds(payload: any, out: Set<string>) {
  if (!payload || typeof payload !== 'object') return;
  const push = (v: unknown) => {
    const s = String(v ?? '').trim();
    if (/^\d{6,}$/.test(s)) out.add(s);
  };
  push(payload.instagram_business_account?.id);
  push(payload.connected_instagram_account?.id);
  for (const item of payload.data || []) {
    push(item?.id);
    push(item?.instagram_business_account?.id);
    push(item?.connected_instagram_account?.id);
  }
  for (const item of payload.instagram_accounts?.data || []) {
    push(item?.id);
    push(item?.instagram_business_account?.id);
  }
  for (const item of payload.connected_instagram_accounts?.data || []) {
    push(item?.id);
  }
  for (const item of payload.page_backed_instagram_accounts?.data || []) {
    push(item?.id);
  }
}

interface IgCandidate {
  id: string;
  source: string;
}

async function fetchIgCandidates(
  token: string,
  adAccount: string,
  pageId: string,
  explicitId: string | null,
): Promise<IgCandidate[]> {
  const seen = new Set<string>();
  const ordered: IgCandidate[] = [];
  const add = (id: string | null | undefined, source: string) => {
    const s = String(id ?? '').trim();
    if (!/^\d{6,}$/.test(s) || seen.has(s)) return;
    seen.add(s);
    ordered.push({ id: s, source });
  };

  // Stap 1: Page bekijken om Business Account én Page access token op te halen.
  let pageAccessToken: string | null = null;
  try {
    const pageRes = await getFromMeta(
      `${pageId}?fields=access_token,instagram_business_account{id,username},connected_instagram_account{id,username}`,
      token,
    );
    if (pageRes?.error) console.warn('IG candidates: page lookup', JSON.stringify(pageRes.error));
    if (pageRes?.access_token) pageAccessToken = pageRes.access_token;
    const ids = new Set<string>();
    collectIds(pageRes, ids);
    for (const id of ids) add(id, 'page.fields');
  } catch (e) {
    console.warn('IG candidates: page lookup failed', e);
  }

  // Stap 2: Connected instagram accounts op het ad account (officiële Meta endpoint).
  try {
    const acc = await getFromMeta(
      `${adAccount}/connected_instagram_accounts?fields=id,username&limit=200`,
      token,
    );
    if (acc?.error) console.warn('IG candidates: adaccount.connected_instagram_accounts', JSON.stringify(acc.error));
    const ids = new Set<string>();
    collectIds(acc, ids);
    for (const id of ids) add(id, 'adaccount.connected_instagram_accounts');
  } catch (e) {
    console.warn('IG candidates: adaccount connected failed', e);
  }

  // Stap 3: instagram_accounts op het ad account.
  try {
    const acc = await getFromMeta(
      `${adAccount}/instagram_accounts?fields=id,username,instagram_business_account{id,username}&limit=200`,
      token,
    );
    if (acc?.error) console.warn('IG candidates: adaccount.instagram_accounts', JSON.stringify(acc.error));
    const ids = new Set<string>();
    collectIds(acc, ids);
    for (const id of ids) add(id, 'adaccount.instagram_accounts');
  } catch (e) {
    console.warn('IG candidates: adaccount ig accounts failed', e);
  }

  // Stap 4: instagram_accounts op de page zelf, met page token indien beschikbaar.
  if (pageAccessToken) {
    try {
      const pg = await getFromMeta(`${pageId}/instagram_accounts?fields=id,username`, pageAccessToken);
      if (pg?.error) console.warn('IG candidates: page.instagram_accounts', JSON.stringify(pg.error));
      const ids = new Set<string>();
      collectIds(pg, ids);
      for (const id of ids) add(id, 'page.instagram_accounts');
    } catch (e) { console.warn('IG candidates: page.instagram_accounts failed', e); }

    try {
      const pbia = await getFromMeta(`${pageId}/page_backed_instagram_accounts?fields=id,username`, pageAccessToken);
      if (pbia?.error) console.warn('IG candidates: page.page_backed', JSON.stringify(pbia.error));
      const ids = new Set<string>();
      collectIds(pbia, ids);
      for (const id of ids) add(id, 'page.page_backed_instagram_accounts');
    } catch (e) { console.warn('IG candidates: page.page_backed failed', e); }
  }

  // Stap 5: het door de gebruiker opgegeven ID als laatste fallback toevoegen.
  if (explicitId) add(explicitId, 'client_setting');

  // Veiligheidsnet: filter de Facebook Page ID er uit — die is nooit een
  // geldige instagram_user_id en veroorzaakt subtiele Meta-fouten.
  const filtered = ordered.filter((c) => c.id !== String(pageId).trim());

  // Sorteer: 1784… (Business Account IDs) eerst — die werken het breedst.
  filtered.sort((a, b) => {
    const aBiz = /^1784\d+$/.test(a.id) ? 0 : 1;
    const bBiz = /^1784\d+$/.test(b.id) ? 0 : 1;
    return aBiz - bBiz;
  });

  return filtered;
}

function buildDirectCreativePayload(opts: {
  pageId: string;
  instagramActorId: string | null;
  name: string;
  text: CreativeText;
  leadFormId: string;
  assets: UploadedAsset[];
}) {
  const params = buildCreativeParameters({ text: opts.text, leadFormId: opts.leadFormId, assets: opts.assets });
  if (params.asset_feed_spec) {
    delete params.body;
    delete params.title;
    delete params.link_description;
    delete params.link_url;
    delete params.image_hash;
  }
  const story: any = { page_id: opts.pageId };
  if (opts.instagramActorId) {
    story.instagram_user_id = opts.instagramActorId;
  }
  return {
    name: opts.name,
    object_story_spec: story,
    ...params,
  };
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

    const needsSourceCopy = body.creatives.some((bundle) => bundle.variants.length <= 1);
    const sourceAdId = needsSourceCopy ? await pickSourceAd(token, body.adset_id) : null;
    if (needsSourceCopy && !sourceAdId) {
      throw new Error(
        'Geen bestaande advertentie gevonden in deze ad set om te dupliceren. ' +
          'Maak handmatig 1 werkende advertentie aan in deze ad set in Meta Ads Manager, en probeer opnieuw.',
      );
    }
    if (sourceAdId) console.log('Using source ad for copy:', sourceAdId);

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

        const creativeParameters = buildCreativeParameters({
          text: bundle.texts,
          leadFormId: body.lead_form_id,
          assets,
        });

        let newAdId: string | undefined;
        if (assets.length > 1) {
          console.log('Creating placement asset creative for bundle', bundle.base_name, 'variants:', bundle.variants.length);
          const explicitIg = (body.instagram_account_id || '').trim() || null;
          const candidates = await fetchIgCandidates(token, adAccount, body.page_id, explicitIg);
          console.log('IG candidates:', candidates.map((c) => `${c.id}(${c.source})`).join(', ') || '<none>');
          if (candidates.length === 0) {
            throw new Error(
              'Geen Instagram-account gevonden voor deze Facebook Page of ad account. ' +
              'Koppel een Instagram Business Account aan de Page in Meta Business Settings, of vul het Instagram Account ID in bij Meta-instellingen.',
            );
          }

          // Probeer ieder kandidaat-ID tot Meta er één accepteert.
          let creativeJson: any = null;
          let lastErr: Error | null = null;
          for (const cand of candidates) {
            try {
              creativeJson = await postToMeta(`${adAccount}/adcreatives`, token, buildDirectCreativePayload({
                pageId: body.page_id,
                instagramActorId: cand.id,
                name: adName,
                text: bundle.texts,
                leadFormId: body.lead_form_id,
                assets,
              }));
              console.log('IG ID accepted by Meta:', cand.id, 'source:', cand.source);
              break;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              lastErr = err instanceof Error ? err : new Error(msg);
              // Alleen doorgaan als de fout specifiek over instagram_user_id gaat.
              if (!/instagram_user_id|valid Instagram account|Instagram-account|1772103|2238281/i.test(msg)) {
                throw err;
              }
              console.warn('IG ID rejected:', cand.id, 'source:', cand.source, '-', msg);
            }
          }
          if (!creativeJson) {
            throw lastErr || new Error('Meta accepteerde geen enkel Instagram-account ID.');
          }

          const adJson = await postToMeta(`${adAccount}/ads`, token, {
            name: adName,
            adset_id: body.adset_id,
            creative: { creative_id: creativeJson.id },
            status,
          });
          newAdId = adJson.id;
        } else {
          console.log('Copying ad', sourceAdId, 'for bundle', bundle.base_name, 'variants:', bundle.variants.length);
          const copyJson = await postToMeta(`${sourceAdId}/copies`, token, {
            adset_id: body.adset_id,
            status_option: status,
            rename_options: { rename_strategy: 'NO_RENAME' },
            creative_parameters: creativeParameters,
          });
          newAdId = copyJson.copied_ad_id || copyJson.ad_id || copyJson.id;
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
