import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get("META_ACCESS_TOKEN");
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "META_ACCESS_TOKEN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { id, level, status } = body as {
      id?: string;
      level?: "campaign" | "adset" | "ad";
      status?: "ACTIVE" | "PAUSED";
    };

    if (!id || typeof id !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid 'id'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!level || !["campaign", "adset", "ad"].includes(level)) {
      return new Response(JSON.stringify({ error: "Invalid 'level'. Must be campaign|adset|ad" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (status !== "ACTIVE" && status !== "PAUSED") {
      return new Response(JSON.stringify({ error: "Invalid 'status'. Must be ACTIVE|PAUSED" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams();
    params.set("status", status);
    params.set("access_token", accessToken);

    const res = await fetch(`${META_BASE}/${id}`, {
      method: "POST",
      body: params,
    });

    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
      console.error("Meta toggle error:", res.status, text);
      return new Response(
        JSON.stringify({ error: "Meta API error", status: res.status, detail: data }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id, level, status, meta: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("toggle-meta-status error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
