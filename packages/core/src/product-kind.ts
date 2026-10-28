/**
 * Coarse product kind from the product noun of the title ("Telefon mobil …", "Masina de spalat
 * rufe …", "Husa …"; also after a seller or model prefix: "SweetLink S2 Plus Telefon mobil …"),
 * then the shop's breadcrumb (leaf first), then well-known product lines (MacBook → laptop). Pure.
 * Used to interpret attributes (a "2.5 inch" HDD is not a screen, "1 kg" on a bread maker is not a
 * washing capacity) and to tell accessories and games from devices.
 */
import { foldLower } from './text';

export type ProductKind =
  | 'phone'
  | 'tablet'
  | 'ereader'
  | 'laptop'
  | 'desktop'
  | 'monitor'
  | 'tv'
  | 'console'
  | 'game'
  | 'gpu'
  | 'cpu'
  | 'motherboard'
  | 'ram'
  | 'storage'
  | 'memory_card'
  | 'usb_drive'
  | 'psu'
  | 'pc_case'
  | 'cooler'
  | 'headphones'
  | 'speaker'
  | 'smartwatch'
  | 'fitness_band'
  | 'peripheral'
  | 'printer'
  | 'camera'
  | 'drone'
  | 'network'
  | 'washer'
  | 'washer_dryer'
  | 'dryer'
  | 'dishwasher'
  | 'fridge'
  | 'oven'
  | 'microwave'
  | 'hob'
  | 'hood'
  | 'stove'
  | 'air_conditioner'
  | 'water_heater'
  | 'vacuum'
  | 'coffee'
  | 'kitchen'
  | 'personal_care'
  | 'lighting'
  | 'mobility'
  | 'power_bank'
  | 'accessory'
  | 'other';

/** Ordered: the first pattern that matches the start of the title wins. */
const TITLE_RULES: ReadonlyArray<readonly [ProductKind, RegExp]> = [
  // Handheld and TV game devices sold as "Joc …" (before the `game` rule).
  ['console', /^(?:joc (?:tv|portabil|electronic|cu (?:afisaj|ecran))|gameboy|game boy)\b/],
  ['game', /^(?:joc|jocuri|joc video|game)\b/],
  ['fitness_band', /^bratar[ai] (?:fitness|inteligent[ai]|smart|activity)\b/],
  [
    'pc_case',
    /^carcas[ai] (?:pc|atx|calculator|gaming|mid|full|mini|micro)\b|^carcas[ai]\b.*\b(?:mid|full|mini)[- ]?tower\b/,
  ],
  ['coffee', /^filtru de cafea\b/],
  ['power_bank', /^(?:baterie externa|acumulator extern|power ?bank)\b/],
  [
    'accessory',
    /^(?:husa|huse|folie|folii|sticla|geam|protectie|cablu|cabluri|incarcator|incarcatoare|alimentator|adaptor|adaptoare|suport|stand|geanta|genti|rucsac|carcasa|bumper|toc|skin|stylus|creion|curea|curele|bratara|dock|docking|statie de andocare|hub|cititor|telecomanda|cartus|cartuse|toner|filtru|filtre|sac|saci|rezerva|rezerve|capete|lama|lame|mousepad|mouse pad|controller|controllers|controler|controlere|controllere|gamepad|gamepads|maneta|manete|volan|joystick|cooler laptop|ochelari 3d|sleeve|organizator|selfie|trepied|kit (?:curatare|accesorii)|set accesorii|set \d+ (?:controllere?s?|controlere?|manete|gamepads?|huse|folii|cabluri|incarcatoare)|grip|lanyard|snur)\b/,
  ],
  ['phone', /^(?:telefon|telefoane|smartphone)\b/],
  ['ereader', /^(?:e-?book(?: reader)?|e-reader|ebook reader|eink)\b/],
  ['tablet', /^tablet[ae]\b(?! grafic)/],
  ['laptop', /^(?:notebook|laptop|ultrabook|macbook)\b/],
  [
    'desktop',
    /^(?:sistem pc|sistem desktop|desktop|mini pc|pc |all[- ]in[- ]one|aio\b|calculator)/,
  ],
  ['monitor', /^monitor\b/],
  ['tv', /^(?:televizor|televizoare|tv\b|smart tv|led tv|oled tv|qled tv)/],
  [
    'console',
    /^(?:consola|console|(?:pachet|set|bundle|kit) (?:consola|ps5|ps4|playstation|xbox|nintendo|switch))\b/,
  ],
  ['gpu', /^placa video\b/],
  ['cpu', /^procesor\b/],
  ['motherboard', /^placa de baza\b/],
  ['usb_drive', /^(?:stick|memorie usb|flash drive|usb flash)\b/],
  ['memory_card', /^card (?:de )?memorie|^card (?:micro ?sd|sd|cf)\b/],
  [
    'ram',
    /^memori[ae] (?:ram|ddr|so-?dimm|dimm|kingston|corsair|g ?skill|gskill|crucial|patriot|teamgroup|adata|lexar|hyperx)|^memori[ae]\b.*\bddr\d/,
  ],
  ['storage', /^(?:ssd|hard ?disk|hard-disk|hdd|unitate ssd|nas|stocare)\b/],
  ['psu', /^sursa\b/],
  ['cooler', /^(?:cooler|ventilator(?! de)|sistem de racire|racire)\b/],
  ['headphones', /^(?:casti|headset)\b/],
  [
    'speaker',
    /^(?:boxa|boxe|soundbar|sistem audio|sistem hi-?fi|minisistem|pick-?up|amplificator)\b/,
  ],
  ['smartwatch', /^(?:smartwatch|ceas (?:inteligent|smartwatch|smart))\b/],
  ['peripheral', /^(?:mouse|tastatura|webcam|microfon|tableta grafica|scaun gaming)\b/],
  ['printer', /^(?:imprimanta|multifunctional[ae]|scanner)\b/],
  ['camera', /^(?:camera|aparat foto)\b/],
  ['drone', /^drona\b/],
  ['network', /^(?:router|sistem mesh|switch|access point|extender|repetor)\b/],
  ['washer_dryer', /^masina de spalat rufe cu uscator|^masina de spalat si uscat/],
  ['washer', /^masina de spalat rufe\b|^masina de spalat\b(?! vase)/],
  ['dryer', /^uscator de rufe\b/],
  ['dishwasher', /^masina de spalat vase\b/],
  ['microwave', /^(?:cuptor cu microunde|microunde)\b/],
  [
    'fridge',
    /^(?:frigider|combina frigorifica|lada frigorifica|congelator|vitrina frigorifica|racitor)\b/,
  ],
  ['oven', /^cuptor\b/],
  ['hob', /^plita\b/],
  ['hood', /^hota\b/],
  ['stove', /^aragaz\b/],
  ['air_conditioner', /^(?:aer conditionat|aparat de aer conditionat|aparat aer conditionat)\b/],
  ['water_heater', /^boiler\b/],
  ['vacuum', /^aspirator\b/],
  ['coffee', /^(?:espressor|cafetiera|filtru de cafea|rasnita)\b/],
  [
    'personal_care',
    /^(?:aparat de tuns|masina de tuns|periuta|placa de par|uscator de par|epilator|ondulator|trimmer|aparat de ras|cantar)\b/,
  ],
  [
    'kitchen',
    /^(?:friteuza|blender|mixer|robot de bucatarie|fierbator|toaster|prajitor|masina de paine|storcator|multicooker|grill|sandwich|statie de calcat|fier de calcat|purificator|set cutite|tigaie|oala)\b/,
  ],
  ['lighting', /^(?:bec|becuri|set \d+ becuri|kit .*\bbecuri\b|banda led|lampa|corp de iluminat)/],
  ['mobility', /^(?:trotineta|bicicleta|hoverboard|scuter)\b/],
];

/**
 * Product nouns accepted after a brand, seller or model prefix (words 2 to 6 of the first title
 * segment): "SweetLink S2 Plus Telefon mobil", "Kiano Slim TV Travel Televizor", "Miyoo Mini Plus
 * Consola", "Gaming Notebook", "HAPPY JOKER Controller". Only nouns that always name the product.
 */
const HEAD_RULES: ReadonlyArray<readonly [ProductKind, RegExp]> = [
  [
    'accessory',
    /^(?:husa|huse|folie|folii|controller|controllers|controler|controlere|controllere|gamepad|gamepads|maneta|manete)\b/,
  ],
  ['phone', /^(?:telefon|smartphone)\b/],
  ['laptop', /^(?:laptop|notebook|ultrabook|macbook)\b/],
  ['tablet', /^tableta\b(?! grafic)/],
  ['tv', /^televizor\b/],
  ['console', /^(?:consola|console|gameboy)\b/],
  ['smartwatch', /^smartwatch\b/],
  ['monitor', /^monitor\b/],
];

/** Accessory nouns that name the product only among the first three words ("Baseus Cablu …"). */
const EARLY_ACCESSORY =
  /^(?:sticla (?:de )?protectie|sticla securizata|cablu|incarcator|alimentator|adaptor|suport|geanta|rucsac|bumper|stylus|curea|dock|docking|hub|telecomanda|cartus|toner)\b/;

/** How far after the first word a head noun may stand (words 2..6). */
const HEAD_WINDOW = 5;

/**
 * Product lines that imply the kind when the title names no product noun ("Lenovo LOQ 15ARP9",
 * "PlayStation Portal Remote Player"). Tested on the title before any "pentru / compatibil /
 * emulator" phrase, so "Husă pentru iPhone" or "Emulator PSP PlayStation" never count.
 */
const LINE_RULES: ReadonlyArray<readonly [ProductKind, RegExp]> = [
  [
    'console',
    /\b(?:playstation(?: portal| [345]| vr2?)|ps[345]|xbox (?:series [xs]|one)|nintendo switch|switch (?:2|oled|lite)|steam deck|rog ally|legion go|msi claw|anbernic|retroid|miyoo|trimui|powkiddy|evercade)\b/,
  ],
  [
    'smartwatch',
    /\b(?:apple watch|galaxy watch|pixel watch|redmi watch|huawei watch|watch gt|watch fit|amazfit (?:gtr|gts|balance|active|bip|t-rex))\b/,
  ],
  ['fitness_band', /\b(?:mi band|smart band|galaxy fit|huawei band)\b/],
  ['headphones', /\b(?:airpods|galaxy buds|pixel buds|freebuds|redmi buds)\b/],
  [
    'tablet',
    /\b(?:ipad|galaxy tab|matepad|redmi pad|xiaomi pad|lenovo tab|idea tab|pixel tablet|surface pro)\b/,
  ],
  ['ereader', /\b(?:kindle|pocketbook|kobo)\b/],
  ['desktop', /\b(?:imac|mac mini|mac studio)\b/],
  [
    'laptop',
    /\b(?:macbook|thinkpad|thinkbook|ideapad|loq|vivobook|zenbook|expertbook|inspiron|latitude|vostro|elitebook|probook|victus|omnibook|zbook|chromebook|travelmate|extensa|matebook|galaxy book|surface laptop|katana|cyborg)\b/,
  ],
  [
    'phone',
    /\b(?:iphone|galaxy (?:[samz]|xcover) ?\d+|galaxy z (?:fold|flip)|pixel \d+|redmi note|redmi \d+[a-z]?|poco [a-z]?\d+|moto g\d+|motorola edge|nothing phone)\b/,
  ],
];

/** Where a compatibility or emulation phrase starts: product lines after it are not the product. */
const LINE_CUT =
  /\b(?:pentru|compatibil\w*|compatil|compatible|for|emulat\w*|emulare|emuleaza|suporta|jocuri din)\b/;

const CATEGORY_RULES: ReadonlyArray<readonly [ProductKind, RegExp]> = [
  ['accessory', /\b(?:accesorii|huse|folii|incarcatoare|cabluri|genti|rucsacuri|curele)\b/],
  ['game', /\bjocuri\b/],
  ['phone', /\b(?:telefoane|smartphone)/],
  ['tablet', /\btablete\b/],
  ['laptop', /\b(?:laptopuri|laptop|notebook)/],
  ['monitor', /\bmonitoare\b/],
  ['tv', /\b(?:televizoare|televizor)/],
  ['console', /\bconsole\b/],
  ['gpu', /\bplaci video\b/],
  ['cpu', /\bprocesoare\b/],
  ['ram', /\bmemorii ram\b|\bmemorie ram\b/],
  ['storage', /\b(?:ssd|hard disk|hdd)/],
  ['headphones', /\bcasti\b/],
  ['smartwatch', /\b(?:smartwatch|ceasuri)/],
  ['washer', /\bmasini de spalat rufe\b/],
  ['fridge', /\b(?:frigidere|combine frigorifice)/],
  ['vacuum', /\baspiratoare\b/],
];

/** "Telefoane mobile & accesorii", "Laptopuri si accesorii": a parent grouping, not accessories. */
const GROUPED_ACCESSORIES = /(?:\bsi|&|\band|,)\s*accesorii\b/;

/**
 * Kind named by the breadcrumb, leaf first. In each segment an accessory word wins ("Huse
 * telefoane"), unless the segment only groups a device family with its accessories; a segment
 * naming several kinds ("Console, Jocuri & Accesorii") defers to its parent.
 */
export function categoryKind(categoryHint: string | null | undefined): ProductKind | null {
  const c = foldLower(categoryHint);
  if (c === '') return null;
  const segments = c
    .split(/\s*(?:>|»|\|)\s*|\s+\/\s+/)
    .filter(Boolean)
    .reverse();
  for (const seg of segments) {
    const kinds = new Set<ProductKind>();
    for (const [kind, re] of CATEGORY_RULES) if (re.test(seg)) kinds.add(kind);
    if (kinds.has('accessory') && !GROUPED_ACCESSORIES.test(seg)) return 'accessory';
    kinds.delete('accessory');
    if (kinds.size === 1) return [...kinds][0] as ProductKind;
  }
  return null;
}

function headNoun(t: string): { kind: ProductKind; word: string } | null {
  const segment = t.split(/\s*[,|;(]\s*|\s+[-–]\s+/)[0] ?? '';
  const words = segment.split(/\s+/).filter(Boolean);
  for (let i = 1; i <= HEAD_WINDOW && i < words.length; i++) {
    const rest = words.slice(i).join(' ');
    const word = words[i] as string;
    for (const [kind, re] of HEAD_RULES) if (re.test(rest)) return { kind, word };
    if (i <= 2 && EARLY_ACCESSORY.test(rest)) return { kind: 'accessory', word };
  }
  return null;
}

/** "… pentru iPhone", "compatibil cu PS5": the title names the device the product is for. */
const COMPAT_TARGETS =
  /\b(?:pentru|compatibil[aei]?\s+cu|compatible with|for)\s+(?:telefon\w*|smartphone\w*|laptop\w*|tablet\w*|iphone|ipad|samsung|galaxy|apple|xiaomi|redmi|huawei|honor|motorola|oppo|oneplus|google|pixel|playstation|ps5|ps4|xbox|nintendo|switch|macbook|airpods|apple watch|kindle|dyson|gopro|garmin|consola|ceas\w*|smartwatch)\b/;

/** Kind implied by a product line named before any "pentru / compatibil / emulator" phrase. */
export function lineKind(title: string | null | undefined): ProductKind | null {
  const t = foldLower(title);
  const cut = LINE_CUT.exec(t);
  const head = cut ? t.slice(0, cut.index) : t;
  let best: { kind: ProductKind; at: number } | null = null;
  for (const [kind, re] of LINE_RULES) {
    const m = re.exec(head);
    if (m && (best === null || m.index < best.at)) best = { kind, at: m.index };
  }
  return best?.kind ?? null;
}

/** Which rule decided the kind (see `detectProductKind`). */
export type ProductKindVia = 'title' | 'head' | 'compat' | 'category' | 'line' | 'none';

export interface ProductKindExplained {
  kind: ProductKind;
  via: ProductKindVia;
  /** The deciding word for `title`/`head` ("telefon", "controller"), else null. */
  word: string | null;
}

/**
 * Kind of product and the rule that decided it, in this order:
 * 1. `title`: the noun the title starts with ("Telefon mobil …", "Husă …", "Consolă …");
 * 2. `head`: a product noun among words 2–6 of the first title segment, after a brand, seller or
 *    model prefix ("SweetLink S2 Plus Telefon mobil", "Gaming Notebook", "HAPPY JOKER
 *    Controller"); a device noun found there yields to an accessory breadcrumb;
 * 3. `compat`: "… pentru / compatibil cu <device or brand>" → accessory;
 * 4. `category`: the breadcrumb, leaf first ("… > Laptopuri si accesorii > Notebook" → laptop);
 * 5. `line`: a product line (MacBook, iPhone, Galaxy Tab, Apple Watch, PlayStation Portal …);
 * 6. `none`: `other`.
 * Negations never name the product ("…, Fără încărcător").
 */
export function explainProductKind(
  title: string | null | undefined,
  categoryHint?: string | null,
): ProductKindExplained {
  const t = foldLower(title)
    .replace(/^(?:nou|noua|new|promo|oferta)[!:\s-]+/, '')
    .replace(/\b(?:fara|without)\s+[a-z0-9-]+/g, ' ');
  for (const [kind, re] of TITLE_RULES) {
    if (re.test(t)) return { kind, via: 'title', word: /^[a-z0-9]+/.exec(t)?.[0] ?? null };
  }
  const fromCategory = categoryKind(categoryHint);
  const head = headNoun(t);
  if (head !== null) {
    if (head.kind !== 'accessory' && fromCategory === 'accessory') {
      return { kind: 'accessory', via: 'category', word: null };
    }
    return { kind: head.kind, via: 'head', word: head.word };
  }
  if (COMPAT_TARGETS.test(t)) return { kind: 'accessory', via: 'compat', word: null };
  if (fromCategory !== null) return { kind: fromCategory, via: 'category', word: null };
  const line = lineKind(t);
  if (line !== null) return { kind: line, via: 'line', word: null };
  return { kind: 'other', via: 'none', word: null };
}

/** Kind of product (see `explainProductKind` for the order of the rules). */
export function detectProductKind(
  title: string | null | undefined,
  categoryHint?: string | null,
): ProductKind {
  return explainProductKind(title, categoryHint).kind;
}

/** Kinds whose titles name a host device the product is *for*, not the product itself. */
export function isAccessoryKind(kind: ProductKind): boolean {
  return kind === 'accessory';
}
