// Groepeert geüploade creatives per basisnaam, met aspect-ratio suffix gestript.
// Suffixen die aan het eind van de bestandsnaam (vóór extensie) herkend worden
// — met optionele separator (_, -, ., spatie):
//   1x1 / 1.1 / 1-1    → 1:1
//   4x5 / 4.5 / 4-5    → 4:5   (5x4 ook → 4:5)
//   9x16 / 9.16 / 9-16 → 9:16
//   16x9 / 16.9 / 16-9 → 16:9

export const KNOWN_RATIOS = ['1:1', '4:5', '9:16', '16:9'] as const;
export type AspectRatio = (typeof KNOWN_RATIOS)[number];

const TOKEN_TO_RATIO: Record<string, AspectRatio> = {
  '1x1': '1:1', '1:1': '1:1', '1.1': '1:1',
  '4x5': '4:5', '4:5': '4:5', '4.5': '4:5', '5x4': '4:5',
  '9x16': '9:16', '9:16': '9:16', '9.16': '9:16',
  '16x9': '16:9', '16:9': '16:9', '16.9': '16:9',
};

// Alternation van alle tokens, langste eerst zodat "16x9" niet half als "1x1" matcht.
const RATIO_ALTERNATION = Object.keys(TOKEN_TO_RATIO)
  .sort((a, b) => b.length - a.length)
  .map((t) => t.replace(/[.:\-]/g, (c) => `\\${c}`))
  .join('|');

// Ratio-token omsloten door separator (spatie, _, -, .) of begin/eind.
// Werkt voor suffix, prefix én ratio in het midden van de naam:
//   "name_1x1.jpg"
//   "Rivas - AD-X - 4x5 - 2026Q2.jpg"
//   "1x1 - name.jpg"
const RATIO_ANYWHERE_RE = new RegExp(
  `(^|[\\s._\\-])(${RATIO_ALTERNATION})(?=$|[\\s._\\-])`,
  'i',
);

export interface ParsedName {
  baseName: string;
  ratio: AspectRatio | null;
  extension: string;
}

export function parseCreativeName(fileName: string): ParsedName {
  const dot = fileName.lastIndexOf('.');
  const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const stem = dot >= 0 ? fileName.slice(0, dot) : fileName;

  const m = stem.match(RATIO_ANYWHERE_RE);
  if (!m) return { baseName: stem.trim(), ratio: null, extension };

  const ratio = TOKEN_TO_RATIO[m[2].toLowerCase()] ?? null;
  if (!ratio) return { baseName: stem.trim(), ratio: null, extension };

  const start = m.index ?? 0;
  const end = start + m[0].length;
  const before = stem.slice(0, start);
  const after = stem.slice(end);
  // Vervang het match-fragment door een spatie en normaliseer dubbele separators
  // zoals "name -  - q2" → "name - q2".
  let baseName = (before + ' ' + after)
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[\s._\-]+|[\s._\-]+$/g, '')
    .trim();
  if (!baseName) baseName = stem.trim();
  return { baseName, ratio, extension };
}

export interface PlacementSpec {
  publisher_platforms: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  messenger_positions?: string[];
  audience_network_positions?: string[];
}

// Meta-aanbevolen placement-mapping per ratio. Ontbrekende ratio's worden door
// Meta zelf gecropt via Advantage+ placement.
export const RATIO_TO_PLACEMENTS: Record<AspectRatio, PlacementSpec> = {
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

// Bundle-key wordt gebruikt om varianten te groeperen.
export function bundleKey(baseName: string): string {
  return baseName.toLowerCase().replace(/\s+/g, ' ').trim();
}
