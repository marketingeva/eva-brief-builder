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
  '1x1': '1:1',
  '4x5': '4:5',
  '5x4': '4:5',
  '9x16': '9:16',
  '16x9': '16:9',
};

// Regex: optionele separator + "AxB" of "A.B" of "A-B" met x/./-, vlak voor de extensie.
const RATIO_SUFFIX_RE = /[\s._-]?(\d{1,2})[x.\-:](\d{1,2})$/i;

export interface ParsedName {
  baseName: string;
  ratio: AspectRatio | null;
  extension: string;
}

export function parseCreativeName(fileName: string): ParsedName {
  const dot = fileName.lastIndexOf('.');
  const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const stem = dot >= 0 ? fileName.slice(0, dot) : fileName;

  const m = stem.match(RATIO_SUFFIX_RE);
  if (!m) return { baseName: stem.trim(), ratio: null, extension };

  const key = `${m[1]}x${m[2]}`.toLowerCase();
  const ratio = TOKEN_TO_RATIO[key] ?? null;
  if (!ratio) return { baseName: stem.trim(), ratio: null, extension };

  const baseName = stem.slice(0, m.index).replace(/[\s._-]+$/, '').trim();
  return { baseName: baseName || stem.trim(), ratio, extension };
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
