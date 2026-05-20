import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
const MAX_FILE_SIZE = 80 * 1024 * 1024;

function safeFileName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'creative';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Je sessie is verlopen. Log opnieuw in en probeer nogmaals.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const form = await req.formData();
    const clientId = String(form.get('client_id') || '').trim();
    const file = form.get('file');

    if (!clientId) throw new Error('client_id ontbreekt');
    if (!(file instanceof File)) throw new Error('Bestand ontbreekt');
    if (!ALLOWED_TYPES.has(file.type)) throw new Error('Alleen JPG, PNG, WebP of MP4 wordt ondersteund.');
    if (file.size > MAX_FILE_SIZE) throw new Error('Bestand is te groot. Gebruik maximaal 80 MB per bestand.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Je sessie is verlopen. Log opnieuw in en probeer nogmaals.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const path = `${clientId}/${Date.now()}-${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await adminClient.storage
      .from('ad-launcher-uploads')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    return new Response(JSON.stringify({ path }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ad-launcher-upload error', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Upload mislukt' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
