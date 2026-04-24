// Uploads creatives to Meta and creates ads under the chosen ad set.
//
// Per file -> 1 advertentie. De eerste tekstvariant van elk veld komt in
// object_story_spec (de "main" tekst zichtbaar in feed). Als er MEERDERE
// varianten zijn van primary_text / headline / description, dan wordt
// asset_feed_spec toegevoegd met bodies/titles/descriptions arrays.
// Dit activeert "Multiple Text Options" in Meta Ads Manager (1 of N).
//
// Werkt op standaard ad sets (Lead Gen). Geen Dynamic Creative vereist.
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
  file_type: string; // image/* or video/*
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

function cleanVariants(values: string[]) {
  return (values || []).map((value) => (value ?? '').trim()).filter(Boolean);
}

function buildLeadCreativePayload(opts: {
  pageId: string;
  leadFormId: string;
  text: CreativeText;
  imageHash?: string;
  videoId?: string;
}) {
  const { pageId, leadFormId, text, imageHash, videoId } = opts;
  const link = text.link_url || 'http://fb.me/';
  const ctaType = text.cta || 'SIGN_UP';

  const primaryTexts = cleanVariants(text.primary_texts).slice(0, 5);
  const headlines = cleanVariants(text.headlines).slice(0, 5);
  const descriptions = cleanVariants(text.descriptions).slice(0, 5);

  const mainPrimary = primaryTexts[0] || '';
  const mainHeadline = headlines[0] || '';
  const mainDescription = descriptions[0] || '';

  const call_to_action = {
    type: ctaType,
    value: { lead_gen_form_id: leadFormId, link },
  };

  // Build object_story_spec with the main creative (image/video + first text variant)
  const object_story_spec: Record<string, unknown> = { page_id: pageId };

  if (videoId) {
    object_story_spec.video_data = {
      video_id: videoId,
      message: mainPrimary,
      title: mainHeadline,
      link_description: mainDescription,
      call_to_action,
    };
  } else {
    object_story_spec.link_data = {
      message: mainPrimary,
      link,
      name: mainHeadline,
      description: mainDescription,
      image_hash: imageHash,
      call_to_action,
    };
  }

  const payload: Record<string, unknown> = { object_story_spec };

  // Only add asset_feed_spec if there are MULTIPLE variants in any field.
  // This activates "Multiple Text Options" in Meta Ads Manager (1 of N).
  const hasMultiple =
    primaryTexts.length > 1 || headlines.length > 1 || descriptions.length > 1;

  if (hasMultiple) {
    const bodies = (primaryTexts.length > 0 ? primaryTexts : [' ']).map((t) => ({ text: t }));
    const titles = (headlines.length > 0 ? headlines : [' ']).map((t) => ({ text: t }));
    const descs = (descriptions.length > 0 ? descriptions : [' ']).map((t) => ({ text: t }));

    const assetFeed: Record<string, unknown> = {
      bodies,
      titles,
      descriptions: descs,
      ad_formats: [videoId ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE'],
      link_urls: [{ website_url: link }],
      call_to_action_types: [ctaType],
    };

    if (videoId) {
      assetFeed.videos = [{ video_id: videoId }];
    } else if (imageHash) {
      assetFeed.images = [{ hash: imageHash }];
    }

    payload.asset_feed_spec = assetFeed;
  }

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

        const creativePayload = buildLeadCreativePayload({
          pageId: body.page_id,
          leadFormId: body.lead_form_id,
          text: c.texts,
          imageHash,
          videoId,
        });

        const adName = c.file_name.replace(/\.[^.]+$/, '');
        const creativeJson = await postToMeta(`${adAccount}/adcreatives`, token, {
          name: adName,
          ...creativePayload,
        });
        const creativeId = creativeJson.id;

        const adJson = await postToMeta(`${adAccount}/ads`, token, {
          name: adName,
          adset_id: body.adset_id,
          creative: { creative_id: creativeId },
          status,
        });

        const variantsCount =
          cleanVariants(c.texts.primary_texts).length +
          cleanVariants(c.texts.headlines).length +
          cleanVariants(c.texts.descriptions).length;

        await supabase.from('ad_launches').insert({
          ...launchRowBase,
          creative_id: creativeId,
          ad_id: adJson.id,
          status: 'success',
        });

        results.push({
          file_name: c.file_name,
          ad_id: adJson.id,
          variants_bundled: variantsCount,
          success: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase.from('ad_launches').insert({
          ...launchRowBase,
          status: 'failed',
          error: msg,
        });
        results.push({ file_name: c.file_name, error: msg, success: false });
      }
    }

    return new Response(
      JSON.stringify({ results }),
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
