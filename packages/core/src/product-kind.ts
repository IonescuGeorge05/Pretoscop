/**
 * Coarse product kind from the product noun that Romanian shop titles start with ("Telefon mobil
 * …", "Masina de spalat rufe …", "Husa …"), with the shop category as a fallback. Pure.
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
    /^(?:husa|huse|folie|folii|sticla|geam|protectie|cablu|cabluri|incarcator|incarcatoare|alimentator|adaptor|adaptoare|suport|stand|geanta|genti|rucsac|carcasa|bumper|toc|skin|stylus|creion|curea|curele|bratara|dock|docking|statie de andocare|hub|cititor|telecomanda|cartus|cartuse|toner|filtru|filtre|sac|saci|rezerva|rezerve|capete|lama|lame|mousepad|mouse pad|controller|controler|gamepad|maneta|manete|volan|joystick|cooler laptop|ochelari 3d|sleeve|organizator|selfie|trepied|kit (?:curatare|accesorii)|set accesorii|grip)\b/,
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
    /^(?:consola|(?:pachet|set|bundle|kit) (?:consola|ps5|ps4|playstation|xbox|nintendo|switch))\b/,
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

/**
 * Kind of product from the start of a title; when the title starts with nothing known, the shop's
 * category path decides; else `other`.
 */
export function detectProductKind(
  title: string | null | undefined,
  categoryHint?: string | null,
): ProductKind {
  const t = foldLower(title).replace(/^(?:nou|noua|new|promo|oferta)[!:\s-]+/, '');
  for (const [kind, re] of TITLE_RULES) if (re.test(t)) return kind;
  const c = foldLower(categoryHint);
  if (c !== '') for (const [kind, re] of CATEGORY_RULES) if (re.test(c)) return kind;
  return 'other';
}

/** Kinds whose titles name a host device the product is *for*, not the product itself. */
export function isAccessoryKind(kind: ProductKind): boolean {
  return kind === 'accessory';
}
