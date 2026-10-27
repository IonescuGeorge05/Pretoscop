/**
 * Attribute extraction from offer titles (Romanian and English shop styles). Pure.
 * Every rule is written for precision first: when a value is ambiguous it is left out, because
 * matching (M07) treats storage, RAM, size, colour, capacity and edition as hard constraints.
 * The rules are listed in plain English in the package README.
 */
import { detectProductKind, type ProductKind } from './product-kind';
import { foldLower } from './text';
import { cmToScreenInches, type ScreenContext } from './units';

export type ColorKey =
  | 'black'
  | 'white'
  | 'gray'
  | 'silver'
  | 'blue'
  | 'green'
  | 'red'
  | 'pink'
  | 'gold'
  | 'purple'
  | 'yellow'
  | 'orange'
  | 'beige'
  | 'brown'
  | 'titanium'
  | 'natural_titanium'
  | 'rose_gold'
  | 'transparent'
  | 'multicolor';

/** Romanian display label of each colour key (comma-below diacritics). */
export const COLOR_LABELS_RO: Readonly<Record<ColorKey, string>> = {
  black: 'negru',
  white: 'alb',
  gray: 'gri',
  silver: 'argintiu',
  blue: 'albastru',
  green: 'verde',
  red: 'roșu',
  pink: 'roz',
  gold: 'auriu',
  purple: 'mov',
  yellow: 'galben',
  orange: 'portocaliu',
  beige: 'bej',
  brown: 'maro',
  titanium: 'titan',
  natural_titanium: 'titan natural',
  rose_gold: 'roz auriu',
  transparent: 'transparent',
  multicolor: 'multicolor',
};

export type Resolution =
  '8k' | '5k' | '4k' | 'dqhd' | 'uwqhd' | 'wqxga' | 'qhd' | '3k' | '2.8k' | 'wuxga' | 'fhd' | 'hd';

export type Connectivity =
  '5g' | '4g' | 'wifi' | 'bluetooth' | 'dual_sim' | 'esim' | 'cellular' | 'nfc';

export type Edition =
  | 'slim'
  | 'digital'
  | 'disc'
  | 'pro'
  | 'ultra'
  | 'max'
  | 'plus'
  | 'mini'
  | 'lite'
  | 'fe'
  | 'se'
  | 'air'
  | 'xl'
  | 'ti'
  | 'super';

const EDITION_ORDER: readonly Edition[] = [
  'slim',
  'digital',
  'disc',
  'pro',
  'ultra',
  'max',
  'plus',
  'mini',
  'lite',
  'fe',
  'se',
  'air',
  'xl',
  'ti',
  'super',
];

export interface Attributes {
  /** Internal storage / SSD / drive capacity in GB (1 TB = 1024). */
  storageGb?: number;
  ramGb?: number;
  /** Graphics memory (graphics cards; laptops' "RTX 4060 8GB"). */
  vramGb?: number;
  /** Screen diagonal in inches (one decimal at most). */
  screenInches?: number;
  resolution?: Resolution;
  color?: ColorKey;
  /** Romanian label of `color`. */
  colorRo?: string;
  year?: number;
  /** Normalized generation: `gen2`, `gen13`, Apple silicon `m4` / `m4-pro`. */
  generation?: string;
  /** Sorted, unique. */
  connectivity?: Connectivity[];
  /** EU energy label class: `A`–`G`, or `A+`…`A+++` (old scale). */
  energyClass?: string;
  /** Volume in litres (largest stated: fridges list total and compartments). */
  capacityL?: number;
  /** Washing/drying load in kg (washing machines and dryers only). */
  capacityKg?: number;
  powerW?: number;
  /** Variant words of the model name, in a fixed order. */
  edition?: Edition[];
  /** Smartwatch case size in mm. */
  caseSizeMm?: number;
  /** Number of items in a multipack ("Set 2 becuri", "3-pack"). */
  packCount?: number;
  /** Coarse product kind used to interpret the title. */
  kind?: ProductKind;
}

export interface ExtractAttributesOptions {
  /** Shop category path or our category slug; used when the title does not say what it is. */
  categoryHint?: string | null;
  /** Detected brand name; enables brand-specific rules (Apple silicon generations). */
  brand?: string | null;
  /** Precomputed product kind (otherwise detected). */
  kind?: ProductKind;
}

/** Folded, lower-case text with decimal commas as dots and ×/x unified. */
function prepare(title: string): string {
  return (
    foldLower(title)
      .replace(/\u{D7}/gu, 'x')
      // "Acebook 10,16GB DDR4" lists a model number and a capacity; it is not 10.16 GB.
      .replace(/(?<![\d.,])(\d{2,}),(\d{2,})(?=\s*(?:gb|tb|mb)\b)/g, '$1, $2')
      .replace(/(\d),(\d)/g, '$1.$2')
  );
}

// ---------------------------------------------------------------------------------------------
// Storage, RAM, VRAM

interface Capacity {
  gb: number;
  index: number;
  label: 'ram' | 'storage' | 'vram' | null;
}

function toGb(value: number, unit: string): number {
  if (unit === 'tb') return Math.round(value * 1024);
  if ([1000, 2000, 4000, 8000].includes(value)) return (value / 1000) * 1024;
  return value;
}

const RAM_AFTER =
  /^[\s(),]*(?:de\s+)?(?:memorie\s+)?(?:ram|lpddr\d*[a-z]?x?|ddr\d*[a-z]?x?|so-?dimm|dimm|unified|memorie unificata)\b/;
const RAM_BEFORE = /\b(?:ram|memorie ram)\s*:?\s*$/;
/** Bare "memorie": RAM on computers ("Memorie 16GB"), storage elsewhere ("Memorie 32GB" console). */
const MEMORY_AFTER = /^[\s(),]*(?:de\s+)?memorie\b(?!\s+(?:ram|interna|externa))/;
const MEMORY_BEFORE = /\bmemorie\s*:?\s*$/;
/**
 * Expandable or optional capacities are not built in: "pana la 128GB", "Expansion SSD 1TB",
 * "1 TB SSD expansiune" (the English word precedes its noun, the Romanian one follows it).
 */
const EXPANSION_BEFORE =
  /\b(?:pana la|up to|maxim(?:um)?|max|extensibil\w*|expandabil\w*|extindere|expansiune|expansion|suport\w*)\s*:?\s*(?:(?:ssd|hdd|card|microsd|tf|sd|de|cu)\s+){0,2}$/;
const EXPANSION_AFTER =
  /^\s*(?:(?:ssd|hdd|card|microsd|tf|sd)\s+)?(?:expansiune|extensibil\w*|expandabil\w*|optional\w*)\b/;
/** "12GB RAM 512GB": the word between two capacities labels the first one. */
const OWNED_BEFORE = /\d\s*(?:gb|tb)\s+[a-z]+\s*:?\s*$/;
const VRAM_AFTER = /^[\s(),]*(?:gddr\d*x?|vram|hbm\d?)\b/;
const VRAM_BEFORE =
  /\b(?:rtx|gtx|rx|radeon|geforce|arc|quadro|graphics|placa video)\b[\s\w.-]{0,22}$/;
const STORAGE_AFTER =
  /^[\s(),]*(?:ssd|hdd|emmc|ufs|nvme|stocare|rom|memorie interna|spatiu|flash|hard disk|storage)\b/;
const STORAGE_BEFORE =
  /\b(?:ssd|hdd|stocare|rom|memorie interna|capacitate|spatiu|storage)\s*:?\s*$/;

const RAM_KINDS: ReadonlySet<ProductKind> = new Set(['ram']);
const STORAGE_KINDS: ReadonlySet<ProductKind> = new Set(['storage', 'memory_card', 'usb_drive']);
const RAM_HOST_KINDS: ReadonlySet<ProductKind> = new Set([
  'phone',
  'tablet',
  'laptop',
  'desktop',
  'console',
  'other',
]);

function extractMemory(
  text: string,
  kind: ProductKind,
): Pick<Attributes, 'storageGb' | 'ramGb' | 'vramGb'> {
  const out: Pick<Attributes, 'storageGb' | 'ramGb' | 'vramGb'> = {};
  let s = text;
  // RAM kits "2x16GB" restate the total: mask them.
  s = s.replace(/\b\d{1,2}\s*x\s*\d{1,3}\s*gb\b/g, (m) => ' '.repeat(m.length));
  // "4G RAM" is a common typo for 4 GB of RAM (not 4G connectivity).
  const gRam = /\b(\d{1,2})\s?g\s+ram\b/.exec(s);
  if (gRam && kind !== 'gpu') {
    out.ramGb = Number(gRam[1]);
    s = s.slice(0, gRam.index) + ' '.repeat(gRam[0].length) + s.slice(gRam.index + gRam[0].length);
  }
  // "128G", "64G incorporat": a capacity without the B (never a network generation at these sizes).
  s = s.replace(/(?<![\w.])(16|32|64|128|256|512)\s?g\b(?!\s*(?:ram|lte|retea|network))/g, '$1gb');
  // "SSD512", "SSD 256" (no unit), "SSD1TB": the capacity of the named memory.
  s = s.replace(
    /\b(ssd|hdd|emmc|ufs|rom)\s?(64|128|256|512|1024|2048)\b(?!\s*(?:gb|tb|mb))/g,
    '$1 $2gb',
  );
  s = s.replace(/\b(ssd|hdd|emmc|ufs|rom|ram)(\d{1,4}(?:\.\d{1,2})?\s*(?:gb|tb))\b/g, '$1 $2');
  // Pairs "8/256GB", "8GB/256GB", "12+512GB": RAM then storage ("32GB+128G" are two cards).
  const pair = /\b(\d{1,2})\s*(?:gb)?\s*[/+]\s*(\d{2,4})\s*(gb|tb)\b/.exec(s);
  if (pair && kind !== 'ram' && kind !== 'gpu') {
    const ram = Number(pair[1]);
    const storage = toGb(Number(pair[2]), pair[3] ?? 'gb');
    if (ram > 0 && ram <= 24 && ram < storage) {
      out.ramGb = ram;
      out.storageGb = storage;
      s =
        s.slice(0, pair.index) + ' '.repeat(pair[0].length) + s.slice(pair.index + pair[0].length);
    }
  }
  const memoryLabel: Capacity['label'] =
    kind === 'laptop' || kind === 'desktop' ? 'ram' : 'storage';
  const labelBefore = (before: string): Capacity['label'] => {
    if (OWNED_BEFORE.test(before)) return null;
    if (VRAM_BEFORE.test(before)) return 'vram';
    if (RAM_BEFORE.test(before)) return 'ram';
    if (STORAGE_BEFORE.test(before)) return 'storage';
    if (MEMORY_BEFORE.test(before)) return memoryLabel;
    return null;
  };
  const labelAfter = (after: string): Capacity['label'] => {
    if (VRAM_AFTER.test(after)) return 'vram';
    if (RAM_AFTER.test(after)) return 'ram';
    if (STORAGE_AFTER.test(after)) return 'storage';
    if (MEMORY_AFTER.test(after)) return memoryLabel;
    return null;
  };
  const caps: Capacity[] = [];
  const re = /(?<![\w.])(\d{1,4}(?:\.\d{1,2})?)\s*(gb|tb)\b/g;
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    const gb = toGb(Number(m[1]), m[2] ?? 'gb');
    if (!(gb > 0)) continue;
    const before = s.slice(Math.max(0, m.index - 40), m.index);
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 24);
    if (EXPANSION_BEFORE.test(before) || EXPANSION_AFTER.test(after)) continue;
    // The word before wins ("RAM 16GB SSD 512GB") unless it labels the previous capacity.
    caps.push({ gb, index: m.index, label: labelBefore(before) ?? labelAfter(after) });
  }
  const first = (label: Capacity['label']): number | undefined =>
    caps.find((c) => c.label === label)?.gb;
  const vram = first('vram');
  if (vram !== undefined) out.vramGb = vram;
  if (out.ramGb === undefined) {
    const ram = first('ram');
    if (ram !== undefined && ram <= 512) out.ramGb = ram;
  }
  if (out.storageGb === undefined) {
    const storage = first('storage');
    if (storage !== undefined) out.storageGb = storage;
  }
  const unlabeled = caps.filter((c) => c.label === null).map((c) => c.gb);
  if (unlabeled.length === 0) return out;
  if (kind === 'gpu') {
    if (out.vramGb === undefined) out.vramGb = unlabeled[0] as number;
    return out;
  }
  if (RAM_KINDS.has(kind)) {
    if (out.ramGb === undefined) out.ramGb = unlabeled[0] as number;
    return out;
  }
  if (STORAGE_KINDS.has(kind)) {
    if (out.storageGb === undefined) out.storageGb = Math.max(...unlabeled);
    return out;
  }
  const max = Math.max(...unlabeled);
  const min = Math.min(...unlabeled);
  if (out.storageGb === undefined) {
    if (out.ramGb !== undefined) {
      if (max > out.ramGb) out.storageGb = max;
    } else if (unlabeled.length >= 2 && min < max && min <= 64 && RAM_HOST_KINDS.has(kind)) {
      out.storageGb = max;
      out.ramGb = min;
    } else if (max >= 32 || kind === 'ereader' || kind === 'console') {
      out.storageGb = max;
    } else if ((kind === 'laptop' || kind === 'desktop') && max <= 64) {
      out.ramGb = max;
    }
  } else if (out.ramGb === undefined && RAM_HOST_KINDS.has(kind)) {
    const ram = unlabeled.find((v) => v <= 64 && v < (out.storageGb as number));
    if (ram !== undefined) out.ramGb = ram;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Screen

const NO_SCREEN_KINDS: ReadonlySet<ProductKind> = new Set([
  'storage',
  'usb_drive',
  'memory_card',
  'psu',
  'pc_case',
  'cooler',
  'gpu',
  'cpu',
  'motherboard',
  'ram',
]);

function screenContextFor(kind: ProductKind): ScreenContext | null {
  if (kind === 'tv') return 'tv';
  if (kind === 'monitor') return 'monitor';
  if (kind === 'laptop') return 'laptop';
  return null;
}

function extractScreen(text: string, kind: ProductKind): number | undefined {
  if (NO_SCREEN_KINDS.has(kind)) return undefined;
  // 15.6", 13'', 15.6' (a single quote is an inch mark too), 2.4-inch, 6.7 inchi.
  const re =
    /(?<![\w.])(\d{1,3}(?:\.\d{1,2})?)(?:\s*(?:"|''|'(?![a-z0-9]))|\s*-?\s*(?:inch(?:es)?\b|inchi\b|inci\b|toli\b))/g;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const before = text.slice(Math.max(0, m.index - 6), m.index);
    if (/\d\s*[-/]\s*$/.test(before)) continue; // "32-65"" is a range
    const value = Number(m[1]);
    if (value >= 1 && value <= 120) return Math.round(value * 100) / 100;
  }
  const context = screenContextFor(kind);
  if (!context) return undefined;
  const cm = /(?<![\w.])(\d{2,3}(?:\.\d)?)\s*cm\b/g;
  for (let m = cm.exec(text); m !== null; m = cm.exec(text)) {
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (/\b(?:h|inaltime|latime|adancime|l|w|d)\s*:?\s*$/.test(before)) continue;
    const inches = cmToScreenInches(Number(m[1]), context);
    if (inches !== null) return inches;
  }
  return undefined;
}

function extractResolution(text: string): Resolution | undefined {
  if (/(?<![\d.])8k\b|\b7680\s*x\s*4320\b/.test(text)) return '8k';
  if (/(?<![\d.])5k\b|\b5120\s*x\s*2880\b/.test(text)) return '5k';
  if (/(?<![\d.])4k\b|\buhd\b|\bultra[\s-]?hd\b|\b2160p\b|\b3840\s*x\s*2160\b/.test(text))
    return '4k';
  if (/\bdqhd\b|\b5120\s*x\s*1440\b/.test(text)) return 'dqhd';
  if (/\buwqhd\b|\b3440\s*x\s*1440\b/.test(text)) return 'uwqhd';
  if (/\bwqxga\b|\b2560\s*x\s*1600\b/.test(text)) return 'wqxga';
  if (/\bw?qhd\b|\b1440p\b|\b2560\s*x\s*1440\b/.test(text)) return 'qhd';
  if (/(?<![\d.])3k\b|\b2880\s*x\s*1920\b/.test(text)) return '3k';
  if (/\b2\.8k\b|\b2880\s*x\s*1800\b/.test(text)) return '2.8k';
  if (/\bwuxga\b|\b1920\s*x\s*1200\b/.test(text)) return 'wuxga';
  if (/\bfhd\+?|\bfull[\s-]?hd\b|\b1080p\b|\b1920\s*x\s*1080\b/.test(text)) return 'fhd';
  if (/\bhd ready\b|\b720p\b|\b1366\s*x\s*768\b|\b1280\s*x\s*720\b|\bhd\b/.test(text)) return 'hd';
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Colour

/** Folded phrases → colour key. Longer phrases are tried first. */
const COLOR_WORDS: ReadonlyArray<readonly [string, ColorKey]> = [
  ['natural titanium', 'natural_titanium'],
  ['titanium natural', 'natural_titanium'],
  ['titan natural', 'natural_titanium'],
  ['rose gold', 'rose_gold'],
  ['rosegold', 'rose_gold'],
  ['roz auriu', 'rose_gold'],
  ['space gray', 'gray'],
  ['space grey', 'gray'],
  ['gri spatial', 'gray'],
  ['silverblue', 'blue'],
  ['whitesilver', 'silver'],
  ['jadegreen', 'green'],
  ['pinkgold', 'pink'],
  ['jetblack', 'black'],
  ['icyblue', 'blue'],
  ['iceblue', 'blue'],
  ['black', 'black'],
  ['negru', 'black'],
  ['neagra', 'black'],
  ['negre', 'black'],
  ['negri', 'black'],
  ['midnight', 'black'],
  ['obsidian', 'black'],
  ['onyx', 'black'],
  ['white', 'white'],
  ['alb', 'white'],
  ['alba', 'white'],
  ['albe', 'white'],
  ['albi', 'white'],
  ['starlight', 'white'],
  ['gray', 'gray'],
  ['grey', 'gray'],
  ['gri', 'gray'],
  ['graphite', 'gray'],
  ['grafit', 'gray'],
  ['charcoal', 'gray'],
  ['anthracite', 'gray'],
  ['antracit', 'gray'],
  ['slate', 'gray'],
  ['silver', 'silver'],
  ['argintiu', 'silver'],
  ['argintie', 'silver'],
  ['argintii', 'silver'],
  ['platinum', 'silver'],
  ['inox', 'silver'],
  ['chrome', 'silver'],
  ['crom', 'silver'],
  ['nichel', 'silver'],
  ['nickel', 'silver'],
  ['blue', 'blue'],
  ['albastru', 'blue'],
  ['albastra', 'blue'],
  ['albastre', 'blue'],
  ['albastri', 'blue'],
  ['bleu', 'blue'],
  ['navy', 'blue'],
  ['bleumarin', 'blue'],
  ['cyan', 'blue'],
  ['turquoise', 'blue'],
  ['turcoaz', 'blue'],
  ['ultramarine', 'blue'],
  ['indigo', 'blue'],
  ['blueberry', 'blue'],
  ['green', 'green'],
  ['verde', 'green'],
  ['verzi', 'green'],
  ['mint', 'green'],
  ['menta', 'green'],
  ['olive', 'green'],
  ['jade', 'green'],
  ['emerald', 'green'],
  ['smarald', 'green'],
  ['teal', 'green'],
  ['sage', 'green'],
  ['lime', 'green'],
  ['red', 'red'],
  ['rosu', 'red'],
  ['rosie', 'red'],
  ['rosii', 'red'],
  ['burgundy', 'red'],
  ['bordo', 'red'],
  ['visiniu', 'red'],
  ['pink', 'pink'],
  ['roz', 'pink'],
  ['gold', 'gold'],
  ['auriu', 'gold'],
  ['aurie', 'gold'],
  ['aurii', 'gold'],
  ['champagne', 'gold'],
  ['purple', 'purple'],
  ['mov', 'purple'],
  ['violet', 'purple'],
  ['violeta', 'purple'],
  ['lavender', 'purple'],
  ['lavanda', 'purple'],
  ['lilac', 'purple'],
  ['lila', 'purple'],
  ['yellow', 'yellow'],
  ['galben', 'yellow'],
  ['galbena', 'yellow'],
  ['galbene', 'yellow'],
  ['orange', 'orange'],
  ['portocaliu', 'orange'],
  ['portocalie', 'orange'],
  ['coral', 'orange'],
  ['beige', 'beige'],
  ['bej', 'beige'],
  ['cream', 'beige'],
  ['crem', 'beige'],
  ['ivory', 'beige'],
  ['sand', 'beige'],
  ['desert', 'beige'],
  ['brown', 'brown'],
  ['maro', 'brown'],
  ['bronze', 'brown'],
  ['bronz', 'brown'],
  ['copper', 'brown'],
  ['cupru', 'brown'],
  ['titanium', 'titanium'],
  ['titan', 'titanium'],
  ['transparent', 'transparent'],
  ['transparenta', 'transparent'],
  ['transparente', 'transparent'],
  ['clear', 'transparent'],
  ['multicolor', 'multicolor'],
  ['multicolora', 'multicolor'],
  ['multicolour', 'multicolor'],
];

const COLOR_RE = new RegExp(
  String.raw`\b(${[...COLOR_WORDS]
    .map(([w]) => w)
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/ /g, String.raw`\s+`))
    .join('|')})\b`,
  'g',
);
const COLOR_KEY = new Map(COLOR_WORDS.map(([w, k]) => [w, k] as const));

/** Colour key of one word or phrase ("Negru" → black), or undefined. */
export function colorKeyOf(word: string | null | undefined): ColorKey | undefined {
  return COLOR_KEY.get(foldLower(word).trim());
}

/** Phrases where colour words are not colours (product lines, certifications, switches, OS names). */
const COLOR_EXCLUSIONS: readonly RegExp[] = [
  /\bblack friday\b/g,
  /\bwd[\s_-]?black\b/g,
  /\bblack shark\b/g,
  /\bred magic\b/g,
  /\bblue yeti\b/g,
  /\bwhite (?:and|&) colou?r(?: ambiance)?\b/g,
  /\bwhite ambiance\b/g,
  /\btitan os\b/g,
  /\b80\s*(?:\+|plus)\s*(?:gold|silver|bronze|platinum|titanium|white)\b/g,
  /\b(?:red|blue|brown|green|yellow|black|silver|white|clear|orange|pink)\s+switch(?:es)?\b/g,
  /\b(?:gold|silver|platinum|black|diamond) edition\b/g,
  /\bgreen ?tech\b/g,
  /\bclear ?type\b/g,
  /\bred dot\b/g,
];

const BAND_SEGMENT = /\b(?:curea|curele|bratara|bratari|strap|band|loop)\b/;
/** Finishes rather than colours: next to a colour word, the colour wins ("negru transparent"). */
const MATERIAL_KEYS: ReadonlySet<ColorKey> = new Set(['titanium', 'transparent']);

/** One-word compounds ending in a base colour ("LightGray", "Graygreen"): the last word decides. */
const COMPOUND_COLOR_RE =
  /\b(?:light|dark|deep|pale|sky|jet|icy|ice|navy|mint|rose|jade|gray|grey|silver|white|pink|blue|green|black|gold|purple|soft|matte|space|cool|warm|pure|night|graphite)(gray|grey|green|blue|black|white|silver|gold|pink|red|purple|yellow|orange|beige|brown)\b/g;

interface ColorMatch {
  key: ColorKey;
  start: number;
  end: number;
}

function colorMatches(seg: string): ColorMatch[] {
  const found: ColorMatch[] = [];
  COLOR_RE.lastIndex = 0;
  for (let m = COLOR_RE.exec(seg); m !== null; m = COLOR_RE.exec(seg)) {
    const key = COLOR_KEY.get((m[1] ?? '').replace(/\s+/g, ' '));
    if (key) found.push({ key, start: m.index, end: m.index + m[0].length });
  }
  COMPOUND_COLOR_RE.lastIndex = 0;
  for (let m = COMPOUND_COLOR_RE.exec(seg); m !== null; m = COMPOUND_COLOR_RE.exec(seg)) {
    const start = m.index;
    const end = start + m[0].length;
    if (found.some((f) => f.start < end && start < f.end)) continue;
    const key = COLOR_KEY.get(m[1] ?? '');
    if (key) found.push({ key, start, end });
  }
  found.sort((a, b) => a.start - b.start);
  // "Blue Black", "Titanium Silver": adjacent colour words name one colour, the last decides
  // (unless the last is a material: "Desert Titanium" is beige).
  const merged: ColorMatch[] = [];
  for (const m of found) {
    const prev = merged[merged.length - 1];
    if (prev && seg.slice(prev.end, m.start).trim() === '') {
      if (!MATERIAL_KEYS.has(m.key)) merged[merged.length - 1] = m;
      continue;
    }
    merged.push(m);
  }
  return merged;
}

/** The colour a segment names: its first non-material colour ("negru transparent" → black). */
function segmentColor(seg: string): ColorKey | undefined {
  const found = colorMatches(seg).map((m) => m.key);
  return found.find((k) => !MATERIAL_KEYS.has(k)) ?? found[0];
}

/** A segment that is only colour words ("negru", "alb argintiu"). */
function onlyColors(seg: string): boolean {
  const matches = colorMatches(seg);
  if (matches.length === 0) return false;
  let rest = seg;
  for (const m of [...matches].reverse()) rest = rest.slice(0, m.start) + rest.slice(m.end);
  return /^[\s/&-]*$/.test(rest);
}

function extractColor(text: string): ColorKey | undefined {
  let s = text;
  for (const re of COLOR_EXCLUSIONS) s = s.replace(re, (m) => ' '.repeat(m.length));
  const segments = s.split(/[,;|()[\]]| - /);
  let fallback: ColorKey | undefined;
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i] as string;
    let pick = segmentColor(seg);
    if (pick === undefined) continue;
    if (BAND_SEGMENT.test(seg)) {
      fallback ??= pick;
      continue;
    }
    // "…, negru, rosu": colours listed in a row name the first one, as "negru/rosu" does.
    for (let j = i - 1; j >= 0 && onlyColors(segments[j] as string); j--) {
      pick = segmentColor(segments[j] as string) ?? pick;
    }
    return pick;
  }
  return fallback;
}

// ---------------------------------------------------------------------------------------------
// Year, generation, connectivity, energy, capacities, power, editions, pack

function extractYear(text: string): number | undefined {
  const re =
    /(?<![\w.-])(20[1-3]\d)(?![\w.]|\s*(?:w|mah|mhz|ghz|rpm|lm|gb|tb|mm|cm|lei|ron|pa|btu|x\d)\b)/g;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const year = Number(m[1]);
    if (year >= 2010 && year <= 2035) return year;
  }
  return undefined;
}

const APPLE_CONTEXT = /\b(?:macbook|imac|ipad|mac mini|mac studio|mac pro|apple)\b/;

function extractGeneration(text: string, brand: string | null | undefined): string | undefined {
  const ord = /\b(\d{1,2})(?:st|nd|rd|th)\s*gen(?:eration)?\b/.exec(text);
  if (ord) return `gen${Number(ord[1])}`;
  const ro = /\bgeneratia\s+(?:a\s+)?(\d{1,2})(?:-?a)?\b|\ba\s+(\d{1,2})-?a\s+generatie\b/.exec(
    text,
  );
  if (ro) return `gen${Number(ro[1] ?? ro[2])}`;
  const gen = /\bgen(?:eratia|eration)?\s*\.?\s*(\d{1,2})\b/g;
  for (let m = gen.exec(text); m !== null; m = gen.exec(text)) {
    const before = text.slice(Math.max(0, m.index - 14), m.index);
    if (/\b(?:pcie|pci express|usb(?: \d(?:\.\d)?)?|uhs|thunderbolt)\s*$/.test(before)) continue;
    return `gen${Number(m[1])}`;
  }
  if ((brand && /^apple$/i.test(brand)) || APPLE_CONTEXT.test(text)) {
    const chip = /\b(m[1-5])\b(?:\s+(pro|max|ultra))?/.exec(text);
    if (chip) return chip[2] ? `${chip[1]}-${chip[2]}` : chip[1];
  }
  return undefined;
}

function extractConnectivity(text: string): Connectivity[] | undefined {
  const out = new Set<Connectivity>();
  if (/\b5g\b(?!\s*ram\b)/.test(text)) out.add('5g');
  if (/\b4g\b(?!\s*ram\b)|\blte\b/.test(text)) out.add('4g');
  if (/\bwi[\s-]?fi\b|\bwifi\s*\d*e?\b/.test(text)) out.add('wifi');
  if (/\bbluetooth\b|\bbt\s?\d(?:\.\d)?\b|\bbt\b/.test(text)) out.add('bluetooth');
  if (/\bdual[\s-]?sim\b/.test(text)) out.add('dual_sim');
  if (/\be-?sim\b/.test(text)) out.add('esim');
  if (/\bcellular\b/.test(text)) out.add('cellular');
  if (/\bnfc\b/.test(text)) out.add('nfc');
  return out.size > 0 ? [...out].sort() : undefined;
}

function extractEnergyClass(text: string): string | undefined {
  const explicit =
    /\bclas[ae]\s*(?:de\s+)?(?:eficienta\s+)?(?:energetica\s*)?:?\s*([a-g])(\+{0,3})(?![a-z0-9])/.exec(
      text,
    );
  if (explicit) return `${(explicit[1] ?? '').toUpperCase()}${explicit[2] ?? ''}`;
  const english = /\benergy (?:class|rating)\s*:?\s*([a-g])(\+{0,3})(?![a-z0-9])/.exec(text);
  if (english) return `${(english[1] ?? '').toUpperCase()}${english[2] ?? ''}`;
  const bare = /(?<![\w+])a(\+{1,3})(?![\w+])/.exec(text);
  if (bare) return `A${bare[1] ?? ''}`;
  return undefined;
}

function extractCapacityL(text: string): number | undefined {
  const re = /(?<![\w.])(\d{1,4}(?:\.\d{1,2})?)\s*(?:l|litri|litre|liters?|ltr)\b(?!\s*\/)/g;
  let best: number | undefined;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const v = Number(m[1]);
    if (v > 0 && v <= 2000) best = best === undefined ? v : Math.max(best, v);
  }
  return best;
}

const KG_KINDS: ReadonlySet<ProductKind> = new Set(['washer', 'washer_dryer', 'dryer']);

function extractCapacityKg(text: string, kind: ProductKind): number | undefined {
  if (!KG_KINDS.has(kind)) return undefined;
  const m = /(?<![\w.])(\d{1,2}(?:\.\d)?)\s*(?:\/\s*\d{1,2}(?:\.\d)?\s*)?kg\b/.exec(text);
  if (!m) return undefined;
  const v = Number(m[1]);
  return v > 0 && v <= 30 ? v : undefined;
}

function extractPowerW(text: string): number | undefined {
  const kw = /(?<![\w.])(\d{1,2}(?:\.\d{1,2})?)\s*kw\b/.exec(text);
  const w = /(?<![\w.])(\d{1,3}(?:\.\d{3})|\d{1,5})\s*(?:w|wati|watt|wats)\b/.exec(text);
  if (w) return Number((w[1] ?? '').replace('.', ''));
  if (kw) return Math.round(Number(kw[1]) * 1000);
  return undefined;
}

function extractEditions(text: string, kind: ProductKind): Edition[] | undefined {
  let first = text.split(',')[0] ?? '';
  first = first
    .replace(/\bwindows\s*\d*\s*pro\b/g, ' ')
    .replace(/\bcore\s+ultra\b/g, ' ')
    .replace(/\bultra[\s-]?(?:hd|slim|thin|wide|fast|silent|light)\b/g, ' ')
    .replace(/\bmini\s+(?:pc|hdmi|usb|displayport|jack|led)\b/g, ' ')
    .replace(/\bmax\.\s*/g, ' ');
  const found = new Set<Edition>();
  if (/\bslim\b/.test(first)) found.add('slim');
  if (/\bdigital edition\b/.test(text) || (kind === 'console' && /\bdigital\b/.test(first)))
    found.add('digital');
  if (/\b(?:disc|disk) edition\b|\bcu unitate (?:optica|disc)\b|\(disc\)/.test(text))
    found.add('disc');
  if (/\bpro\b/.test(first)) found.add('pro');
  if (/\bultra\b/.test(first)) found.add('ultra');
  if (
    /\bmax\b(?!\s*\d+(?:[.,]\d+)?\s*(?:kg|w|l|cm|mm|ore|h|min|db|lei|ron|bar|rpm|pa|%))/.test(first)
  ) {
    found.add('max');
  }
  if (/\bplus\b/.test(first) || /(?:^|\s)[a-z0-9]{1,4}\+(?!\+)(?=\s|$)/.test(first))
    found.add('plus');
  if (/\bmini\b/.test(first)) found.add('mini');
  if (/\blite\b/.test(first)) found.add('lite');
  if (/\bfe\b/.test(first)) found.add('fe');
  if (/\b(?:iphone|watch|ipad)\s+se\b/.test(first)) found.add('se');
  if (/\b(?:macbook|ipad|iphone|pad|book)\s+air\b/.test(first)) found.add('air');
  if (/\bxl\b/.test(first)) found.add('xl');
  if (/\b\d{4}\s*ti\b/.test(first)) found.add('ti');
  if (/\b\d{4}\s*(?:ti\s+)?super\b/.test(first)) found.add('super');
  if (found.size === 0) return undefined;
  return EDITION_ORDER.filter((e) => found.has(e));
}

function extractCaseSize(text: string, kind: ProductKind): number | undefined {
  if (kind !== 'smartwatch') return undefined;
  const m = /(?<![\w./])(\d{2})\s*mm\b/.exec(text);
  if (!m) return undefined;
  const v = Number(m[1]);
  return v >= 36 && v <= 55 ? v : undefined;
}

function extractPackCount(text: string): number | undefined {
  const m =
    /\b(\d{1,3})\s*-?\s*(?:buc|bucati|pcs|pack|pachet)\b|\bset\s+(?:de\s+)?(\d{1,3})\b|\bpachet\s+(?:de\s+)?(\d{1,3})\b/.exec(
      text,
    );
  if (!m) return undefined;
  const v = Number(m[1] ?? m[2] ?? m[3]);
  return v >= 2 && v <= 500 ? v : undefined;
}

/**
 * Extracts typed attributes from a title. Absent keys mean "not stated or ambiguous".
 * `options.categoryHint` helps when the title does not start with a product noun.
 */
export function extractAttributes(
  title: string | null | undefined,
  options: ExtractAttributesOptions = {},
): Attributes {
  const text = prepare(title ?? '');
  if (text === '') return {};
  const kind = options.kind ?? detectProductKind(title, options.categoryHint);
  const out: Attributes = { kind };
  Object.assign(out, extractMemory(text, kind));
  const screen = extractScreen(text, kind);
  if (screen !== undefined) out.screenInches = screen;
  const resolution = extractResolution(text);
  if (resolution) out.resolution = resolution;
  const color = extractColor(text);
  if (color) {
    out.color = color;
    out.colorRo = COLOR_LABELS_RO[color];
  }
  const year = extractYear(text);
  if (year !== undefined) out.year = year;
  const generation = extractGeneration(text, options.brand);
  if (generation) out.generation = generation;
  const connectivity = extractConnectivity(text);
  if (connectivity) out.connectivity = connectivity;
  const energy = extractEnergyClass(text);
  if (energy) out.energyClass = energy;
  const litres = extractCapacityL(text);
  if (litres !== undefined) out.capacityL = litres;
  const kg = extractCapacityKg(text, kind);
  if (kg !== undefined) out.capacityKg = kg;
  const power = extractPowerW(text);
  if (power !== undefined) out.powerW = power;
  const editions = extractEditions(text, kind);
  if (editions) out.edition = editions;
  const caseSize = extractCaseSize(text, kind);
  if (caseSize !== undefined) out.caseSizeMm = caseSize;
  const pack = extractPackCount(text);
  if (pack !== undefined) out.packCount = pack;
  return out;
}
