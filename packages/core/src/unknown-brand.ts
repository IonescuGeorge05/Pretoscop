/**
 * Unknown brands named in titles: the maker's or seller's brand of no-name devices, which no
 * dictionary can list ("Consola Retro, BYONDSELF®, …", "Telefon Mobil Seniori VERITY, …",
 * "SweetLink S2 Plus Telefon mobil …"). `detectBrandInTitle` asks for one only when the title
 * names no known brand. Pure.
 *
 * Rules, first match wins:
 * 1. `trademark` (confidence 0.8): a word glued to ® or ™ ("Garsonal®", "HAPPY JOKER®"), unless it
 *    is a known brand or a technology mark ("Intel® Core™", "Radeon™"); any product kind.
 * 2. `prefix` (0.6): the first word of a title whose product noun comes later ("SweetLink S2 Plus
 *    Telefon mobil", "ZHISHAN Consola de jocuri").
 * 3. `after_noun` (0.6): the first word after the product noun and its descriptors ("Telefon Mobil
 *    pentru Seniori Mapajoy MP2", "Laptop XIAORAN 15.6"", "Consola SUP Game Box") when it is
 *    capitalized and followed by a model code, an upper-case word, "cu"/"pentru" or the end of
 *    the segment, or is itself upper case.
 * 4. `segment` (0.6): a second title segment of one or two capitalized words ("Consola portabila,
 *    Taipintee, 800 jocuri", "Consola de jocuri, Planet Tech, 400 de jocuri").
 * Rules 2–4 apply to devices only (an accessory title names the device it is for). Generic,
 * marketing, technology, platform and colour words never count, nor do words with digits.
 */
import { colorKeyOf } from './attributes';
import type { ProductKind, ProductKindExplained } from './product-kind';
import { foldLower, normalizeText } from './text';

export type UnknownBrandRule = 'trademark' | 'prefix' | 'after_noun' | 'segment';

export interface UnknownBrandGuess {
  /** The words as written in the title ("BYONDSELF", "SweetLink", "HAPPY JOKER"). */
  text: string;
  rule: UnknownBrandRule;
  confidence: number;
}

const DEVICE_KINDS: ReadonlySet<ProductKind> = new Set<ProductKind>([
  'phone',
  'tablet',
  'ereader',
  'laptop',
  'desktop',
  'monitor',
  'tv',
  'console',
  'smartwatch',
]);

/** Technology and component marks that carry ® or ™ in titles but never name the maker. */
const TECH_MARKS = new Set(
  (
    'intel core celeron pentium xeon atom iris arc amd ryzen radeon athlon nvidia geforce rtx gtx ' +
    'quadro windows microsoft office android google play chrome chromecast youtube netflix ' +
    'bluetooth wi fi wifi hdmi usb thunderbolt dolby atmos vision dts qualcomm snapdragon ' +
    'mediatek helio dimensity kirin exynos tensor unisoc allwinner rockchip mali adreno cortex arm ' +
    'apple mac macos ios ipados airplay alexa energy star gorilla glass corning displayport ' +
    'freesync gsync hdr imax qi magsafe linux ubuntu harman kardon dirac moonlight steam link'
  ).split(' '),
);

/** Words that stand where a brand often does but are never one (folded). */
const NOT_A_BRAND = new Set(
  // products and parts
  (
    'consola console joc jocuri jocul telefon telefoane smartphone laptop laptopuri notebook ' +
    'ultrabook televizor televizoare tableta tablete monitor smartwatch ceas ecran display ' +
    'baterie acumulator procesor memorie stocare card design culoare model versiune set pachet ' +
    'kit joystick joystickuri controler controller controlere controllere pistol pady casti boxa ' +
    'cablu incarcator husa suport stand statie adaptor mouse tastatura retea sistem functie ' +
    'functii meniu buton butoane taste limba romana maghiara bulgara engleza computer pc tablet ' +
    'phone camera foto radio lanterna difuzor ' +
    // people, occasions, marketing
    'copii copil adulti seniori varstnici bunici familie family kids cadou nou noua noi new ' +
    'original oficial official garantie promo oferta reducere top best hot sale bonus extra ' +
    'portabil portabila portabile portable retro video gaming gamer mini micro nano clasic ' +
    'clasica clasice classic nostalgic nostalgica nostalgiica arcade handheld pocket stick box ' +
    'game games gameboy player station system entertainment edition editie pro max ultra plus ' +
    'lite slim super smart premium deluxe standard basic plug play touch touchscreen multiplayer ' +
    'multimedia wireless inteligent inteligenta interactiv interactiva educativ educativa ' +
    'electronic electronica digital digitala hybrid flip clapeta fold curbat frameless ' +
    'borderless seria serie tip stil generatie anii ' +
    // technology
    'bluetooth wifi android windows win linux dual sim esim nfc gps lte ram rom ssd emmc hdd ddr ' +
    'cpu gpu abs tv rgb led lcd ips oled qled amoled uhd fhd qhd hd full dvb hdmi usb type typec ' +
    'sd tf microsd inch inci inchi ' +
    // platforms that clones name
    'psp nes snes gba gbc sega famicom mame arkos emuelec emulator emulatoare simulator ' +
    'simulatoare playtech'
  ).split(' '),
);

/** Words skipped after the product noun before a brand ("Telefon Mobil pentru Seniori …"). */
const DESCRIPTORS = new Set(
  (
    'mobil mobile inteligent smart seniori pentru varstnici copii led qled oled miniled uhd 4k hd ' +
    'fhd full gaming gamer portabila portabil portable retro video jocuri joc de tip stick mini ' +
    'noua nou new arcade tv wireless android curbat clasica clasic consola console laptop ' +
    'notebook telefon smartphone televizor tableta convertibil business dual sim 3g 4g 5g'
  ).split(' '),
);

const STRIP_EDGES = /^[("'“„]+|[®™.,;:!?"'”“)]+$/gu;

function clean(word: string): string {
  return word.replace(STRIP_EDGES, '');
}

function isUpperWord(word: string): boolean {
  return /^\p{Lu}[\p{Lu}&-]+$/u.test(clean(word));
}

/** Capitalized, letters only (inner & ' - allowed), 3+ letters, not generic, not a colour. */
function isBrandWord(word: string | undefined, isKnown: (text: string) => boolean): boolean {
  if (word === undefined) return false;
  const w = clean(word);
  if (!/^\p{Lu}[\p{L}&'-]*\p{L}$/u.test(w)) return false;
  if (w.replace(/[^\p{L}]/gu, '').length < 3) return false;
  for (const part of foldLower(w).split(/[-&']/)) {
    if (part === '' || NOT_A_BRAND.has(part) || TECH_MARKS.has(part) || colorKeyOf(part)) {
      return false;
    }
  }
  return !isKnown(w);
}

function segmentsOf(title: string): string[][] {
  return normalizeText(title)
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s*[,;|，]\s*|\s+[-–—]\s+/)
    .map((seg) => seg.split(/\s+/).filter(Boolean));
}

function trademark(title: string, isKnown: (text: string) => boolean): UnknownBrandGuess | null {
  const re = /(?<![\p{L}\d])(?:(\p{Lu}{3,})\s+)?(\p{L}[\p{L}&'-]*)[®™]/gu;
  for (let m = re.exec(title); m !== null; m = re.exec(title)) {
    const word = m[2] ?? '';
    if (!isBrandWord(word, isKnown)) continue;
    const before = m[1];
    const text =
      before !== undefined && isUpperWord(word) && isBrandWord(before, isKnown)
        ? `${before} ${word}`
        : word;
    return { text, rule: 'trademark', confidence: 0.8 };
  }
  return null;
}

function afterNoun(
  words: readonly string[],
  nounAt: number,
  isKnown: (text: string) => boolean,
): string | null {
  let j = nounAt + 1;
  while (j < words.length) {
    const f = foldLower(clean(words[j] as string));
    if (DESCRIPTORS.has(f)) {
      j++;
      continue;
    }
    // "Consola portabila 6000+ jocuri NEXTLY": a games count before the brand.
    if (/^\d[\d.,]*\+?$/.test(f)) {
      const next = foldLower(words[j + 1]);
      if (next === 'jocuri') {
        j += 2;
        continue;
      }
      if (next === 'de' && foldLower(words[j + 2]) === 'jocuri') {
        j += 3;
        continue;
      }
    }
    break;
  }
  const candidate = words[j];
  if (!isBrandWord(candidate, isKnown)) return null;
  const follower = words[j + 1];
  if (
    follower === undefined ||
    /\d/.test(follower) ||
    isUpperWord(follower) ||
    ['cu', 'pentru'].includes(foldLower(follower)) ||
    isUpperWord(candidate as string)
  ) {
    return clean(candidate as string);
  }
  // "Timeless Tools," is a two-word brand; "Retoo PlayTech," is a brand and its product line.
  if (words[j + 2] === undefined) {
    return isBrandWord(follower, isKnown)
      ? `${clean(candidate as string)} ${clean(follower)}`
      : clean(candidate as string);
  }
  return null;
}

/**
 * The unknown brand a title names (see the module comment), or null. `kind` is the product kind
 * of the title; `isKnown` tells dictionary brands apart (they are never guessed).
 */
export function guessUnknownBrand(
  title: string | null | undefined,
  kind: ProductKindExplained,
  isKnown: (text: string) => boolean,
): UnknownBrandGuess | null {
  const text = normalizeText(title);
  if (text === '') return null;
  const marked = trademark(text, isKnown);
  if (marked) return marked;
  if (!DEVICE_KINDS.has(kind.kind)) return null;

  const segments = segmentsOf(text);
  const first = segments[0] ?? [];
  let nounAt = -1;
  if (kind.via === 'title') nounAt = 0;
  else if (kind.via === 'head' && kind.word !== null) {
    nounAt = first.findIndex((w, i) => i > 0 && foldLower(clean(w)) === kind.word);
    const lead = first[0];
    if (nounAt > 0 && isBrandWord(lead, isKnown)) {
      const second = first[1];
      const two =
        nounAt > 1 &&
        isUpperWord(lead as string) &&
        isUpperWord(second ?? '') &&
        isBrandWord(second, isKnown);
      return {
        text: two ? `${clean(lead as string)} ${clean(second as string)}` : clean(lead as string),
        rule: 'prefix',
        confidence: 0.6,
      };
    }
  }
  if (nounAt >= 0) {
    const found = afterNoun(first, nounAt, isKnown);
    if (found) return { text: found, rule: 'after_noun', confidence: 0.6 };
  }
  const second = segments[1] ?? [];
  if (second.length >= 1 && second.length <= 2 && second.every((w) => isBrandWord(w, isKnown))) {
    return { text: second.map(clean).join(' '), rule: 'segment', confidence: 0.6 };
  }
  return null;
}
