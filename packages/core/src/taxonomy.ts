/**
 * Launch taxonomy (electronics, IT, appliances) and the categorizer used by matching (category
 * compatibility) and by category pages (M14). Romanian shop titles start with a very consistent
 * product noun ("Telefon mobil …", "Mașină de spălat rufe …"), so the title prefix decides; the
 * shop's breadcrumb is the fallback. Inputs are ASCII-folded and lower-cased.
 */

export interface TaxonomyNode {
  slug: string;
  nameRo: string;
  nameEn: string;
  parent: string | null;
  /** Patterns tested against the ASCII-folded, lower-cased title. */
  title?: RegExp[];
  /** Keywords tested against the ASCII-folded, lower-cased breadcrumb (last segment first). */
  crumbs?: RegExp[];
}

export const TAXONOMY: TaxonomyNode[] = [
  { slug: 'telefoane-tablete', nameRo: 'Telefoane și tablete', nameEn: 'Phones and tablets', parent: null },
  { slug: 'telefoane-mobile', nameRo: 'Telefoane mobile', nameEn: 'Mobile phones', parent: 'telefoane-tablete', title: [/^(telefon mobil|smartphone)\b/, /^telefon\b(?! fix)/, /^(apple )?iphone\b/], crumbs: [/telefoane mobile|smartphone/] },
  { slug: 'tablete', nameRo: 'Tablete', nameEn: 'Tablets', parent: 'telefoane-tablete', title: [/^tablet[a]?\b/, /^(apple )?ipad\b/], crumbs: [/^tablete$|tablete\b(?! grafice)/] },
  { slug: 'smartwatch', nameRo: 'Smartwatch', nameEn: 'Smartwatches', parent: 'telefoane-tablete', title: [/^(smartwatch|ceas (inteligent|smart))\b/, /^(apple watch|samsung galaxy watch)\b/], crumbs: [/smartwatch|ceasuri inteligente/] },
  { slug: 'bratari-fitness', nameRo: 'Brățări fitness', nameEn: 'Fitness trackers', parent: 'telefoane-tablete', title: [/^bratara (fitness|inteligenta|smart)\b/], crumbs: [/bratari fitness/] },

  { slug: 'laptopuri-pc', nameRo: 'Laptopuri și PC', nameEn: 'Laptops and PC', parent: null },
  { slug: 'laptopuri', nameRo: 'Laptopuri', nameEn: 'Laptops', parent: 'laptopuri-pc', title: [/^(laptop|notebook|ultrabook)\b/, /^(apple )?macbook\b/], crumbs: [/^laptopuri?$|laptopuri\b/] },
  { slug: 'monitoare', nameRo: 'Monitoare', nameEn: 'Monitors', parent: 'laptopuri-pc', title: [/^monitor\b(?! (audio|video) bebelusi)/], crumbs: [/^monitoare\b(?! (audio|video))/] },
  { slug: 'placi-video', nameRo: 'Plăci video', nameEn: 'Graphics cards', parent: 'laptopuri-pc', title: [/^placa video\b/], crumbs: [/placi video/] },
  { slug: 'procesoare', nameRo: 'Procesoare', nameEn: 'CPUs', parent: 'laptopuri-pc', title: [/^procesor\b/], crumbs: [/^procesoare\b/] },
  { slug: 'stocare', nameRo: 'SSD și hard disk-uri', nameEn: 'Storage', parent: 'laptopuri-pc', title: [/^(ssd|solid state drive|hard disk|hdd)\b/], crumbs: [/solid.state|ssd|hard disk/] },
  { slug: 'memorii-ram', nameRo: 'Memorii RAM', nameEn: 'RAM', parent: 'laptopuri-pc', title: [/^memorie( ram)?\b(?! usb| card| microsd| sd)/], crumbs: [/^memorii( ram)?$|memorii (notebook|desktop)/] },
  { slug: 'placi-de-baza', nameRo: 'Plăci de bază', nameEn: 'Motherboards', parent: 'laptopuri-pc', title: [/^placa de baza\b/], crumbs: [/placi de baza/] },
  { slug: 'surse-pc', nameRo: 'Surse PC', nameEn: 'PC power supplies', parent: 'laptopuri-pc', title: [/^sursa( pc| de alimentare)?\b/], crumbs: [/^surse( pc)?$/] },
  { slug: 'carcase-pc', nameRo: 'Carcase PC', nameEn: 'PC cases', parent: 'laptopuri-pc', title: [/^carcasa( pc)?\b(?! (telefon|tableta|laptop))/], crumbs: [/^carcase$/] },
  { slug: 'mouse', nameRo: 'Mouse', nameEn: 'Mice', parent: 'laptopuri-pc', title: [/^mouse\b/], crumbs: [/^mouse$/] },
  { slug: 'tastaturi', nameRo: 'Tastaturi', nameEn: 'Keyboards', parent: 'laptopuri-pc', title: [/^tastatura\b/], crumbs: [/^tastaturi$/] },
  { slug: 'imprimante', nameRo: 'Imprimante', nameEn: 'Printers', parent: 'laptopuri-pc', title: [/^(imprimanta|multifunctionala)\b/], crumbs: [/imprimante/] },
  { slug: 'routere', nameRo: 'Routere și mesh', nameEn: 'Routers', parent: 'laptopuri-pc', title: [/^(router|sistem mesh)\b/], crumbs: [/routere?/] },

  { slug: 'tv-audio', nameRo: 'TV și audio', nameEn: 'TV and audio', parent: null },
  { slug: 'televizoare', nameRo: 'Televizoare', nameEn: 'TVs', parent: 'tv-audio', title: [/^(televizor|tv)\b/], crumbs: [/^televizoare\b/] },
  { slug: 'casti', nameRo: 'Căști', nameEn: 'Headphones', parent: 'tv-audio', title: [/^(casti|headset)\b/, /^(apple )?airpods\b/], crumbs: [/^casti\b/] },
  { slug: 'boxe-portabile', nameRo: 'Boxe portabile', nameEn: 'Portable speakers', parent: 'tv-audio', title: [/^boxa\b/], crumbs: [/boxe portabile|^boxe$/] },
  { slug: 'soundbar', nameRo: 'Soundbar', nameEn: 'Soundbars', parent: 'tv-audio', title: [/^soundbar\b/], crumbs: [/soundbar/] },

  { slug: 'gaming', nameRo: 'Gaming', nameEn: 'Gaming', parent: null },
  { slug: 'console', nameRo: 'Console', nameEn: 'Consoles', parent: 'gaming', title: [/^consola\b/], crumbs: [/^console\b/] },
  { slug: 'jocuri', nameRo: 'Jocuri', nameEn: 'Video games', parent: 'gaming', title: [/^joc\b/], crumbs: [/jocuri (consola|pc|video)/] },

  { slug: 'electrocasnice-mari', nameRo: 'Electrocasnice mari', nameEn: 'Large appliances', parent: null },
  { slug: 'masini-de-spalat-rufe', nameRo: 'Mașini de spălat rufe', nameEn: 'Washing machines', parent: 'electrocasnice-mari', title: [/^masina de spalat( rufe)?\b(?! vase)/], crumbs: [/masini de spalat rufe|masini spalat rufe/] },
  { slug: 'frigidere', nameRo: 'Frigidere și combine', nameEn: 'Fridges', parent: 'electrocasnice-mari', title: [/^(frigider|combina frigorifica)\b/], crumbs: [/frigidere|combine frigorifice/] },
  { slug: 'masini-de-spalat-vase', nameRo: 'Mașini de spălat vase', nameEn: 'Dishwashers', parent: 'electrocasnice-mari', title: [/^masina de spalat vase\b/], crumbs: [/masini de spalat vase|masini spalat vase/] },
  { slug: 'uscatoare-de-rufe', nameRo: 'Uscătoare de rufe', nameEn: 'Tumble dryers', parent: 'electrocasnice-mari', title: [/^uscator de rufe\b/], crumbs: [/uscatoare (de )?rufe/] },
  { slug: 'congelatoare', nameRo: 'Congelatoare', nameEn: 'Freezers', parent: 'electrocasnice-mari', title: [/^(congelator|lada frigorifica)\b/], crumbs: [/congelatoare/] },
  { slug: 'cuptoare-incorporabile', nameRo: 'Cuptoare încorporabile', nameEn: 'Built-in ovens', parent: 'electrocasnice-mari', title: [/^cuptor (electric )?incorporabil\b/], crumbs: [/cuptoare incorporabile/] },
  { slug: 'plite', nameRo: 'Plite', nameEn: 'Hobs', parent: 'electrocasnice-mari', title: [/^plita\b/], crumbs: [/^plite\b/] },
  { slug: 'hote', nameRo: 'Hote', nameEn: 'Cooker hoods', parent: 'electrocasnice-mari', title: [/^hota\b/], crumbs: [/^hote$/] },

  { slug: 'electrocasnice-mici', nameRo: 'Electrocasnice mici', nameEn: 'Small appliances', parent: null },
  { slug: 'aspiratoare', nameRo: 'Aspiratoare', nameEn: 'Vacuum cleaners', parent: 'electrocasnice-mici', title: [/^(aspirator|robot (de )?aspirare)\b/], crumbs: [/^aspiratoare\b(?! (auto|nazale|piscina))/] },
  { slug: 'espressoare', nameRo: 'Espressoare și aparate de cafea', nameEn: 'Coffee machines', parent: 'electrocasnice-mici', title: [/^(espressor|expresor|aparat de cafea|cafetiera)\b/], crumbs: [/espressoare|cafetiere/] },
  { slug: 'friteuze', nameRo: 'Friteuze', nameEn: 'Fryers', parent: 'electrocasnice-mici', title: [/^friteuza\b/], crumbs: [/friteuze/] },
  { slug: 'cuptoare-cu-microunde', nameRo: 'Cuptoare cu microunde', nameEn: 'Microwaves', parent: 'electrocasnice-mici', title: [/^cuptor cu microunde\b/], crumbs: [/microunde/] },
  { slug: 'fierbatoare', nameRo: 'Fierbătoare', nameEn: 'Kettles', parent: 'electrocasnice-mici', title: [/^fierbator\b/], crumbs: [/fierbatoare/] },
  { slug: 'blendere', nameRo: 'Blendere', nameEn: 'Blenders', parent: 'electrocasnice-mici', title: [/^blender\b/], crumbs: [/blendere/] },
  { slug: 'roboti-de-bucatarie', nameRo: 'Roboți de bucătărie', nameEn: 'Food processors', parent: 'electrocasnice-mici', title: [/^robot de bucatarie\b/], crumbs: [/roboti (de )?bucatarie/] },
  { slug: 'multicookere', nameRo: 'Multicookere', nameEn: 'Multicookers', parent: 'electrocasnice-mici', title: [/^multicooker\b/], crumbs: [/multicooker/] },
  { slug: 'purificatoare', nameRo: 'Purificatoare de aer', nameEn: 'Air purifiers', parent: 'electrocasnice-mici', title: [/^purificator\b/], crumbs: [/purificatoare/] },

  { slug: 'mobilitate', nameRo: 'Mobilitate electrică', nameEn: 'E-mobility', parent: null },
  { slug: 'trotinete-electrice', nameRo: 'Trotinete electrice', nameEn: 'E-scooters', parent: 'mobilitate', title: [/^trotineta electrica\b/], crumbs: [/trotinete electrice/] },
];

const BY_SLUG = new Map(TAXONOMY.map((n) => [n.slug, n]));

export function taxonomyNode(slug: string): TaxonomyNode | undefined {
  return BY_SLUG.get(slug);
}

/** Materialized path, e.g. `telefoane-tablete/telefoane-mobile`. */
export function taxonomyPath(slug: string): string {
  const parts: string[] = [];
  let n = BY_SLUG.get(slug);
  while (n) {
    parts.unshift(n.slug);
    n = n.parent ? BY_SLUG.get(n.parent) : undefined;
  }
  return parts.join('/');
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șşȘŞ]/g, 's')
    .replace(/[țţȚŢ]/g, 't')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Leaf category slug for an offer, or null (accessories and everything outside the launch scope).
 * Title prefixes win over breadcrumbs; accessories never get a device category.
 */
export function categorize(title: string, categoryRaw?: string | null, opts: { isAccessory?: boolean } = {}): string | null {
  if (opts.isAccessory) return null;
  const t = fold(title);
  for (const node of TAXONOMY) {
    if (node.title?.some((re) => re.test(t))) return node.slug;
  }
  if (categoryRaw) {
    const segments = categoryRaw.split(/>|\/|»|\|/).map(fold).filter(Boolean).reverse();
    for (const seg of segments) {
      for (const node of TAXONOMY) {
        if (node.crumbs?.some((re) => re.test(seg))) return node.slug;
      }
    }
  }
  return null;
}

/** Two leaf categories are compatible when equal, or when either is unknown. */
export function categoriesCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  return !a || !b || a === b;
}
