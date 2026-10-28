/**
 * Curated synonyms (docs/03 §6.6, ADR-014). Meilisearch has no Romanian stemmer, so plurals and the
 * common alternative names of a product type are listed here. Every term is ASCII-folded and lower
 * case (Meilisearch folds ș/ş, ț/ţ, ă, â, î in documents and queries the same way).
 *
 * Rules for editing:
 * - A group is two-way: each term finds the others. Put a term in at most one group.
 * - Only add a word that cannot mean something else in electronics/appliance titles ("ac" would
 *   also match "adaptor AC", so air conditioners use the long forms only).
 * - Colours map Romanian ↔ English because shop titles mostly keep the manufacturer's English
 *   colour name ("Awesome Black") while people search in Romanian ("negru").
 * - `ONE_WAY` entries widen a query without the reverse (searching "ps5 slim" should find "PlayStation 5
 *   Slim", but "playstation" alone should not be rewritten).
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // Phones, tablets, wearables
  ['telefon', 'telefoane', 'smartphone', 'smartphoneuri', 'telefon mobil', 'telefoane mobile'],
  ['tableta', 'tablete', 'tablet'],
  ['smartwatch', 'smartwatchuri', 'ceas inteligent', 'ceasuri inteligente', 'ceas smart'],
  ['bratara fitness', 'bratari fitness', 'fitness tracker'],
  ['incarcator', 'incarcatoare', 'charger'],
  ['husa', 'huse'],
  ['folie', 'folii'],
  ['powerbank', 'power bank', 'baterie externa', 'baterii externe'],

  // Computers and components
  ['laptop', 'laptopuri', 'notebook', 'notebookuri'],
  ['calculator', 'calculatoare', 'desktop', 'unitate centrala', 'unitati centrale'],
  ['monitor', 'monitoare'],
  ['placa video', 'placi video', 'video card'],
  ['procesor', 'procesoare'],
  ['hard disk', 'hard diskuri', 'hdd'],
  ['memorie ram', 'memorii ram'],
  ['placa de baza', 'placi de baza', 'motherboard'],
  ['sursa pc', 'surse pc', 'sursa de alimentare', 'psu'],
  ['carcasa pc', 'carcase pc'],
  ['mouse', 'mouse-uri', 'mausi', 'soricel'],
  ['tastatura', 'tastaturi', 'keyboard'],
  ['imprimanta', 'imprimante', 'printer', 'multifunctionala', 'multifunctionale'],
  ['router', 'routere', 'ruter'],
  ['sistem mesh', 'sisteme mesh', 'mesh wifi'],
  ['stick usb', 'stickuri usb', 'memorie usb', 'flash drive'],
  ['webcam', 'camera web', 'camere web'],

  // TV and audio
  ['televizor', 'televizoare', 'tv'],
  ['casti', 'casca', 'headset', 'headphones'],
  ['boxa', 'boxe', 'difuzor', 'difuzoare', 'speaker', 'boxa portabila', 'boxe portabile'],
  ['soundbar', 'soundbaruri', 'bara de sunet'],
  ['videoproiector', 'videoproiectoare', 'proiector', 'proiectoare'],

  // Gaming
  ['consola', 'console'],
  ['joc', 'jocuri'],
  ['ps5', 'playstation 5', 'play station 5'],
  ['ps4', 'playstation 4', 'play station 4'],
  ['controller', 'controllere', 'gamepad', 'maneta', 'manete'],
  ['playstation', 'play station'],

  // Large appliances
  ['frigider', 'frigidere', 'combina frigorifica', 'combine frigorifice'],
  ['side by side', 'side-by-side', 'sbs'],
  ['masina de spalat', 'masini de spalat'],
  ['masina de spalat vase', 'masini de spalat vase'],
  ['uscator de rufe', 'uscatoare de rufe', 'uscator rufe'],
  ['congelator', 'congelatoare', 'lada frigorifica', 'lazi frigorifice'],
  ['cuptor', 'cuptoare'],
  ['incorporabil', 'incorporabila', 'incorporabile', 'built-in'],
  ['plita', 'plite'],
  ['hota', 'hote'],
  ['aragaz', 'aragazuri'],
  ['aer conditionat', 'aparat de aer conditionat', 'aparate de aer conditionat', 'climatizor'],

  // Small appliances
  ['aspirator', 'aspiratoare'],
  ['robot de aspirare', 'roboti de aspirare', 'aspirator robot', 'robot aspirator'],
  ['espressor', 'espressoare', 'expresor', 'expresoare', 'aparat de cafea', 'aparate de cafea'],
  ['cafetiera', 'cafetiere'],
  ['friteuza', 'friteuze', 'air fryer', 'airfryer'],
  ['cuptor cu microunde', 'cuptoare cu microunde', 'microunde'],
  ['fierbator', 'fierbatoare', 'fierbator electric', 'ceainic electric'],
  ['blender', 'blendere'],
  ['mixer', 'mixere'],
  ['robot de bucatarie', 'roboti de bucatarie'],
  ['multicooker', 'multicookere'],
  ['purificator', 'purificatoare', 'purificator de aer'],
  ['umidificator', 'umidificatoare'],
  ['fier de calcat', 'fiare de calcat'],
  ['uscator de par', 'uscatoare de par', 'foehn', 'fon'],
  ['aparat de ras', 'aparate de ras', 'masina de ras'],
  ['periuta electrica', 'periute electrice', 'periuta de dinti electrica'],
  ['trotineta electrica', 'trotinete electrice', 'trotineta', 'trotinete'],

  // Display and connectivity terms
  ['4k', 'uhd', 'ultra hd', '2160p'],
  ['full hd', 'fhd', '1080p'],
  ['qhd', '1440p', '2k'],
  ['miniled', 'mini led', 'mini-led'],
  ['smart tv', 'smarttv'],
  ['wifi', 'wi-fi'],
  ['fara fir', 'wireless'],
  ['bluetooth', 'bt'],
  ['dual sim', 'dualsim'],
  ['inch', 'inchi', 'inci', 'tol'],
  ['iphone', 'i phone'],
  ['airpods', 'air pods'],
  ['macbook', 'mac book'],

  // Colours (Romanian ↔ English)
  ['negru', 'neagra', 'negre', 'black'],
  ['alb', 'alba', 'albe', 'white'],
  ['gri', 'gray', 'grey'],
  ['argintiu', 'argintie', 'silver'],
  ['albastru', 'albastra', 'blue'],
  ['verde', 'green'],
  ['rosu', 'rosie', 'red'],
  ['roz', 'pink'],
  ['auriu', 'aurie', 'gold'],
  ['mov', 'violet', 'purple'],
  ['galben', 'galbena', 'yellow'],
  ['portocaliu', 'portocalie', 'orange'],
  ['bej', 'beige'],
  ['maro', 'brown'],
  ['inox', 'stainless'],
];

/** Query term → extra terms, without the reverse. */
export const ONE_WAY: Readonly<Record<string, readonly string[]>> = {
  'ps5 slim': ['playstation 5 slim'],
  'ps5 pro': ['playstation 5 pro'],
  'ps5 digital': ['playstation 5 digital'],
  'switch 2': ['nintendo switch 2'],
  'xbox x': ['xbox series x'],
  'xbox s': ['xbox series s'],
  'rtx': ['geforce rtx'],
  'telefon ieftin': ['telefon'],
  'laptop ieftin': ['laptop'],
  'televizor ieftin': ['televizor'],
};

const ASCII = /^[a-z0-9 .+-]+$/;

/** The Meilisearch `synonyms` setting: every group expanded both ways, plus the one-way entries. */
export function buildSynonyms(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const group of SYNONYM_GROUPS) {
    for (const term of group) {
      out[term] = [...new Set([...(out[term] ?? []), ...group.filter((t) => t !== term)])];
    }
  }
  for (const [term, extra] of Object.entries(ONE_WAY)) out[term] = [...new Set([...(out[term] ?? []), ...extra])];
  return out;
}

/** Problems in the lists (used by the unit test): non-ASCII terms, a term in two groups, empty groups. */
export function synonymIssues(): string[] {
  const issues: string[] = [];
  const seen = new Map<string, number>();
  SYNONYM_GROUPS.forEach((group, i) => {
    if (group.length < 2) issues.push(`group ${i} has fewer than two terms`);
    for (const term of group) {
      if (!ASCII.test(term)) issues.push(`"${term}" is not folded lower-case ASCII`);
      if (seen.has(term)) issues.push(`"${term}" is in groups ${seen.get(term)} and ${i}`);
      seen.set(term, i);
    }
  });
  for (const [term, extra] of Object.entries(ONE_WAY)) {
    if (!ASCII.test(term)) issues.push(`one-way "${term}" is not folded lower-case ASCII`);
    for (const e of extra) if (!ASCII.test(e)) issues.push(`one-way target "${e}" is not folded lower-case ASCII`);
  }
  return issues;
}
