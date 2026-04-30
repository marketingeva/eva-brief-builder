import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const SYSTEM_PROMPT = `Je bent Eva — de centrale AI-assistent binnen Eva AI Marketeer, een interne marketing-werkplek voor recruitment in de Nederlandse zorgsector.

Persona:
- Je bent een grounded, ervaren recruitment-marketing strategist. Geen marketing-fluff, geen hype-taal.
- Je antwoordt **altijd** in helder, professioneel Nederlands.
- Wees beknopt en direct. Korte alinea's, lijstjes waar nuttig, geen overdreven beleefdheidsformules.

Wat je kunt:
- Je hebt tools om data uit de hele app op te halen: klanten, learning profielen, live Meta-campagnes en metrics, en je kunt advertenties pauzeren/activeren of nieuwe ad sets/ads aanmaken.
- Roep gerust meerdere tools achter elkaar aan om een goed antwoord te bouwen.
- Verzin **nooit** cijfers, campagnenamen of klantgegevens — haal ze op via tools.

Veiligheid voor destructieve acties:
- Voor **toggle_campaign_status**, **create_adset** of **launch_ad** vraag je **altijd eerst expliciet** om bevestiging in de chat ("Zal ik X pauzeren? Ja/nee") en wacht je op een duidelijke ja van de gebruiker voor je de tool draait.
- Voor lees-tools (data ophalen) heb je geen bevestiging nodig — gewoon doen.

Bij twijfel over welke klant of welke periode: stel één korte vraag.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_clients",
      description: "Geef de volledige lijst klanten in het systeem terug (naam, slug, care_type).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_summary",
      description: "Haal het volledige profiel van één klant op: brand, learning, USPs, locaties, rollen.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string", description: "Klantnaam of slug of UUID." },
        },
        required: ["client"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_live_ads_metrics",
      description: "Haal Meta-advertentiemetrics op (spend, leads, CTR, CPL, link clicks). Optioneel filteren op klantnaam.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string", description: "Optioneel: klantnaam om op te filteren." },
          date_preset: {
            type: "string",
            enum: ["today", "yesterday", "last_3d", "last_7d", "last_14d", "last_30d", "this_month", "last_month"],
            description: "Periode. Default: last_7d.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_active_campaigns",
      description: "Lijst actieve Meta-campagnes met basisinfo (id, naam, status, klant indien af te leiden).",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string", description: "Optioneel: klantnaam om op te filteren." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_campaign_status",
      description: "Pauzeer of activeer een Meta object (campaign/adset/ad). DESTRUCTIEF — vraag eerst om bevestiging.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Meta object ID (campaign/adset/ad)." },
          level: { type: "string", enum: ["campaign", "adset", "ad"] },
          active: { type: "boolean", description: "true = ACTIVE, false = PAUSED" },
        },
        required: ["id", "level", "active"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_briefings",
      description: "Zoek recente briefings, optioneel per klant.",
      parameters: {
        type: "object",
        properties: {
          client: { type: "string" },
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
    },
  },
];

async function resolveClient(sb: any, query: string) {
  // Try by id, slug, then name (ilike)
  let { data } = await sb.from("clients").select("*").eq("id", query).maybeSingle();
  if (data) return data;
  ({ data } = await sb.from("clients").select("*").eq("slug", query).maybeSingle());
  if (data) return data;
  const res = await sb.from("clients").select("*").ilike("name", `%${query}%`).limit(1);
  return res.data?.[0] || null;
}

async function execTool(name: string, args: any, sb: any, authHeader: string | null) {
  try {
    if (name === "list_clients") {
      const { data } = await sb.from("clients").select("id, name, slug, care_type").order("name");
      return { clients: data || [] };
    }

    if (name === "get_client_summary") {
      const client = await resolveClient(sb, args.client);
      if (!client) return { error: `Klant '${args.client}' niet gevonden.` };
      const [learning, usps, locations, brand] = await Promise.all([
        sb.from("client_learning_profiles").select("*").eq("client_id", client.id).maybeSingle(),
        sb.from("client_usps").select("usp_text").eq("client_id", client.id),
        sb.from("client_locations").select("name, city, region").eq("client_id", client.id),
        sb.from("client_brand_profiles").select("*").eq("client_id", client.id).maybeSingle(),
      ]);
      return {
        client: {
          id: client.id, name: client.name, slug: client.slug, care_type: client.care_type,
          description: client.description, mission: client.mission, vision: client.vision, website: client.website_url,
        },
        learning: learning.data,
        brand: brand.data,
        usps: usps.data?.map((u: any) => u.usp_text) || [],
        locations: locations.data || [],
      };
    }

    if (name === "get_live_ads_metrics" || name === "list_active_campaigns") {
      const datePreset = args.date_preset || "last_7d";
      let clientName: string | undefined;
      if (args.client) {
        const c = await resolveClient(sb, args.client);
        clientName = c?.meta_name_filter || c?.name;
        if (!c) return { error: `Klant '${args.client}' niet gevonden.` };
      }
      const url = `${SUPABASE_URL}/functions/v1/fetch-meta-ads`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader || `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({ datePreset, clientName }),
      });
      if (!resp.ok) return { error: `Meta fetch failed: ${resp.status}` };
      const data = await resp.json();
      if (name === "list_active_campaigns") {
        const campaigns = (data.campaigns || []).filter((c: any) => c.status === "ACTIVE").map((c: any) => ({
          id: c.id, name: c.name, status: c.status, spend: c.spend, leads: c.leads, ctr: c.ctr,
        }));
        return { campaigns };
      }
      // Aggregate totals
      const campaigns = data.campaigns || [];
      const totals = campaigns.reduce((acc: any, c: any) => {
        acc.spend += Number(c.spend || 0);
        acc.leads += Number(c.leads || 0);
        acc.unique_clicks += Number(c.unique_clicks || c.unique_link_clicks || 0);
        acc.impressions += Number(c.impressions || 0);
        return acc;
      }, { spend: 0, leads: 0, unique_clicks: 0, impressions: 0 });
      const ctr = totals.impressions ? (totals.unique_clicks / totals.impressions) * 100 : 0;
      const cpl = totals.leads ? totals.spend / totals.leads : 0;
      return {
        period: datePreset,
        client: clientName || "alle klanten",
        totals: {
          spend_eur: Number(totals.spend.toFixed(2)),
          leads: totals.leads,
          unique_link_clicks: totals.unique_clicks,
          ctr_pct: Number(ctr.toFixed(2)),
          cost_per_lead_eur: Number(cpl.toFixed(2)),
        },
        active_campaigns_count: campaigns.filter((c: any) => c.status === "ACTIVE").length,
      };
    }

    if (name === "toggle_campaign_status") {
      const url = `${SUPABASE_URL}/functions/v1/toggle-meta-status`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader || `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({ id: args.id, level: args.level, status: args.active ? "ACTIVE" : "PAUSED" }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) return { error: data.error || `toggle failed: ${resp.status}` };
      return { success: true, new_status: args.active ? "ACTIVE" : "PAUSED" };
    }

    if (name === "search_briefings") {
      let q = sb.from("briefing_rows").select("id, functie, locatie, status, created_at, client_id, clients(name)").order("created_at", { ascending: false }).limit(args.limit || 10);
      if (args.client) {
        const c = await resolveClient(sb, args.client);
        if (c) q = q.eq("client_id", c.id);
      }
      const { data } = await q;
      return { briefings: data || [] };
    }

    return { error: `Onbekende tool: ${name}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Niet ingelogd." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sbUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Niet ingelogd." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Agent loop with streaming on the FINAL turn
    const convo: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

    // Use SSE to stream tokens + tool-status events
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          let safety = 0;
          while (safety++ < 6) {
            const isFirstOrToolFollowup = true;
            const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-3-flash-preview",
                messages: convo,
                tools: TOOLS,
                tool_choice: "auto",
                stream: true,
              }),
            });

            if (!resp.ok) {
              const t = await resp.text();
              if (resp.status === 429) send("error", { message: "Rate limit bereikt, probeer het zo opnieuw." });
              else if (resp.status === 402) send("error", { message: "AI credits op." });
              else send("error", { message: `AI gateway error: ${resp.status} ${t.slice(0, 200)}` });
              break;
            }

            // Parse SSE stream from gateway, accumulate tool calls and text
            const reader = resp.body!.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            let assistantText = "";
            const toolCalls: Record<number, { id: string; name: string; args: string }> = {};
            let finishReason = "";

            outer: while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              let nl;
              while ((nl = buf.indexOf("\n")) !== -1) {
                let line = buf.slice(0, nl);
                buf = buf.slice(nl + 1);
                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (!line.startsWith("data: ")) continue;
                const json = line.slice(6).trim();
                if (json === "[DONE]") break outer;
                try {
                  const parsed = JSON.parse(json);
                  const choice = parsed.choices?.[0];
                  if (!choice) continue;
                  const delta = choice.delta || {};
                  if (delta.content) {
                    assistantText += delta.content;
                    send("token", { text: delta.content });
                  }
                  if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                      const idx = tc.index ?? 0;
                      if (!toolCalls[idx]) toolCalls[idx] = { id: tc.id || "", name: "", args: "" };
                      if (tc.id) toolCalls[idx].id = tc.id;
                      if (tc.function?.name) toolCalls[idx].name += tc.function.name;
                      if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
                    }
                  }
                  if (choice.finish_reason) finishReason = choice.finish_reason;
                } catch { /* partial */ }
              }
            }

            const calls = Object.values(toolCalls);
            if (finishReason === "tool_calls" && calls.length > 0) {
              // Add assistant message with tool calls to history
              convo.push({
                role: "assistant",
                content: assistantText || null,
                tool_calls: calls.map((c) => ({
                  id: c.id, type: "function",
                  function: { name: c.name, arguments: c.args || "{}" },
                })),
              });
              // Run each tool
              for (const c of calls) {
                send("tool_start", { name: c.name });
                let parsedArgs: any = {};
                try { parsedArgs = JSON.parse(c.args || "{}"); } catch {}
                const result = await execTool(c.name, parsedArgs, sb, authHeader);
                send("tool_done", { name: c.name });
                convo.push({
                  role: "tool",
                  tool_call_id: c.id,
                  content: JSON.stringify(result).slice(0, 12000),
                });
              }
              // continue loop
              continue;
            }

            // Done — finalize
            send("done", { text: assistantText });
            // Persist conversation (excluding system)
            const finalMessages = [...messages, { role: "assistant", content: assistantText }];
            await sb.from("eva_conversations").upsert(
              { user_id: user.id, messages: finalMessages, updated_at: new Date().toISOString() },
              { onConflict: "user_id" }
            );
            break;
          }
        } catch (e) {
          const enc = new TextEncoder();
          controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ message: e instanceof Error ? e.message : String(e) })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
