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

  if (primary?.image_hash) params.image_hash = primary.image_hash;

  const hasMultipleText =
    primaryTexts.length > 1 || headlines.length > 1 || descriptions.length > 1;
  const hasMultipleAssets = assets.length > 1;

  if (hasMultipleText || hasMultipleAssets) {
    const asset_feed_spec: Record<string, unknown> = {
      ad_formats: [allVideo ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE'],
      bodies: (primaryTexts.length ? primaryTexts : [mainPrimary]).map((t) => ({ text: t })),
      titles: (headlines.length ? headlines : [mainHeadline]).map((t) => ({ text: t })),
      descriptions: (descriptions.length ? descriptions : [mainDescription]).map((t) => ({ text: t })),
      link_urls: [{ website_url: link }],
      call_to_action_types: [ctaType],
      call_to_actions: [callToAction],
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
      asset_feed_spec.asset_customization_rules = assets.map((a, i) => {
        const rule: Record<string, unknown> = {
          customization_spec: RATIO_TO_PLACEMENTS[a.ratio as AspectRatio],
        };
        if (a.is_video) rule.video_label = { name: labelFor(a, i) };
        else rule.image_label = { name: labelFor(a, i) };
        return rule;
      });
    }

    params.asset_feed_spec = asset_feed_spec;
  }

  // Meta accepteert alleen een beperkte set keys in creative_features_spec.
  // We sturen alleen de keys mee die geldig zijn en die we willen uitschakelen.
  params.degrees_of_freedom_spec = {
    creative_features_spec: {
      standard_enhancements_catalog: { enroll_status: 'OPT_OUT' },
      image_animation: { enroll_status: 'OPT_OUT' },
      text_overlay_translation: { enroll_status: 'OPT_OUT' },
    },
  };

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

    const sourceAdId = await pickSourceAd(token, body.adset_id);
    if (!sourceAdId) {
      throw new Error(
        'Geen bestaande advertentie gevonden in deze ad set om te dupliceren. ' +
          'Maak handmatig 1 werkende advertentie aan in deze ad set in Meta Ads Manager, en probeer opnieuw.',
      );
    }
    console.log('Using source ad for copy:', sourceAdId);

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

        console.log('Copying ad', sourceAdId, 'for bundle', bundle.base_name, 'variants:', bundle.variants.length);
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
