/**
 * Taxonomy and the categorizer used by matching (category compatibility) and by category pages
 * (M14). Launch subtrees (electronics, IT, appliances): Romanian shop titles start with a very
 * consistent product noun ("Telefon mobil …", "Mașină de spălat rufe …"), so the title prefix
 * decides; the shop's breadcrumb is the fallback. Category expansion (M29) adds the books and beauty
 * subtrees: an offer is first assigned a vertical (`detectVertical`: ISBN, breadcrumb, fragrance or
 * cosmetics noun) and then categorized inside that subtree only, so launch offers keep their
 * categories. Inputs are ASCII-folded and lower-cased.
 */
import { crumbSegments, detectVertical, type Vertical } from './verticals';

export interface TaxonomyNode {
  slug: string;
  nameRo: string;
  nameEn: string;
  parent: string | null;
  /** Patterns tested against the ASCII-folded, lower-cased title. */
  title?: RegExp[];
  /** Keywords tested against the ASCII-folded, lower-cased breadcrumb (last segment first). */
  crumbs?: RegExp[];
  /** Set on the nodes of a category-expansion subtree (M29); absent on the launch taxonomy. */
  vertical?: Vertical;
  /**
   * On a vertical's root: its children are genres that shops assign differently (Libris files Harry
   * Potter under "Beletristică", Elefant under "Cărți pentru copii"), so any two of them are
   * compatible for matching; the identifier (ISBN) decides.
   */
  looseChildren?: boolean;
  /**
   * Audience or format nodes (children's books, young adult, comics, textbooks, foreign-language
   * books) win wherever they appear in the breadcrumb: "Cărți pentru copii > Literatură fantasy" is
   * a children's book, not fiction. Other nodes are tried leaf first.
   */
  audience?: boolean;
  /**
   * Title patterns tried after the other nodes' (fragrances: "Gel de duș Dior Sauvage" is body
   * care, "Dior Sauvage Parfum" a fragrance).
   */
  titleLast?: boolean;
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

  // ---- M29: books (vertical `books`; categorized from the breadcrumb, never from the title) ----
  { slug: 'carti', nameRo: 'Cărți', nameEn: 'Books', parent: null, vertical: 'books', looseChildren: true },
  { slug: 'carti-pentru-copii', nameRo: 'Cărți pentru copii', nameEn: "Children's books", parent: 'carti', vertical: 'books', audience: true, crumbs: [/\b(?:carti|carte|literatura) (?:pentru|de) copii\b|\bcopii\b|\bpovesti\b|\bbasme\b|carti de colorat|carti cu activitati|carte prescolara|children s books|childrens books/] },
  { slug: 'young-adult', nameRo: 'Cărți pentru adolescenți', nameEn: 'Young adult', parent: 'carti', vertical: 'books', audience: true, crumbs: [/young adult|adolescenti|\bteen/] },
  { slug: 'benzi-desenate-manga', nameRo: 'Benzi desenate și manga', nameEn: 'Comics and manga', parent: 'carti', vertical: 'books', audience: true, crumbs: [/benzi desenate|\bmanga\b|roman grafic|graphic novels?|comics/] },
  { slug: 'beletristica', nameRo: 'Beletristică', nameEn: 'Fiction', parent: 'carti', vertical: 'books', crumbs: [/beletristica|fictiune|\bfiction\b|\bromane?\b|^literatura\b|\bsf\b|science fiction|fantasy|thriller|politiste|politist|horror|poezie|poezii|teatru|nuvele|povestiri|proza|aventura/] },
  { slug: 'dezvoltare-personala', nameRo: 'Dezvoltare personală', nameEn: 'Personal development', parent: 'carti', vertical: 'books', crumbs: [/dezvoltare personala|self help|autoajutor|motivational/] },
  { slug: 'biografii-memorii', nameRo: 'Biografii și memorii', nameEn: 'Biographies and memoirs', parent: 'carti', vertical: 'books', crumbs: [/biografii|memorii|jurnale|autobiografi|biograph/] },
  { slug: 'istorie', nameRo: 'Istorie', nameEn: 'History', parent: 'carti', vertical: 'books', crumbs: [/\bistorie\b|\bhistory\b/] },
  { slug: 'stiinte-umaniste', nameRo: 'Științe umaniste', nameEn: 'Humanities', parent: 'carti', vertical: 'books', crumbs: [/stiinte umaniste|filosofie|filozofie|filologie|psihologie|sociologie|pedagogie|antropologie|stiinte politice|lingvistica|philosophy|psychology/] },
  { slug: 'stiinta-tehnica', nameRo: 'Știință și tehnică', nameEn: 'Science and technology', parent: 'carti', vertical: 'books', crumbs: [/^stiinte$|stiinta|tehnica|\bit\b|computere|calculatoare|programare|matematica|fizica|chimie|biologie|medicina|farmacie|\bscience\b|technology|computing/] },
  { slug: 'afaceri-economie', nameRo: 'Afaceri și economie', nameEn: 'Business and economics', parent: 'carti', vertical: 'books', crumbs: [/afaceri|economie|business|finante|marketing|management|contabilitate|antreprenoriat/] },
  { slug: 'religie-spiritualitate', nameRo: 'Religie și spiritualitate', nameEn: 'Religion and spirituality', parent: 'carti', vertical: 'books', crumbs: [/religie|spiritualitate|ezoterism|teologie|ortodox|religion|spirituality/] },
  { slug: 'sanatate-hobby', nameRo: 'Sănătate, gastronomie și hobby', nameEn: 'Health, cooking and hobbies', parent: 'carti', vertical: 'books', crumbs: [/sanatate|nutritie|gastronomie|culinar|retete|bucatarie|hobby|practic|gradinarit|\bsport\b|calatorii|ghiduri|harti|cresterea copilului|parenting|cookbooks?|\bhealth\b/] },
  { slug: 'arta-arhitectura', nameRo: 'Artă și arhitectură', nameEn: 'Art and architecture', parent: 'carti', vertical: 'books', crumbs: [/\barta\b|arhitectura|\bdesign\b|fotografie|muzica|\bfilm\b|\bart\b|architecture/] },
  { slug: 'manuale-dictionare', nameRo: 'Manuale, dicționare și limbi străine', nameEn: 'Textbooks, dictionaries and languages', parent: 'carti', vertical: 'books', audience: true, crumbs: [/manuale|carte scolara|auxiliare|culegeri|bacalaureat|admitere|dictionare|enciclopedii|limbi straine|\bdrept\b|juridic|textbooks?/] },
  { slug: 'carti-limbi-straine', nameRo: 'Cărți în limbi străine', nameEn: 'Books in other languages', parent: 'carti', vertical: 'books', audience: true, crumbs: [/carti in (?:limba )?(?:engleza|franceza|germana|maghiara|italiana|spaniola)|carte straina|english books|foreign books|^books$/] },

  // ---- M29: beauty (vertical `beauty`; prepared: no live source yet, feeds only) ----
  { slug: 'frumusete', nameRo: 'Frumusețe și parfumuri', nameEn: 'Beauty and fragrances', parent: null, vertical: 'beauty' },
  { slug: 'parfumuri', nameRo: 'Parfumuri', nameEn: 'Fragrances', parent: 'frumusete', vertical: 'beauty', title: [/\b(?:apa de (?:parfum|toaleta|colonie)|eau de (?:parfum|toilette|cologne)|extrait de parfum|elixir de parfum|body mist)\b|^(?:(?:set(?: cadou)?|tester|mini) )?parfum(?:uri)?\b|\bparfum\b|\b(?:edp|edt|edc)\b/], crumbs: [/parfum|fragrance/], titleLast: true },
  { slug: 'machiaj', nameRo: 'Machiaj', nameEn: 'Make-up', parent: 'frumusete', vertical: 'beauty', title: [/^(?:(?:set(?: cadou)?|tester|mini) )?(?:ruj|mascara|rimel|pudra|fard|blush|bronzer|eyeliner|concealer|oja|dermatograf)\b|\b(?:luciu de buze|fond de ten|paleta de farduri|creion (?:de )?(?:ochi|buze|sprancene)|tus de ochi|baza de machiaj|lac de unghii|iluminator facial)\b/], crumbs: [/machiaj|make ?up|unghii/] },
  { slug: 'ingrijire-ten', nameRo: 'Îngrijirea tenului', nameEn: 'Skin care', parent: 'frumusete', vertical: 'beauty', title: [/^(?:(?:set(?: cadou)?|mini) )?demachiant\b|\b(?:crema (?:de |pentru )?(?:fata|ten|zi|noapte|ochi)|crema antirid|ser (?:facial|pentru fata|de fata|pentru ten)|masca (?:de |pentru )?(?:fata|ten)|apa micelara|lotiune tonica)\b/], crumbs: [/\bten\b|tenului|\bfetei\b|\bfata\b|dermato ?cosmetice|skin ?care/] },
  { slug: 'ingrijire-par', nameRo: 'Îngrijirea părului', nameEn: 'Hair care', parent: 'frumusete', vertical: 'beauty', title: [/^(?:(?:set(?: cadou)?|mini) )?sampon\b|\b(?:balsam (?:de |pentru )par|masca (?:de |pentru )par|vopsea (?:de |pentru )par|ulei (?:de |pentru )par|ser (?:de |pentru )par|spray (?:de |pentru )par|fixativ)\b/], crumbs: [/\bpar\b|parului|hair ?care/] },
  { slug: 'ingrijire-corp', nameRo: 'Îngrijirea corpului', nameEn: 'Body care', parent: 'frumusete', vertical: 'beauty', title: [/^(?:(?:set(?: cadou)?|mini) )?(?:deodorant|antiperspirant|sapun|autobronzant)\b|\b(?:gel de dus|spuma de baie|unt de corp|ulei de corp|lotiune (?:de |pentru )corp|crema (?:de |pentru )?(?:corp|maini))\b/], crumbs: [/\bcorp\b|corpului|baie si dus|deodorante|body ?care/] },
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

/** The launch taxonomy only (what the M22 category prompt v1 lists; its fingerprint is pinned). */
export const LAUNCH_TAXONOMY: TaxonomyNode[] = TAXONOMY.filter((n) => !n.vertical);

function verticalNodes(v: Vertical): TaxonomyNode[] {
  return TAXONOMY.filter((n) => n.vertical === v);
}

/** The root slug of a vertical's subtree. */
export function verticalRoot(v: Vertical): string {
  return TAXONOMY.find((n) => n.vertical === v && n.parent === null)!.slug;
}

/** The vertical a category slug belongs to (null for the launch taxonomy and unknown slugs). */
export function categoryVertical(slug: string | null | undefined): Vertical | null {
  return (slug ? BY_SLUG.get(slug)?.vertical : undefined) ?? null;
}

export interface CategorizeOptions {
  isAccessory?: boolean;
  /** The offer's valid GTIN-14: an ISBN (978/979) makes it a book whatever the breadcrumb. */
  gtin14?: string | null;
}

function categorizeIn(v: Vertical, t: string, segments: string[]): string {
  const nodes = verticalNodes(v).filter((n) => n.parent !== null);
  const byTitle = [...nodes.filter((n) => !n.titleLast), ...nodes.filter((n) => n.titleLast)];
  for (const node of byTitle) if (node.title?.some((re) => re.test(t))) return node.slug;
  for (const node of nodes) if (node.audience && segments.some((seg) => node.crumbs?.some((re) => re.test(seg)))) return node.slug;
  for (const seg of segments) {
    for (const node of nodes) if (node.crumbs?.some((re) => re.test(seg))) return node.slug;
  }
  return verticalRoot(v);
}

/**
 * Category slug for an offer, or null (accessories and everything outside the taxonomy). Books
 * and beauty offers (`detectVertical`) get a node of their subtree, the subtree's root when no
 * child fits. Launch offers: title prefixes win over breadcrumbs; accessories never get a device
 * category.
 */
export function categorize(title: string, categoryRaw?: string | null, opts: CategorizeOptions = {}): string | null {
  if (opts.isAccessory) return null;
  const t = fold(title);
  const segments = crumbSegments(categoryRaw);
  const vertical = detectVertical({ title, categoryRaw, gtin14: opts.gtin14 ?? null });
  if (vertical) return categorizeIn(vertical, t, segments);
  for (const node of LAUNCH_TAXONOMY) {
    if (node.title?.some((re) => re.test(t))) return node.slug;
  }
  for (const seg of segments) {
    for (const node of LAUNCH_TAXONOMY) {
      if (node.crumbs?.some((re) => re.test(seg))) return node.slug;
    }
  }
  return null;
}

/** The root of a node's subtree when that root declares its children compatible (books). */
function looseRoot(slug: string): string | null {
  const n = BY_SLUG.get(slug);
  if (!n) return null;
  const root = n.parent ? BY_SLUG.get(n.parent) : n;
  return root?.looseChildren ? root.slug : null;
}

/**
 * Two categories are compatible when equal, when either is unknown, or when both lie in a subtree
 * whose root has `looseChildren` (any two book genres, or a genre and the books root).
 */
export function categoriesCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a === b) return true;
  const ra = looseRoot(a);
  if (ra !== null && ra === looseRoot(b)) return true;
  // A vertical's root is "this vertical, subcategory unknown": compatible with its own children.
  const na = BY_SLUG.get(a);
  const nb = BY_SLUG.get(b);
  if (!na?.vertical || na.vertical !== nb?.vertical) return false;
  return (na.parent === null && nb.parent === a) || (nb.parent === null && na.parent === b);
}
