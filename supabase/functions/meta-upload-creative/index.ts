// Uploads creatives to Meta and creates ads under the chosen ad set.
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
  // images keyed by filename
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

interface CreativeVariant {
  primary_text: string;
  headline: string;
  description: string;
  cta: string;
  link_url: string;
  suffix?: string;
}

function cleanVariants(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function buildCreativeVariants(text: CreativeText): CreativeVariant[] {
  const primaryTexts = cleanVariants(text.primary_texts);
  const headlines = cleanVariants(text.headlines);
  const descriptions = cleanVariants(text.descriptions);
  const totalVariants = Math.max(primaryTexts.length, headlines.length, descriptions.length, 1);

  return Array.from({ length: totalVariants }, (_, index) => ({
    primary_text: primaryTexts[index] ?? primaryTexts[0] ?? '',
    headline: headlines[index] ?? headlines[0] ?? '',
    description: descriptions[index] ?? descriptions[0] ?? '',
    cta: text.cta || 'SIGN_UP',
    link_url: text.link_url || 'http://fb.me/',
    suffix: totalVariants > 1 ? `V${index + 1}` : undefined,
  }));
}

function buildStandardCreativePayload(opts: {
  pageId: string;
  leadFormId: string;
  variant: CreativeVariant;
  imageHash?: string;
  videoId?: string;
}) {
  const { pageId, leadFormId, variant, imageHash, videoId } = opts;
  const cta = {
    type: variant.cta || 'SIGN_UP',
    value: { lead_gen_form_id: leadFormId, link: variant.link_url || 'http://fb.me/' },
  };

  const link_data: Record<string, unknown> = {
    message: variant.primary_text,
    name: variant.headline,
    description: variant.description,
    link: variant.link_url || 'http://fb.me/',
    call_to_action: cta,
  };

  if (imageHash) {
    link_data.image_hash = imageHash;
  }

  if (videoId) {
    return {
      object_story_spec: {
        page_id: pageId,
        video_data: {
          video_id: videoId,
          message: variant.primary_text,
          title: variant.headline,
          link_description: variant.description,
          call_to_action: cta,
        },
      },
    };
  }

  return {
    object_story_spec: {
      page_id: pageId,
      link_data,
    },
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

        const variants = buildCreativeVariants(c.texts);
        const variantResults: any[] = [];

        for (const variant of variants) {
          const creativePayload = buildStandardCreativePayload({
            pageId: body.page_id,
            leadFormId: body.lead_form_id,
            variant,
            imageHash,
            videoId,
          });

          const adName = [c.file_name.replace(/\.[^.]+$/, ''), variant.suffix].filter(Boolean).join(' - ');
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

          const launchRow = {
            ...launchRowBase,
            creative_filename: variant.suffix ? `${c.file_name} (${variant.suffix})` : c.file_name,
            creative_id: creativeId,
            ad_id: adJson.id,
            status: 'success',
          };
          await supabase.from('ad_launches').insert(launchRow);
          variantResults.push({ ad_id: adJson.id, creative_id: creativeId, variant: variant.suffix ?? 'V1' });
        }

        results.push({
          file_name: c.file_name,
          ad_id: variantResults[0]?.ad_id ?? null,
          ad_ids: variantResults.map((entry) => entry.ad_id),
          variants_created: variantResults.length,
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

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('meta-upload-creative error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
