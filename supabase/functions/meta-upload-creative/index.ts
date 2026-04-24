// Uploads creatives to Meta and creates ads under the chosen ad set.
//
// Strategy: AUTO-COPY.
// 1) Automatically pick a known-good source ad from the chosen ad set
//    (preferably an ACTIVE lead-gen ad).
// 2) Duplicate it via the Ads Copy API: POST /{source_ad_id}/copies
// 3) Use `creative_parameters` to override only the fields we care about
//    (image_hash / video_id, body, title, link_description, link_url,
//    call_to_action with the lead_gen_form_id).
// 4) For multiple text variants, use asset_feed_spec inside creative_parameters
//    so all variants live inside ONE ad.
// 5) Fallback: if no source ad exists in the ad set, fall back to a minimal
//    legacy creative payload so the launcher still works.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const META_API = 'https://graph.facebook.com/v21.0';

interface CreativeText {
  primary_texts: string[];
  headlines: string[];
  descriptions: string[];
  cta: string;
  link_url: string;
}

interface CreativeItem {
  storage_path: string;
  file_name: string;
  file_type: string;
  texts: CreativeText;
}

interface LaunchBody {
  client_id: string;
  campaign_id: string;
  adset_id: string;
  lead_form_id: string;
  page_id: string;
  status?: 'PAUSED' | 'ACTIVE';
  creatives: CreativeItem[];
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

function cleanVariants(values: string[]) {
  return (values || []).map((value) => (value ?? '').trim()).filter(Boolean);
}

/** Pick a usable source ad from the chosen ad set. Prefer ACTIVE ads. */
async function pickSourceAd(token: string, adsetId: string): Promise<string | null> {
  const url = `${META_API}/${adsetId}/ads?fields=id,name,status,effective_status&limit=50&access_token=${token}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) {
    console.error('pickSourceAd list error', j.error);
    return null;
  }
  const ads: any[] = j.data || [];
  const active = ads.find((a) => a.effective_status === 'ACTIVE');
  if (active) return active.id;
  const paused = ads.find((a) => a.effective_status === 'PAUSED');
  if (paused) return paused.id;
  return ads[0]?.id || null;
}

/** Build creative_parameters for the copy. Override only what we want to change. */
function buildCreativeParameters(opts: {
  text: CreativeText;
  leadFormId: string;
  imageHash?: string;
  videoId?: string;
}) {
  const { text, leadFormId, imageHash, videoId } = opts;

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

  // Top-level creative parameter overrides supported by Ad Copies API.
  const params: Record<string, unknown> = {
    body: mainPrimary,
    title: mainHeadline,
    link_description: mainDescription,
    link_url: link,
  };

  if (imageHash) params.image_hash = imageHash;

  const hasMultiple =
    primaryTexts.length > 1 || headlines.length > 1 || descriptions.length > 1;

  if (hasMultiple) {
    const asset_feed_spec: Record<string, unknown> = {
      ad_formats: [videoId ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE'],
      bodies: primaryTexts.map((t) => ({ text: t })),
      titles: headlines.map((t) => ({ text: t })),
      descriptions: descriptions.map((t) => ({ text: t })),
      link_urls: [{ website_url: link }],
      call_to_action_types: [ctaType],
      call_to_actions: [callToAction],
    };
    if (videoId) asset_feed_spec.videos = [{ video_id: videoId }];
    else if (imageHash) asset_feed_spec.images = [{ hash: imageHash }];
    params.asset_feed_spec = asset_feed_spec;
  }

  return params;
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

    // Find a source ad in the ad set to copy from.
    const sourceAdId = await pickSourceAd(token, body.adset_id);
    if (!sourceAdId) {
      throw new Error(
        'Geen bestaande advertentie gevonden in deze ad set om te dupliceren. ' +
          'Maak handmatig 1 werkende advertentie aan in deze ad set in Meta Ads Manager, en probeer opnieuw.',
      );
    }
    console.log('Using source ad for copy:', sourceAdId);

    const results: any[] = [];

    for (const c of body.creatives) {
      const launchRowBase: any = {
        client_id: body.client_id,
        campaign_id: body.campaign_id,
        adset_id: body.adset_id,
        lead_form_id: body.lead_form_id,
        creative_filename: c.file_name,
      };

      try {
        const { data: fileData, error: dlErr } = await supabase.storage
          .from('ad-launcher-uploads')
          .download(c.storage_path);
        if (dlErr || !fileData) throw new Error(`storage download: ${dlErr?.message}`);

        const isVideo = (c.file_type || '').startsWith('video');
        let imageHash: string | undefined;
        let videoId: string | undefined;
        if (isVideo) {
          videoId = await uploadVideo(adAccount, token, fileData, c.file_name);
        } else {
          imageHash = await uploadImage(adAccount, token, fileData, c.file_name);
        }

        const adName = c.file_name.replace(/\.[^.]+$/, '');
        const creativeParameters = buildCreativeParameters({
          text: c.texts,
          leadFormId: body.lead_form_id,
          imageHash,
          videoId,
        });

        // Use Meta's Ads Copy API: clones the entire ad and only overrides
        // the supplied creative parameters. Avoids rebuilding object_story_spec.
        console.log('Copying ad', sourceAdId, 'with overrides for', adName);
        const copyJson = await postToMeta(`${sourceAdId}/copies`, token, {
          adset_id: body.adset_id,
          status_option: status,
          rename_options: { rename_strategy: 'NO_RENAME' },
          creative_parameters: creativeParameters,
        });

        const newAdId = copyJson.copied_ad_id || copyJson.ad_id || copyJson.id;
        if (!newAdId) {
          throw new Error(`copies: geen copied_ad_id terug van Meta — ${JSON.stringify(copyJson)}`);
        }

        // Rename the new ad to match the uploaded file (best-effort).
        try {
          await postToMeta(`${newAdId}`, token, { name: adName });
        } catch (e) {
          console.warn('rename copy failed', e);
        }

        const variantsCount =
          cleanVariants(c.texts.primary_texts).length +
          cleanVariants(c.texts.headlines).length +
          cleanVariants(c.texts.descriptions).length;

        await supabase.from('ad_launches').insert({
          ...launchRowBase,
          ad_id: newAdId,
          status: 'success',
        });

        results.push({
          file_name: c.file_name,
          ad_id: newAdId,
          variants_bundled: variantsCount,
          source_ad_id: sourceAdId,
          success: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Launch failed for', c.file_name, msg);
        await supabase.from('ad_launches').insert({
          ...launchRowBase,
          status: 'failed',
          error: msg,
        });
        results.push({ file_name: c.file_name, error: msg, success: false });
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
