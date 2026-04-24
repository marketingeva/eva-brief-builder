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

function buildCreativePayload(opts: {
  pageId: string;
  leadFormId: string;
  text: CreativeText;
  imageHash?: string;
  videoId?: string;
}) {
  const { pageId, leadFormId, text, imageHash, videoId } = opts;
  const cta = {
    type: text.cta || 'SIGN_UP',
    value: { lead_gen_form_id: leadFormId, link: text.link_url || 'http://fb.me/' },
  };

  const useDynamic =
    text.primary_texts.length > 1 || text.headlines.length > 1 || text.descriptions.length > 1;

  if (useDynamic) {
    const asset_feed_spec: any = {
      bodies: text.primary_texts.filter(Boolean).map((t) => ({ text: t })),
      titles: text.headlines.filter(Boolean).map((t) => ({ text: t })),
      descriptions: text.descriptions.filter(Boolean).map((t) => ({ text: t })),
      ad_formats: [imageHash ? 'SINGLE_IMAGE' : 'SINGLE_VIDEO'],
      call_to_action_types: [text.cta || 'SIGN_UP'],
      link_urls: [{ website_url: text.link_url || 'http://fb.me/' }],
    };
    if (imageHash) asset_feed_spec.images = [{ hash: imageHash }];
    if (videoId) asset_feed_spec.videos = [{ video_id: videoId }];

    return {
      object_story_spec: { page_id: pageId },
      asset_feed_spec,
    };
  }

  const link_data: any = {
    message: text.primary_texts[0] || '',
    name: text.headlines[0] || '',
    description: text.descriptions[0] || '',
    link: text.link_url || 'http://fb.me/',
    call_to_action: cta,
  };
  if (imageHash) link_data.image_hash = imageHash;

  if (videoId) {
    return {
      object_story_spec: {
        page_id: pageId,
        video_data: {
          video_id: videoId,
          message: text.primary_texts[0] || '',
          title: text.headlines[0] || '',
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
      const launchRow: any = {
        client_id: body.client_id,
        campaign_id: body.campaign_id,
        adset_id: body.adset_id,
        lead_form_id: body.lead_form_id,
        creative_filename: c.file_name,
        status: 'pending',
      };

      try {
        // Download from storage
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

        const creativePayload = buildCreativePayload({
          pageId: body.page_id,
          leadFormId: body.lead_form_id,
          text: c.texts,
          imageHash,
          videoId,
        });

        const creativeJson = await postToMeta(`${adAccount}/adcreatives`, token, {
          name: c.file_name,
          ...creativePayload,
        });
        const creativeId = creativeJson.id;

        launchRow.creative_id = creativeId;

        const adJson = await postToMeta(`${adAccount}/ads`, token, {
          name: c.file_name,
          adset_id: body.adset_id,
          creative: { creative_id: creativeId },
          status,
        });

        launchRow.ad_id = adJson.id;
        launchRow.status = 'success';
        results.push({ file_name: c.file_name, ad_id: adJson.id, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        launchRow.status = 'failed';
        launchRow.error = msg;
        results.push({ file_name: c.file_name, error: msg, success: false });
      } finally {
        await supabase.from('ad_launches').insert(launchRow);
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
