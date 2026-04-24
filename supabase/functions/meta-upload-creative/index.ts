// Uploads creatives to Meta and creates ads under the chosen ad set.
//
// Strategy: CLONE-FROM-TEMPLATE.
// 1) Fetch a known-good existing ad creative (template_ad_id) from the same
//    ad account/ad set so we inherit its placement-, profile- and enhancement
//    context (page_id, instagram_user_id, link_data structure, etc).
// 2) Override only media + texts + (optional) call_to_action.
// 3) For multi-variant text we add asset_feed_spec on top of the template's
//    object_story_spec (Multiple Text Options). Disable Standard Enhancements
//    by default (Rapid-Ads style) so Meta does not auto-mutate the creative.
// 4) Fallback: when no template is selected, fall back to legacy minimal
//    payload (page_id + lead_form_id), so the launcher still works for
//    accounts where a template can't be picked.
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
  template_ad_id?: string;
  disable_enhancements?: boolean;
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

async function fetchTemplateCreative(token: string, adId: string) {
  const fields = [
    'id',
    'name',
    'creative{id,name,object_story_spec,asset_feed_spec,degrees_of_freedom_spec,instagram_user_id,instagram_actor_id,url_tags}',
  ].join(',');
  const r = await fetch(`${META_API}/${adId}?fields=${encodeURIComponent(fields)}&access_token=${token}`);
  const j = await r.json();
  if (j.error) throw new Error(`template_ad: ${j.error.message}`);
  return j.creative || {};
}

/**
 * Build a creative payload from a template creative, replacing only
 * media + texts. Keeps page_id / instagram_user_id / placement context
 * from the template intact.
 */
function buildPayloadFromTemplate(opts: {
  template: any;
  text: CreativeText;
  imageHash?: string;
  videoId?: string;
  leadFormId?: string;
  disableEnhancements: boolean;
}) {
  const { template, text, imageHash, videoId, leadFormId, disableEnhancements } = opts;

  const tplOss = template?.object_story_spec || {};
  const tplLink = tplOss.link_data || {};
  const tplVideo = tplOss.video_data || {};

  const primaryTexts = cleanVariants(text.primary_texts).slice(0, 5);
  const headlines = cleanVariants(text.headlines).slice(0, 5);
  const descriptions = cleanVariants(text.descriptions).slice(0, 5);

  const mainPrimary = primaryTexts[0] || '';
  const mainHeadline = headlines[0] || '';
  const mainDescription = descriptions[0] || '';

  // Inherit CTA from template, but allow override of lead_gen_form_id and link.
  const tplCta = tplLink.call_to_action || tplVideo.call_to_action || {};
  const ctaType = text.cta || tplCta.type || 'SIGN_UP';
  const link = text.link_url || tplLink.link || tplCta?.value?.link || 'http://fb.me/';
  const callToAction = {
    type: ctaType,
    value: {
      ...(tplCta.value || {}),
      link,
      ...(leadFormId ? { lead_gen_form_id: leadFormId } : {}),
    },
  };

  // Rebuild object_story_spec preserving template profile fields.
  const object_story_spec: Record<string, unknown> = {
    ...tplOss,
  };
  // Don't carry over the original post id — we are creating a new unpublished post.
  delete (object_story_spec as any).template_data;

  if (videoId) {
    object_story_spec.video_data = {
      ...tplVideo,
      video_id: videoId,
      message: mainPrimary || tplVideo.message,
      title: mainHeadline || tplVideo.title,
      link_description: mainDescription || tplVideo.link_description,
      call_to_action: callToAction,
    };
    delete (object_story_spec as any).link_data;
  } else {
    object_story_spec.link_data = {
      ...tplLink,
      message: mainPrimary || tplLink.message,
      link,
      name: mainHeadline || tplLink.name,
      description: mainDescription || tplLink.description,
      image_hash: imageHash || tplLink.image_hash,
      call_to_action: callToAction,
    };
    delete (object_story_spec as any).video_data;
  }

  const payload: Record<string, unknown> = { object_story_spec };

  // Carry instagram_user_id when present (required for IG placements).
  if (template.instagram_user_id) {
    payload.instagram_user_id = template.instagram_user_id;
  }

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
    payload.asset_feed_spec = asset_feed_spec;
  }

  // Standard Enhancements: explicitly opt-out by default ("Rapid Ads"-style),
  // unless we need them for the multi-text variants to be served.
  payload.degrees_of_freedom_spec = {
    creative_features_spec: {
      standard_enhancements: {
        enroll_status: disableEnhancements && !hasMultiple ? 'OPT_OUT' : 'OPT_IN',
      },
    },
  };

  return payload;
}

/** Fallback when no template ad is selected. */
function buildLegacyLeadPayload(opts: {
  pageId: string;
  leadFormId: string;
  text: CreativeText;
  imageHash?: string;
  videoId?: string;
  disableEnhancements: boolean;
}) {
  const { pageId, leadFormId, text, imageHash, videoId, disableEnhancements } = opts;
  const link = text.link_url || 'http://fb.me/';
  const ctaType = text.cta || 'SIGN_UP';

  const primaryTexts = cleanVariants(text.primary_texts).slice(0, 5);
  const headlines = cleanVariants(text.headlines).slice(0, 5);
  const descriptions = cleanVariants(text.descriptions).slice(0, 5);

  const mainPrimary = primaryTexts[0] || '';
  const mainHeadline = headlines[0] || '';
  const mainDescription = descriptions[0] || '';

  const call_to_action = { type: ctaType, value: { lead_gen_form_id: leadFormId, link } };
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

  const hasMultiple =
    primaryTexts.length > 1 || headlines.length > 1 || descriptions.length > 1;
  const payload: Record<string, unknown> = { object_story_spec };

  if (hasMultiple) {
    payload.asset_feed_spec = {
      ad_formats: [videoId ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE'],
      bodies: primaryTexts.map((t) => ({ text: t })),
      titles: headlines.map((t) => ({ text: t })),
      descriptions: descriptions.map((t) => ({ text: t })),
      link_urls: [{ website_url: link }],
      call_to_action_types: [ctaType],
      call_to_actions: [call_to_action],
      ...(videoId ? { videos: [{ video_id: videoId }] } : imageHash ? { images: [{ hash: imageHash }] } : {}),
    };
  }

  payload.degrees_of_freedom_spec = {
    creative_features_spec: {
      standard_enhancements: {
        enroll_status: disableEnhancements && !hasMultiple ? 'OPT_OUT' : 'OPT_IN',
      },
    },
  };
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
    const disableEnhancements = body.disable_enhancements !== false; // default ON

    // Fetch template creative once if provided.
    let template: any = null;
    if (body.template_ad_id) {
      try {
        template = await fetchTemplateCreative(token, body.template_ad_id);
        console.log('Loaded template creative', template?.id, 'has_oss:', !!template?.object_story_spec);
      } catch (e) {
        console.error('Template fetch failed, falling back to legacy payload', e);
      }
    }

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

        const creativePayload = template
          ? buildPayloadFromTemplate({
              template,
              text: c.texts,
              imageHash,
              videoId,
              leadFormId: body.lead_form_id,
              disableEnhancements,
            })
          : buildLegacyLeadPayload({
              pageId: body.page_id,
              leadFormId: body.lead_form_id,
              text: c.texts,
              imageHash,
              videoId,
              disableEnhancements,
            });

        const adName = c.file_name.replace(/\.[^.]+$/, '');
        console.log('Creating creative', adName, 'template_used:', !!template);
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
          template_used: !!template,
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
      JSON.stringify({ results, template_used: !!template }),
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
