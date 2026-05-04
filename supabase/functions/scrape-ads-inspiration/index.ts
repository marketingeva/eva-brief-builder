import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_GRAPH_ADS_ARCHIVE = "https://graph.facebook.com/v20.0/ads_archive";
const ADS_LIBRARY_BASE = "https://www.facebook.com/ads/library/";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const FIXED_QUERY = "Verzorgende IG";
const FIXED_COUNTRY = "NL";
const FIXED_MEDIA_TYPE = "all";
const FIXED_AD_TYPE = "EMPLOYMENT_ADS";
const FIXED_SOURCE_TYPE = "meta_ad_library";
const FIXED_SORT_MODE = "total_impressions_desc";

interface ParsedItem {
  advertiser_name?: string;
  advertiser_page_url?: string;
  advertiser_logo_url?: string;
  ad_library_url?: string;
  image_url?: string;
  media_preview_url?: string;
  media_urls?: string[];
  video_url?: string;
  snapshot_url?: string;
  primary_text?: string;
  description?: string;
  headline?: string;
  cta?: string;
  external_id?: string;
  started_running?: string;
  publisher_platforms?: string[];
  media_type?: string;
  hook_text?: string;
  hook_category?: string;
  is_hook_candidate?: boolean;
  raw_payload?: Record<string, unknown>;
}

function normalizeText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\\u0040/g, "@")
    .replace(/\\\//g, "/");
}

function stripTags(s: string): string {
  return decodeHtml(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr.filter(Boolean as unknown as (value: T) => boolean))];
}

function decodeScrapedUrl(value: string): string {
  return decodeHtml(value)
    .replace(/\\\//g, "/")
    .replace(/\\u0025/g, "%")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003d/g, "=")
    .replace(/\\u003f/g, "?")
    .replace(/\\u002f/g, "/");
}

function getUrlDimensions(url: string): { width: number; height: number } | null {
  const match = url.match(/(?:_|-)(?:s|p)(\d{2,4})x(\d{2,4})(?:_|\.|&|$)/i) || url.match(/[?&]stp=[^&]*(?:s|p)(\d{2,4})x(\d{2,4})/i);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function mediaCandidateScore(url: string): number {
  const lower = url.toLowerCase();
  if (!/^https?:\/\//i.test(url)) return -1;
  if (!/\.(?:jpe?g|png|webp)(?:[?&]|$)/i.test(lower) && !/fbcdn|scontent/i.test(lower)) return -1;
  if (/emoji|favicon|rsrc\.php|static\.xx\.fbcdn|safe_image/i.test(lower)) return -1;

  const dimensions = getUrlDimensions(url);
  if (dimensions) {
    const longest = Math.max(dimensions.width, dimensions.height);
    const shortest = Math.min(dimensions.width, dimensions.height);
    if (longest <= 120 || shortest <= 80) return -1;
    return longest + shortest + (/t39\.35426|t45\.|scontent/i.test(lower) ? 250 : 0);
  }

  return (/t39\.35426|t45\.|scontent/i.test(lower) ? 240 : 80) - (/profile|avatar|logo/i.test(lower) ? 160 : 0);
}

function pickAdMediaUrl(candidates: string[]): string | undefined {
  return unique(candidates.map(decodeScrapedUrl))
    .map((url) => ({ url, score: mediaCandidateScore(url) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.url;
}

function pickLogoUrl(candidates: string[]): string | undefined {
  return unique(candidates.map(decodeScrapedUrl)).find((url) => {
    const dimensions = getUrlDimensions(url);
    return !!dimensions && Math.max(dimensions.width, dimensions.height) <= 120 && /fbcdn|scontent/i.test(url);
  });
}

function extractImageCandidates(chunk: string): string[] {
  const candidates: string[] = [];
  const imageTags = Array.from(chunk.matchAll(/<img\b[^>]*>/gi)).map((m) => m[0]);
  for (const tag of imageTags) {
    const src = tag.match(/\s(?:src|data-src)=['"]([^'"]+)['"]/i)?.[1];
    if (src) candidates.push(src);

    const srcset = tag.match(/\ssrcset=['"]([^'"]+)['"]/i)?.[1];
    if (srcset) {
      srcset.split(",").forEach((entry) => {
        const url = entry.trim().split(/\s+/)[0];
        if (url) candidates.push(url);
      });
    }
  }

  Array.from(chunk.matchAll(/background-image:\s*url\((['"]?)(.*?)\1\)/gi)).forEach((m) => candidates.push(m[2]));
  Array.from(chunk.matchAll(/https?:\\?\/\\?\/[^'"<>\s]+?\.(?:jpe?g|png|webp)[^'"<>\s]*/gi)).forEach((m) => candidates.push(m[0]));

  return candidates;
}

function extractVideoCandidates(chunk: string): string[] {
  const candidates: string[] = [];
  Array.from(chunk.matchAll(/<video\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)).forEach((m) => candidates.push(m[1]));
  Array.from(chunk.matchAll(/(?:playable_url|browser_native_hd_url|browser_native_sd_url|video_url|og:video(?::secure_url)?)\S{0,80}?["'](https?:\\?\/\\?\/[^"'<>\s]+)["']/gi)).forEach((m) => candidates.push(m[1]));
  Array.from(chunk.matchAll(/https?:\\?\/\\?\/[^"'<>\s]+?\.mp4[^"'<>\s]*/gi)).forEach((m) => candidates.push(m[0]));

  return unique(candidates.map(decodeScrapedUrl).map(decodeHtml)).filter((url) => /^https?:\/\//i.test(url));
}

function extractVisibleTextLines(chunk: string): string[] {
  const text = chunk
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(?:div|p|span|h[1-6]|li|a|button)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/\s(?:aria-label|alt|title)=["']([^"']{2,240})["']/gi, "\n$1\n");

  return unique(decodeHtml(text.replace(/<[^>]+>/g, "\n"))
    .split(/\n+/)
    .map((line) => normalizeText(line.replace(/[\u200B-\u200D\uFEFF]/g, " ")))
    .filter((line) => line.length >= 2 && line.length <= 1800)
    .filter((line) => !/^https?:\/\//i.test(line))
    .filter((line) => !/^\d+$/.test(line))
    .filter((line) => !isBoilerplateText(line)));
}

function splitCompositeAdText(text: string, advertiserName?: string): { primaryText?: string; headline?: string; cta?: string } {
  let value = normalizeText(text.replace(/[\u200B-\u200D\uFEFF]/g, " "));
  if (!value) return {};

  const headlineFromLink = value.match(/(?:FB\.ME|L\.FACEBOOK\.COM|HTTPS?:\/\/\S+)\s+(.{8,120}?)\s+(?:Learn More|Meer informatie|Apply Now|Solliciteren|Sign Up)(?:\s|$)/i)?.[1];
  const cta = value.match(/\b(Learn More|Meer informatie|Apply Now|Solliciteren|Sign Up|Aanmelden)\b/i)?.[1];

  value = value
    .replace(/^(?:Bibliotheek-ID|Library ID|Ad Library ID)[:\s]*\d+\s*/i, "")
    .replace(/^(?:Uitgevoerd vanaf|Gestart op|Started running on)\s+.*?(?=(?:Sponsored|Gesponsord|[A-ZÀ-Ý][A-Za-zÀ-ÿ0-9&'. -]{2,80}\s+(?:Sponsored|Gesponsord)))/i, "")
    .replace(/^.*?(?:Advertentiegegevens bekijken|See ad details)\s*/i, "");

  if (advertiserName) {
    value = value.replace(new RegExp(`^.*?${advertiserName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(?:Sponsored|Gesponsord)?\\s*`, "i"), "");
  }

  value = value
    .replace(/^(?:Sponsored|Gesponsord)\s*/i, "")
    .replace(/^.*?(?:Sponsored|Gesponsord)\s*/i, "")
    .replace(/\s+(?:FB\.ME|L\.FACEBOOK\.COM|HTTPS?:\/\/\S+)\s+.{8,160}?\s+(?:Learn More|Meer informatie|Apply Now|Solliciteren|Sign Up|Aanmelden)(?=\s|$)[\s\S]*$/i, "")
    .replace(/\s+(?:Actief|Active)\s*$/i, "")
    .trim();

  return {
    primaryText: value && !isBoilerplateText(value) ? value : undefined,
    headline: headlineFromLink ? normalizeText(headlineFromLink) : undefined,
    cta: cta ? normalizeText(cta) : undefined,
  };
}

// Short imperative CTAs like "Solliciteer nu!", "Solliciteer direct!", "Bekijk vacature"
// They look like headlines but are really the link description / CTA caption.
function isShortCtaCaption(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length > 60) return false;
  return /^(?:solliciteer(?:\s+(?:nu|direct|hier|vandaag))?|bekijk\s+(?:vacature|hier|nu)|meer\s+informatie|lees\s+meer|aanmelden|sign\s+up|apply\s+now|learn\s+more|ontdek\s+(?:nu|hier|meer)|reageer\s+(?:nu|direct))[!.\s]*$/i.test(normalized);
}

function isLikelyHeadline(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length > 120 || isBoilerplateText(normalized)) return false;
  if (isShortCtaCaption(normalized)) return false;
  // Real headlines are link titles: brand/role-based, not a single imperative verb
  if (/\b(verzorgende\s*ig|helpende|verpleegkundige|vacature|werken bij|welkom bij|ontdek)\b/i.test(normalized) && normalized.length >= 12) return true;
  if (/^[A-ZÀ-Ý0-9].{10,90}[.!?]?$/.test(normalized) && !/[?]/.test(normalized)) return true;
  return false;
}

function pickHeadlineText(texts: string[], primaryText?: string, advertiserName?: string): string | undefined {
  const advNorm = advertiserName ? normalizeText(advertiserName).toLowerCase() : "";
  return unique(texts.map((text) => normalizeText(decodeHtml(text))))
    .filter((text) => text !== primaryText)
    .filter((text) => !advNorm || text.toLowerCase() !== advNorm)
    .filter((text) => isLikelyHeadline(text))
    .sort((a, b) => {
      const score = (text: string) =>
        (/\b(werken bij|welkom bij|ontdek|vacature)\b/i.test(text) ? 120 : 0)
        + (/:/.test(text) ? 60 : 0)
        + Math.min(80, text.length); // prefer longer, more descriptive titles
      return score(b) - score(a);
    })[0];
}

function pickCtaCaption(texts: string[], primaryText?: string, headline?: string): string | undefined {
  return unique(texts.map((text) => normalizeText(decodeHtml(text))))
    .filter((text) => text !== primaryText && text !== headline)
    .find((text) => isShortCtaCaption(text));
}

function pickDescriptionText(texts: string[], primaryText?: string, headline?: string, cta?: string): string | undefined {
  return unique(texts.map((text) => normalizeText(decodeHtml(text))))
    .filter((text) => text !== primaryText && text !== headline && text !== cta)
    .filter((text) => text.length >= 18 && text.length <= 220)
    .filter((text) => !isBoilerplateText(text) && !isLikelyHeadline(text) && !isShortCtaCaption(text))
    // Description must NOT be a fragment of the primary text (often happens when body bullets get split)
    .filter((text) => !primaryText || !primaryText.toLowerCase().includes(text.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0];
}

function inferAdvertiserName(texts: string[]): string | undefined {
  const joined = unique(texts.map((text) => normalizeText(text))).join(" | ");
  const patterns = [
    /(?:werken bij|welkom bij|bij)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9&'. -]{2,45})(?:[!?.|]|\s{2,}|$)/i,
    /([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9&'. -]{2,45})\s+(?:zoekt|vacature|thuiszorgvacatures)/i,
  ];

  for (const pattern of patterns) {
    const match = joined.match(pattern)?.[1];
    if (!match) continue;
    const name = normalizeText(match.replace(/\b(?:Gouda|Elst|Nijmegen Oost|Nederland)\b/gi, "").replace(/[|:,-]+$/g, ""));
    if (!isBoilerplateAdvertiserName(name)) return name;
  }

  return undefined;
}

function isBoilerplateText(text: string): boolean {
  return /^(Sponsored|Gesponsord|Active|Actief|Library ID|Bibliotheek|Platforms?|Platformen|Categories|Categorieën|EU transparency|Transparantie voor de EU|See ad details|See summary details|Advertentiegegevens bekijken|Niet beschikbaar|Onbekend|Meer informatie|Bekijk samenvattingsgegevens|Open Link|Like|Comment|Share|Vind ik leuk|Reageren|Delen)$/i.test(text)
    || /(?:Deze advertentie heeft meerdere versies|Er is een fout opgetreden bij het afspelen van deze video|This ad has multiple versions|There was an error playing this video)/i.test(text)
    || /^(Started running on|Gestart op|Uitgevoerd vanaf)/i.test(text)
    || /^(?:Library ID|Bibliotheek-?ID|Ad Library ID)[:\s]/i.test(text)
    || /^(?:gebruikt?\s+dit\s+advertentiemateriaal|use this asset|placeholder|test\s*tekst|test\s*ad|asset\s+feed)/i.test(text);
}

function isBoilerplateAdvertiserName(name: string | undefined | null): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 120) return true;
  return /^(Onbekend|Unknown|Meer informatie|Learn More|Sponsored|Gesponsord|Sign Up|Aanmelden|Apply Now|Solliciteer|Bekijk meer|See more|Open Link|Niet beschikbaar)$/i.test(trimmed);
}

function adTextScore(text: string): number {
  if (text.length < 24 || isBoilerplateText(text)) return -1;
  if (isLikelyHeadline(text) && text.length < 90) return -1;
  let score = Math.min(text.length, 900);
  if (/(verzorgende\s*ig|helpende|verpleegkundige|zorg|thuiszorg|ouderenzorg|bewoner|cliënt|vacature|solliciteer|werken bij|kom werken|ben jij|word jij|jouw|jij)/i.test(text)) score += 450;
  if (/\b(ben jij|word jij|jouw|jij|wil jij|zoek je|kom werken|maak jij|zorg jij)\b/i.test(text)) score += 220;
  if (/\b(ontdek|welkom bij|werken bij)\b/i.test(text) && text.length < 120) score -= 320;
  if (/[!?]/.test(text)) score += 60;
  if (/https?:\/\//i.test(text)) score -= 150;
  return score;
}

function pickPrimaryText(texts: string[]): string | undefined {
  return unique(texts.map((text) => normalizeText(decodeHtml(text))))
    .map((text) => ({ text, score: adTextScore(text) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.text;
}

function hasBadCachedScrape(items: Array<Record<string, unknown>>): boolean {
  if (items.length === 0) return false;

  const badCount = items.filter((item) => {
    const text = typeof item.primary_text === "string" ? item.primary_text : "";
    const headline = typeof item.headline === "string" ? item.headline : "";
    const description = typeof item.description === "string" ? item.description : "";
    const advertiser = typeof item.advertiser_name === "string" ? item.advertiser_name : "";
    const media = typeof item.media_preview_url === "string"
      ? item.media_preview_url
      : typeof item.image_url === "string"
        ? item.image_url
        : "";

    return (!!media && mediaCandidateScore(media) <= 0)
      || (!!text && isBoilerplateText(text))
      || /(?:Bibliotheek-ID|Library ID|Advertentiegegevens bekijken|See ad details|Vervolgkeuzemenu openen)/i.test(text)
      || isBoilerplateAdvertiserName(advertiser)
      || (!!headline && isShortCtaCaption(headline))
      || (!!description && isBoilerplateText(description));
  }).length;

  return badCount > Math.max(2, items.length * 0.3);
}

function buildAdsLibraryUrl(): string {
  const params = new URLSearchParams();
  params.set("active_status", "active");
  params.set("ad_type", "employment_ads");
  params.set("country", FIXED_COUNTRY);
  params.set("is_targeted_country", "false");
  params.set("media_type", FIXED_MEDIA_TYPE);
  params.set("q", FIXED_QUERY);
  params.set("search_type", "keyword_unordered");
  params.set("sort_data[direction]", "desc");
  params.set("sort_data[mode]", "total_impressions");
  return `${ADS_LIBRARY_BASE}?${params.toString()}`;
}

function buildMetaArchiveUrl(accessToken: string): string {
  const params = new URLSearchParams({
    access_token: accessToken,
    search_terms: FIXED_QUERY,
    ad_reached_countries: JSON.stringify([FIXED_COUNTRY]),
    ad_type: FIXED_AD_TYPE,
    media_type: "ALL",
    ad_active_status: "ACTIVE",
    search_type: "KEYWORD_UNORDERED",
    limit: "60",
    fields: [
      "id",
      "page_id",
      "page_name",
      "ad_snapshot_url",
      "ad_delivery_start_time",
      "ad_creative_bodies",
      "ad_creative_link_titles",
      "ad_creative_link_descriptions",
      "ad_creative_link_captions",
      "publisher_platforms",
    ].join(","),
  });
  return `${META_GRAPH_ADS_ARCHIVE}?${params.toString()}`;
}

function getHookCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/(collega|team|samen|hecht team|gezellig)/i.test(lower)) return "Collega's & team";
  if (/(waardering|gezien|gewaardeerd|erkenning)/i.test(lower)) return "Waardering";
  if (/(flexibel|eigen rooster|uren|parttime|fulltime|dienstrooster|werk\-privé|werk privé)/i.test(lower)) return "Flexibiliteit";
  if (/(groei|ontwikkeling|opleiding|leren|doorgroeien|carrière)/i.test(lower)) return "Ontwikkeling";
  if (/(betekenis|verschil|impact|zorg hart|iets betekenen|van waarde)/i.test(lower)) return "Betekenisvol werk";
  if (/(salaris|bonus|toeslag|verdien|vakantie|contract)/i.test(lower)) return "Voorwaarden";
  return "Algemene hook";
}

function extractHookText(text: string): string | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 18);

  const preferred = sentences.find((part) =>
    /\?|!|kom werken|word jij|ben jij|jouw|jij|werken bij|solliciteer|vacature|verzorgende ig/i.test(part)
  );

  const hook = preferred || sentences[0] || normalized.slice(0, 160);
  return hook.length > 170 ? `${hook.slice(0, 167).trim()}…` : hook;
}

async function enrichSnapshot(snapshotUrl: string): Promise<Partial<ParsedItem>> {
  try {
    const resp = await fetch(snapshotUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; LovableBot/1.0)",
        "accept-language": "nl-NL,nl;q=0.9,en;q=0.8",
      },
    });

    if (!resp.ok) {
      console.error(`Snapshot fetch failed [${resp.status}] for ${snapshotUrl}`);
      return {};
    }

    const html = await resp.text();
    const ogImage = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const ogVideo = html.match(/property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const posterImage = html.match(/property=["']og:image:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
    const videoTag = html.match(/<video[^>]+src=["']([^"']+)["']/i)?.[1];
    const imgCandidates = extractImageCandidates(html);

    // Collect all valid creative media URLs (deduped + scored)
    const allMediaUrls = unique([ogImage || "", posterImage || "", ...imgCandidates].filter(Boolean).map(decodeScrapedUrl))
      .map((url) => ({ url, score: mediaCandidateScore(url) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((c) => c.url);

    const bestImage = allMediaUrls[0];
    const videoUrl = decodeHtml(ogVideo || videoTag || "") || undefined;
    const mediaUrls = videoUrl ? unique([videoUrl, ...allMediaUrls]) : allMediaUrls;
    const mediaType = videoUrl ? "video" : (allMediaUrls.length > 1 ? "carousel" : "image");

    return {
      image_url: bestImage,
      media_preview_url: bestImage,
      media_urls: mediaUrls,
      media_type: mediaType,
      video_url: videoUrl,
      snapshot_url: snapshotUrl,
    };
  } catch (error) {
    console.error("Snapshot enrichment failed:", error);
    return {};
  }
}

async function fetchMetaArchiveItems(accessToken: string): Promise<ParsedItem[]> {
  const resp = await fetch(buildMetaArchiveUrl(accessToken));
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || `Meta archive ${resp.status}`);

  const rows = Array.isArray(data?.data) ? data.data : [];
  const baseItems = rows.map((ad: any): ParsedItem => {
    const body = Array.isArray(ad.ad_creative_bodies) ? ad.ad_creative_bodies.find(Boolean) : undefined;
    const title = Array.isArray(ad.ad_creative_link_titles) ? ad.ad_creative_link_titles.find(Boolean) : undefined;
    const description = Array.isArray(ad.ad_creative_link_descriptions) ? ad.ad_creative_link_descriptions.find(Boolean) : undefined;
    const caption = Array.isArray(ad.ad_creative_link_captions) ? ad.ad_creative_link_captions.find(Boolean) : undefined;
    const snapshotUrl = ad.ad_snapshot_url || (ad.id ? `https://www.facebook.com/ads/library/?id=${ad.id}` : undefined);

    const advertiserName = isBoilerplateAdvertiserName(ad.page_name) ? undefined : normalizeText(ad.page_name);

    return {
      external_id: ad.id,
      advertiser_name: advertiserName,
      advertiser_page_url: ad.page_id ? `https://www.facebook.com/${ad.page_id}` : undefined,
      ad_library_url: snapshotUrl,
      snapshot_url: snapshotUrl,
      primary_text: normalizeText(body) || undefined,
      headline: normalizeText(title) || undefined,
      description: normalizeText(description) || undefined,
      cta: normalizeText(caption) || undefined,
      started_running: ad.ad_delivery_start_time,
      publisher_platforms: Array.isArray(ad.publisher_platforms) ? ad.publisher_platforms : [],
      raw_payload: ad,
    };
  }).filter((item) => item.external_id && (item.primary_text || item.headline || item.advertiser_name));

  const enrichedItems = await Promise.all(baseItems.map(async (item, index) => {
    const snapshotData = item.snapshot_url && index < 24 ? await enrichSnapshot(item.snapshot_url) : {};
    const primaryText = item.primary_text;
    const hookText = extractHookText(primaryText || item.headline || "");
    return {
      ...item,
      image_url: snapshotData.image_url || item.image_url,
      media_preview_url: snapshotData.media_preview_url || snapshotData.image_url || item.image_url,
      media_urls: snapshotData.media_urls && snapshotData.media_urls.length > 0 ? snapshotData.media_urls : item.media_urls,
      media_type: snapshotData.media_type || item.media_type,
      video_url: snapshotData.video_url || item.video_url,
      hook_text: hookText || undefined,
      hook_category: hookText ? getHookCategory(hookText) : undefined,
      is_hook_candidate: !!hookText,
    } satisfies ParsedItem;
  }));

  const deduped = new Map<string, ParsedItem>();
  for (const item of enrichedItems) {
    if (!item.external_id) continue;
    const existing = deduped.get(item.external_id);
    if (!existing) {
      deduped.set(item.external_id, item);
      continue;
    }
    const score = (entry: ParsedItem) =>
      (entry.image_url ? 2 : 0) +
      (entry.video_url ? 2 : 0) +
      (entry.primary_text ? 1 : 0) +
      ((entry.publisher_platforms || []).length > 0 ? 1 : 0);
    if (score(item) > score(existing)) deduped.set(item.external_id, item);
  }

  return Array.from(deduped.values());
}

function parseAdsFromHtml(html: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const chunks = cleaned.split(/(?=(?:Library ID|Bibliotheek-?ID|Ad Library ID)[:\s]*\d)/i);

  for (const chunk of chunks) {
    const idMatch = chunk.match(/(?:Library ID|Bibliotheek-?ID|Ad Library ID)[:\s]*(\d{8,})/i);
    if (!idMatch) continue;
    const externalId = idMatch[1];

    const startedRunning = chunk.match(/(?:Started running on|Gestart op|Uitgevoerd vanaf)\s+([^<\n]+?)(?:<|\n|$)/i)?.[1]?.trim();

    const visibleLines = extractVisibleTextLines(chunk);

    // Try multiple advertiser candidates - prefer non-boilerplate page links/text near Sponsored
    const advertiserCandidates: Array<{ name: string; url?: string }> = [];
    const fbLinkMatches = Array.from(chunk.matchAll(/<a[^>]+href=["'](https?:\/\/(?:www\.)?facebook\.com\/(?!ads\/library|help\/|privacy\/|policies\/)[^"'?#]+)["'][^>]*>([\s\S]{2,400}?)<\/a>/gi));
    for (const m of fbLinkMatches) {
      const name = stripTags(m[2]);
      if (!isBoilerplateAdvertiserName(name)) {
        advertiserCandidates.push({ name, url: m[1] });
      }
    }
    // Fallback: <strong>/<h?> near "Sponsored"/"Gesponsord"
    const strongMatch = chunk.match(/<(?:strong|h[1-6]|span|div)[^>]*>([^<]{2,80})<\/(?:strong|h[1-6]|span|div)>\s*<[^>]*>\s*(?:Sponsored|Gesponsord)/i);
    if (strongMatch) {
      const name = stripTags(strongMatch[1]);
      if (!isBoilerplateAdvertiserName(name)) advertiserCandidates.push({ name });
    }
    const inferredAdvertiser = inferAdvertiserName(visibleLines);
    if (inferredAdvertiser) advertiserCandidates.push({ name: inferredAdvertiser });
    const advertiser = advertiserCandidates[0];
    const advertiserName = advertiser?.name;
    const advertiserUrl = advertiser?.url;

    const imgCandidates = extractImageCandidates(chunk);
    const allMedia = unique(imgCandidates.map(decodeScrapedUrl))
      .map((url) => ({ url, score: mediaCandidateScore(url) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((c) => c.url);
    const imageUrl = allMedia[0];
    const logoUrl = pickLogoUrl(imgCandidates);
    const decodedVideo = extractVideoCandidates(chunk)[0];
    const mediaUrls = decodedVideo ? unique([decodedVideo, ...allMedia]) : allMedia;
    const mediaType = decodedVideo ? "video" : (allMedia.length > 1 ? "carousel" : "image");

    const pickedPrimaryText = pickPrimaryText(visibleLines);
    const splitText = pickedPrimaryText ? splitCompositeAdText(pickedPrimaryText, advertiserName) : {};
    const primaryText = splitText.primaryText || pickedPrimaryText;
    const headline = splitText.headline || pickHeadlineText(visibleLines, primaryText);
    const cta = splitText.cta || pickCtaCaption(visibleLines, primaryText, headline);
    const description = pickDescriptionText(visibleLines, primaryText, headline, cta);
    const hookText = extractHookText(primaryText || "");

    items.push({
      external_id: externalId,
      advertiser_name: advertiserName,
      advertiser_page_url: advertiserUrl,
      advertiser_logo_url: logoUrl,
      ad_library_url: `https://www.facebook.com/ads/library/?id=${externalId}`,
      snapshot_url: `https://www.facebook.com/ads/library/?id=${externalId}`,
      image_url: imageUrl,
      media_preview_url: imageUrl,
      media_urls: mediaUrls,
      media_type: mediaType,
      video_url: decodedVideo,
      primary_text: primaryText,
      headline,
      description,
      cta,
      started_running: startedRunning,
      hook_text: hookText || undefined,
      hook_category: hookText ? getHookCategory(hookText) : undefined,
      is_hook_candidate: !!hookText,
      raw_payload: { source: "listing_scrape" },
    });
  }

  const map = new Map<string, ParsedItem>();
  for (const item of items) {
    if (!item.external_id) continue;
    if (!map.has(item.external_id)) map.set(item.external_id, item);
  }
  return Array.from(map.values());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const forceRefresh = !!body.forceRefresh;
    const wantedTab = body.tab === "hooks" ? "hooks" : "ad-library";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const metaToken = Deno.env.get("META_ACCESS_TOKEN");
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

    const sb = createClient(supabaseUrl, serviceKey);
    const sourceUrl = buildAdsLibraryUrl();

    if (!forceRefresh) {
      const since = new Date(Date.now() - CACHE_TTL_MS).toISOString();
      const { data: cached } = await sb
        .from("inspiration_searches")
        .select("id, query, ai_summary, result_count, created_at, source_url, ad_type, source_type, sort_mode")
        .eq("query", FIXED_QUERY)
        .eq("country", FIXED_COUNTRY)
        .eq("media_type", FIXED_MEDIA_TYPE)
        .eq("ad_type", FIXED_AD_TYPE)
        .eq("source_type", FIXED_SOURCE_TYPE)
        .eq("sort_mode", FIXED_SORT_MODE)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached) {
        const { data: items } = await sb
          .from("inspiration_items")
          .select("*")
          .eq("search_id", cached.id)
          .order("created_at", { ascending: true });

        const cachedItems = items || [];
        if (cachedItems.length > 0 && !hasBadCachedScrape(cachedItems)) {
          return new Response(JSON.stringify({ search: cached, items: cachedItems, cached: true, tab: wantedTab }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (cachedItems.length > 0) console.warn("Skipping stale inspiration cache with logo/media or boilerplate text artifacts");
      }
    }

    let parsed: ParsedItem[] = [];
    if (metaToken) {
      try {
        parsed = await fetchMetaArchiveItems(metaToken);
        console.log(`Fetched ${parsed.length} ads from Meta archive`);
      } catch (err) {
        console.warn("Meta archive fetch failed, falling back to Firecrawl:", (err as Error).message);
      }
    }

    if (parsed.length === 0 && firecrawlKey) {
      const fcResp = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: sourceUrl,
          formats: ["rawHtml"],
          onlyMainContent: false,
          waitFor: 8000,
          location: { country: FIXED_COUNTRY, languages: ["nl"] },
          actions: [
            { type: "wait", milliseconds: 5000 },
            { type: "scroll", direction: "down" },
            { type: "wait", milliseconds: 2500 },
            { type: "scroll", direction: "down" },
            { type: "wait", milliseconds: 2500 },
            { type: "scroll", direction: "down" },
            { type: "wait", milliseconds: 2500 },
          ],
        }),
      });

      const fcData = await fcResp.json();
      if (!fcResp.ok) {
        return new Response(JSON.stringify({ error: fcData.error || `Firecrawl ${fcResp.status}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rawHtml: string = fcData.data?.rawHtml || fcData.rawHtml || "";
      parsed = parseAdsFromHtml(rawHtml);

      // For ads where the listing scrape didn't yield any media (e.g. story/video formats),
      // try fetching the snapshot card to extract og:image / og:video.
      const enrichTargets = parsed
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.snapshot_url && (!item.image_url || (item.media_urls?.length || 0) === 0))
        .slice(0, 12);
      const enriched = await Promise.all(
        enrichTargets.map(({ item, index }) =>
          enrichSnapshot(item.snapshot_url!).then((data) => ({ index, data }))
        ),
      );
      for (const { index, data } of enriched) {
        const current = parsed[index];
        parsed[index] = {
          ...current,
          image_url: current.image_url || data.image_url,
          media_preview_url: current.media_preview_url || data.media_preview_url || data.image_url,
          media_urls: (current.media_urls && current.media_urls.length > 0)
            ? current.media_urls
            : (data.media_urls || []),
          media_type: current.media_type || data.media_type,
          video_url: current.video_url || data.video_url,
        };
      }
    }

    const { data: searchRow, error: searchErr } = await sb
      .from("inspiration_searches")
      .insert({
        query: FIXED_QUERY,
        country: FIXED_COUNTRY,
        media_type: FIXED_MEDIA_TYPE,
        ad_type: FIXED_AD_TYPE,
        source_type: FIXED_SOURCE_TYPE,
        sort_mode: FIXED_SORT_MODE,
        source_url: sourceUrl,
        source_filters: {
          active_status: "active",
          ad_type: "employment_ads",
          country: FIXED_COUNTRY,
          is_targeted_country: false,
          media_type: FIXED_MEDIA_TYPE,
          q: FIXED_QUERY,
          search_type: "keyword_unordered",
          sort_mode: "total_impressions",
          sort_direction: "desc",
        },
        result_count: parsed.length,
      })
      .select("id, query, ai_summary, result_count, created_at, source_url, ad_type, source_type, sort_mode")
      .single();

    if (searchErr) throw searchErr;

    let savedItems: Record<string, unknown>[] = [];
    if (parsed.length > 0) {
      const rows = parsed.map((item) => ({
        search_id: searchRow.id,
        advertiser_name: item.advertiser_name || null,
        advertiser_page_url: item.advertiser_page_url || null,
        advertiser_logo_url: item.advertiser_logo_url || null,
        ad_library_url: item.ad_library_url || null,
        image_url: item.image_url || null,
        media_preview_url: item.media_preview_url || item.image_url || null,
        video_url: item.video_url || null,
        snapshot_url: item.snapshot_url || item.ad_library_url || null,
        primary_text: item.primary_text || null,
        description: item.description || null,
        headline: item.headline || null,
        cta: item.cta || null,
        media_urls: item.media_urls && item.media_urls.length > 0 ? item.media_urls : (item.media_preview_url ? [item.media_preview_url] : []),
        media_type: item.media_type || (item.video_url ? "video" : "image"),
        external_id: item.external_id || null,
        started_running: item.started_running || null,
        publisher_platforms: unique(item.publisher_platforms || []),
        source_type: FIXED_SOURCE_TYPE,
        raw_payload: item.raw_payload || {},
        hook_text: item.hook_text || null,
        hook_category: item.hook_category || null,
        is_hook_candidate: !!item.is_hook_candidate,
      }));

      const { data: inserted, error: itemsErr } = await sb
        .from("inspiration_items")
        .insert(rows)
        .select("*");

      if (itemsErr) throw itemsErr;
      savedItems = inserted || [];
    }

    return new Response(JSON.stringify({ search: searchRow, items: savedItems, cached: false, tab: wantedTab }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("scrape-ads-inspiration error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});