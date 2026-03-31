import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { report_id } = await req.json();
    if (!report_id) {
      return new Response(JSON.stringify({ error: "report_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Load the report
    const { data: report, error: reportErr } = await sb
      .from("agent_reports")
      .select("*, clients(name, care_type, website_url)")
      .eq("id", report_id)
      .single();

    if (reportErr || !report) {
      return new Response(JSON.stringify({ error: "Report not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientName = (report as any).clients?.name || "Client";
    const careType = (report as any).clients?.care_type || "";
    const agentLabel = report.agent_type === "analyst" ? "Ads Performance Analyst"
      : report.agent_type === "trend_scout" ? "Trend Scout"
      : "Creative Copywriter";

    const reportDate = new Date(report.created_at).toLocaleDateString("nl-NL", {
      day: "numeric", month: "long", year: "numeric",
    });

    const analysis = report.content?.analysis || report.content?.summary || "";
    const campaigns = report.content?.campaigns || [];
    const searchTerms = report.content?.search_terms || [];
    const adsFound = report.content?.ads_found || 0;

    // Convert markdown analysis to structured HTML
    const analysisHtml = markdownToHtml(analysis);

    // Build campaign data table if analyst report
    let campaignTableHtml = "";
    if (campaigns.length > 0) {
      campaignTableHtml = `
        <div class="section">
          <h2>Campagne Data Overzicht</h2>
          <table>
            <thead>
              <tr>
                <th>Campagne</th>
                <th>Spend</th>
                <th>Impressies</th>
                <th>Clicks</th>
                <th>CTR</th>
                <th>Leads</th>
                <th>CPL</th>
              </tr>
            </thead>
            <tbody>
              ${campaigns.map((c: any) => `
                <tr>
                  <td>${escHtml(c.campaign_name || "")}</td>
                  <td>€${(c.spend || 0).toFixed(2)}</td>
                  <td>${(c.impressions || 0).toLocaleString("nl-NL")}</td>
                  <td>${c.clicks || 0}</td>
                  <td>${(c.ctr || 0).toFixed(2)}%</td>
                  <td>${c.leads || 0}</td>
                  <td>€${(c.cpl || 0).toFixed(2)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>`;
    }

    // Build metadata section for trend scout
    let metadataHtml = "";
    if (report.agent_type === "trend_scout") {
      metadataHtml = `
        <div class="metadata-box">
          <div class="metadata-item"><strong>Zoektermen:</strong> ${searchTerms.map((t: string) => `<span class="tag">${escHtml(t)}</span>`).join(" ")}</div>
          <div class="metadata-item"><strong>Advertenties geanalyseerd:</strong> ${adsFound}</div>
          <div class="metadata-item"><strong>Bron:</strong> Meta Ads Library (Facebook/Instagram)</div>
        </div>`;
    }

    // Sources section
    const sourcesHtml = `
      <div class="section sources">
        <h2>Bronnen & Methodologie</h2>
        <ul>
          ${report.agent_type === "analyst" ? `
            <li><strong>Meta Ads Manager API</strong> — Campagne performance data (spend, impressions, clicks, leads, CPL) over de afgelopen 30 dagen.</li>
            <li><strong>Client Learning Profile</strong> — Tone of voice, employer branding positionering, en historische campagne-inzichten.</li>
            <li><strong>Eerdere campagne-learnings</strong> — Succesvolle en mislukte concepten uit het verleden ter context.</li>
          ` : report.agent_type === "trend_scout" ? `
            <li><strong>Meta Ads Library API</strong> — Publiek doorzoekbare advertentiedatabase van Facebook en Instagram.</li>
            <li><strong>Zoekscope:</strong> Nederlandse zorgsector, recruitment en employer branding advertenties.</li>
            <li><strong>Concurrenten geanalyseerd:</strong> Buurtzorg, Cordaan, Careyn, Curium, ASZ, en sectorgenoten.</li>
            <li><strong>Analyse methode:</strong> AI-gestuurde patroonherkenning op hooks, copy, CTA's en visuele stijlen.</li>
          ` : `
            <li><strong>Creative upload analyse</strong> — Visuele interpretatie van het geüploade advertentiemateriaal.</li>
            <li><strong>Client Brand Profile</strong> — Tone of voice, USP's, en communicatie richtlijnen.</li>
            <li><strong>Trend Scout inzichten</strong> — Actuele patronen uit de Facebook Ads Library als context.</li>
          `}
        </ul>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: #1a1a2e;
    font-size: 10pt;
    line-height: 1.6;
    background: #fff;
  }
  .page { padding: 48px 56px; min-height: 100vh; position: relative; }
  
  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 32px;
    padding-bottom: 20px;
    border-bottom: 3px solid #5B2D8E;
  }
  .header-left h1 {
    font-size: 22pt;
    font-weight: 700;
    color: #5B2D8E;
    margin-bottom: 4px;
    letter-spacing: -0.5px;
  }
  .header-left .subtitle {
    font-size: 11pt;
    color: #666;
    font-weight: 400;
  }
  .header-right {
    text-align: right;
    font-size: 9pt;
    color: #888;
  }
  .header-right .client-name {
    font-size: 12pt;
    font-weight: 600;
    color: #1a1a2e;
  }
  .agent-badge {
    display: inline-block;
    background: #5B2D8E;
    color: #fff;
    padding: 3px 12px;
    border-radius: 4px;
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-top: 6px;
  }

  /* Metadata */
  .metadata-box {
    background: #f8f6fb;
    border: 1px solid #e8e0f0;
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 24px;
  }
  .metadata-item { margin-bottom: 6px; font-size: 9pt; }
  .metadata-item:last-child { margin-bottom: 0; }
  .tag {
    display: inline-block;
    background: #5B2D8E;
    color: #fff;
    padding: 1px 8px;
    border-radius: 3px;
    font-size: 8pt;
    margin-right: 4px;
  }

  /* Content */
  .section { margin-bottom: 24px; }
  .section h2 {
    font-size: 13pt;
    font-weight: 700;
    color: #5B2D8E;
    margin-bottom: 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e8e0f0;
  }
  .section h3 {
    font-size: 11pt;
    font-weight: 600;
    color: #2d2d4e;
    margin-top: 14px;
    margin-bottom: 6px;
  }
  .section p { margin-bottom: 8px; }
  .section ul, .section ol {
    margin-left: 18px;
    margin-bottom: 10px;
  }
  .section li { margin-bottom: 4px; }
  .section strong { color: #5B2D8E; }
  .section em { color: #555; }
  .section blockquote {
    border-left: 3px solid #D4A843;
    padding: 8px 14px;
    margin: 10px 0;
    background: #fdfbf3;
    font-style: italic;
    color: #555;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    margin-top: 8px;
  }
  th {
    background: #5B2D8E;
    color: #fff;
    padding: 8px 10px;
    text-align: left;
    font-weight: 600;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  td {
    padding: 7px 10px;
    border-bottom: 1px solid #eee;
  }
  tr:nth-child(even) td { background: #faf9fc; }

  /* Sources */
  .sources { margin-top: 32px; }
  .sources ul { list-style: none; margin-left: 0; }
  .sources li {
    padding: 6px 0;
    border-bottom: 1px solid #f0f0f0;
    font-size: 9pt;
    color: #555;
  }
  .sources li:last-child { border-bottom: none; }

  /* Footer */
  .footer {
    position: absolute;
    bottom: 32px;
    left: 56px;
    right: 56px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 12px;
    border-top: 1px solid #e8e0f0;
    font-size: 8pt;
    color: #aaa;
  }
  .footer-logo {
    font-weight: 700;
    color: #5B2D8E;
    font-size: 9pt;
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>${escHtml(report.title || agentLabel + " Rapport")}</h1>
      <div class="subtitle">${escHtml(clientName)}${careType ? ` — ${escHtml(careType)}` : ""}</div>
    </div>
    <div class="header-right">
      <div class="client-name">${escHtml(clientName)}</div>
      <div>${reportDate}</div>
      <div class="agent-badge">${escHtml(agentLabel)}</div>
    </div>
  </div>

  ${metadataHtml}
  ${campaignTableHtml}

  <div class="section">
    <h2>Analyse</h2>
    ${analysisHtml}
  </div>

  ${sourcesHtml}

  <div class="footer">
    <div class="footer-logo">LOVABLE CLOUD</div>
    <div>Gegenereerd op ${reportDate} • ${escHtml(report.report_source === "weekly" ? "Wekelijks rapport" : "Handmatig rapport")}</div>
  </div>
</div>
</body>
</html>`;

    // Return HTML for client-side PDF rendering
    return new Response(JSON.stringify({
      success: true,
      html,
      report_title: report.title || `${agentLabel} Rapport`,
      client_name: clientName,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-report-pdf error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function markdownToHtml(md: string): string {
  if (!md) return "<p>Geen analyse beschikbaar.</p>";

  let html = md
    // Headers
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Blockquotes
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    // Lists
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, (match) => `<ul>${match}</ul>`);

  // Paragraphs
  html = html.split("\n\n").map(block => {
    block = block.trim();
    if (!block) return "";
    if (block.startsWith("<h") || block.startsWith("<ul") || block.startsWith("<ol") || block.startsWith("<blockquote") || block.startsWith("<table")) return block;
    return `<p>${block}</p>`;
  }).join("\n");

  return html;
}
