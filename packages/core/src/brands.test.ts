import { describe, expect, it } from 'vitest';
import {
  BRANDS,
  brandDictionaryIssues,
  brandTokens,
  detectBrand,
  detectBrandInTitle,
  findBrand,
  isPlaceholderBrand,
} from './brands';

const brandOf = (title: string, field?: string): string | null =>
  detectBrand(title, field)?.name ?? null;

describe('brand dictionary', () => {
  it('has at least 300 brands with unique slugs and no alias collisions', () => {
    expect(BRANDS.length).toBeGreaterThanOrEqual(300);
    const slugs = BRANDS.map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(brandDictionaryIssues()).toEqual([]);
  });

  it('keeps canonical casing and readable slugs', () => {
    expect(findBrand('delonghi')).toMatchObject({ name: "De'Longhi", slug: 'delonghi' });
    expect(findBrand('TP Link')).toMatchObject({ name: 'TP-Link', slug: 'tp-link' });
    expect(findBrand('be quiet')).toMatchObject({ name: 'be quiet!', slug: 'be-quiet' });
    expect(findBrand('GSkill')).toMatchObject({ name: 'G.Skill', slug: 'g-skill' });
    expect(findBrand('Black & Decker')).toMatchObject({
      name: 'Black+Decker',
      slug: 'black-decker',
    });
    expect(findBrand('Karcher')).toMatchObject({ name: 'Kärcher', slug: 'karcher' });
  });

  it('finds brands by alias and product line', () => {
    expect(findBrand('WD')?.name).toBe('Western Digital');
    expect(findBrand('Hewlett Packard')?.name).toBe('HP');
    expect(findBrand('LG Electronics')?.name).toBe('LG');
    expect(findBrand('B&O')?.name).toBe('Bang & Olufsen');
    expect(findBrand('iPhone')?.name).toBe('Apple');
    expect(findBrand('PlayStation')?.name).toBe('Sony');
    expect(findBrand('Alienware')?.name).toBe('Dell');
    expect(findBrand('Redmi')?.name).toBe('Xiaomi');
    expect(findBrand('nonexistent brand xyz')).toBeNull();
  });

  it('tokenizes punctuation consistently', () => {
    expect(brandTokens("De'Longhi")).toEqual(['delonghi']);
    expect(brandTokens('G.Skill')).toEqual(['gskill']);
    expect(brandTokens('Bang & Olufsen')).toEqual(['bang', 'and', 'olufsen']);
    expect(brandTokens('Black+Decker')).toEqual(['black', 'plus', 'decker']);
    expect(brandTokens('WD_BLACK')).toEqual(['wd', 'black']);
  });
});

describe('detectBrand: brand field', () => {
  it('lets a known field win, also with legal suffixes', () => {
    expect(detectBrand('Telefon mobil Galaxy S25', 'SAMSUNG')).toMatchObject({
      name: 'Samsung',
      via: 'field',
      confidence: 1,
      known: true,
    });
    expect(brandOf('Televizor 55"', 'Samsung Electronics Romania SRL')).toBe('Samsung');
    expect(brandOf('Imprimanta', 'Hewlett-Packard')).toBe('HP');
    expect(brandOf('Laptop gaming', 'Alienware')).toBe('Dell');
  });

  it('reports a conflicting brand named in the title', () => {
    const r = detectBrand('Telefon mobil Samsung Galaxy S25', 'Apple');
    expect(r).toMatchObject({ name: 'Apple', via: 'field', conflict: 'Samsung' });
  });

  it('ignores placeholder fields', () => {
    for (const p of ['Generic', 'OEM', 'Fără brand', 'N/A', 'no brand', '-', 'Universal']) {
      expect(isPlaceholderBrand(p), p).toBe(true);
    }
    expect(brandOf('Husa Spigen pentru iPhone 17', 'Generic')).toBe('Spigen');
    expect(brandOf('Cablu USB', 'OEM')).toBeNull();
  });

  it('returns an unknown field title-cased with lower confidence', () => {
    expect(detectBrand('Husa silicon pentru iPhone 17', 'LEMONTTIX')).toMatchObject({
      name: 'Lemonttix',
      via: 'field',
      known: false,
      confidence: 0.5,
    });
    expect(detectBrand('Boxa ZZTop Mega', 'zztop')).toMatchObject({
      name: 'Zztop',
      confidence: 0.6,
    });
    expect(detectBrand('Boxa', 'ABC')).toMatchObject({ name: 'ABC' });
  });

  it('prefers a known title brand over an unknown field', () => {
    expect(detectBrand('Telefon mobil Samsung Galaxy A56', 'TelefonulTau')).toMatchObject({
      name: 'Samsung',
      via: 'title',
    });
  });
});

describe('detectBrand: titles', () => {
  it.each([
    ['Telefon mobil Samsung Galaxy S25 Ultra, 256GB', 'Samsung', 'title'],
    ['Consola PlayStation 5 Slim Digital Edition, 1TB', 'Sony', 'product_line'],
    ['Consola Xbox Series S 512GB', 'Microsoft', 'product_line'],
    ['Tableta iPad Air 11"', 'Apple', 'product_line'],
    ['Smartwatch Apple Watch Series 11', 'Apple', 'title'],
    ['Laptop ThinkPad E14 Gen 6', 'Lenovo', 'product_line'],
    ['Laptop Gaming ROG Strix G16', 'ASUS', 'product_line'],
    ['Telefon mobil Redmi Note 14', 'Xiaomi', 'product_line'],
    ['Telefon mobil POCO X7 Pro', 'Xiaomi', 'product_line'],
    ['Telefon mobil Google Pixel 10 Pro', 'Google', 'title'],
    ['Laptop Microsoft Surface Laptop 7', 'Microsoft', 'title'],
    ['Consola Nintendo Switch 2', 'Nintendo', 'title'],
    ['Espressor De Longhi Magnifica', "De'Longhi", 'alias'],
    ['Espressor DeLonghi Magnifica', "De'Longhi", 'title'],
    ['SSD WD Black SN850X 1TB', 'Western Digital', 'alias'],
    ['Router TP-Link Archer AX55', 'TP-Link', 'title'],
    ['Memorie G.Skill Trident Z5', 'G.Skill', 'title'],
    ['Ventilator be quiet! Silent Wings 4', 'be quiet!', 'title'],
    ['Casti Bang & Olufsen Beoplay H95', 'Bang & Olufsen', 'title'],
    ['Telefon mobil Nothing Phone (3a)', 'Nothing', 'alias'],
    ['Telefon mobil CAT S75', 'CAT', 'title'],
  ])('%s → %s via %s', (title, name, via) => {
    expect(detectBrandInTitle(title)).toMatchObject({ name, via });
  });

  it('ignores devices named after a compatibility marker', () => {
    expect(brandOf('Husa de protectie pentru iPhone 17 Pro, Silicon, Negru')).toBeNull();
    expect(brandOf('Folie sticla compatibila cu Samsung Galaxy S25')).toBeNull();
    expect(brandOf('Incarcator pentru laptop Lenovo 65W')).toBeNull();
    expect(brandOf('Husa Spigen pentru iPhone 17')).toBe('Spigen');
    expect(brandOf('Suport auto magnetic pentru telefon Hoco, Negru')).toBe('Hoco');
    expect(brandOf('Tableta pentru copii Lenovo Tab M9')).toBe('Lenovo');
  });

  it('does not let device lines brand accessories or platform lines brand games', () => {
    expect(brandOf('Husa iPhone 17 Pro silicon')).toBeNull();
    expect(brandOf('Curea Apple Watch Sport Band')).toBe('Apple');
    expect(brandOf('Joc Ghost of Yotei Standard Edition PS5')).toBeNull();
    expect(brandOf('Joc EA SPORTS FC 26 PS5')).toBe('Electronic Arts');
    expect(brandOf('Incarcator controller PS5 Venom')).toBe('Venom');
  });

  it('prefers real brands over component and co-branding names', () => {
    expect(brandOf('Laptop HP Victus, AMD Ryzen 5, NVIDIA GeForce RTX 4050')).toBe('HP');
    expect(brandOf('Placa video Gigabyte GeForce RTX 5060')).toBe('Gigabyte');
    expect(brandOf('Procesor AMD Ryzen 7 9800X3D')).toBe('AMD');
    expect(brandOf('Laptop HP OmniBook, audio Bang & Olufsen')).toBe('HP');
    expect(brandOf('Smartphone Xiaomi Redmi Note 14 Pro')).toBe('Xiaomi');
  });

  it('never treats common words as brands', () => {
    for (const title of [
      'Televizor Smart 4K Ultra HD',
      'Casti wireless Pro Max Air One',
      'Boxa portabila Ultra Plus',
      'Comoda TV stejar 160 cm',
      'Saltea yoga antiderapanta',
      'Proiector Galaxy Star cu lumini',
      'Pavilion de gradina 3x3 m',
      'Switch retea 8 porturi Gigabit',
      'Compresor aer 2 HP',
    ]) {
      expect(brandOf(title), title).toBeNull();
    }
  });

  it('handles ambiguous brand words by position and colour context', () => {
    expect(brandOf('Cooler procesor ARCTIC Liquid Freezer III')).toBe('Arctic');
    expect(brandOf('Frigider Arctic AD60240M30W, 223 l')).toBe('Arctic');
    expect(brandOf('Tableta Lenovo Tab M11, Arctic Grey')).toBe('Lenovo');
    expect(brandOf('Husa silicon, culoare Arctic Grey')).toBeNull();
    expect(brandOf('Telefon Orange Neva')).toBeNull();
    expect(brandOf('Telefon', 'Orange')).toBe('Orange');
  });

  it('does not take a component brand alone as the maker of a device', () => {
    expect(brandOf('Laptop cu procesor AMD Ryzen 5 7530U, 16GB, 512GB SSD')).toBeNull();
    expect(brandOf('Sistem PC Gaming, Intel Core i5, NVIDIA RTX 4060, 16GB RAM')).toBeNull();
    expect(brandOf('Telefon mobil cu procesor Snapdragon 8 Gen 3, 12GB RAM')).toBeNull();
    expect(brandOf('Placa video NVIDIA GeForce RTX 5090 Founders Edition')).toBe('NVIDIA');
    expect(brandOf('Boxa portabila Harman Kardon Onyx Studio 9')).toBe('Harman Kardon');
  });

  it('does not read platform features as makers', () => {
    expect(brandOf('Televizor 55", Smart, Google TV, 4K')).toBeNull();
    expect(brandOf('Mini PC, Microsoft Windows 11 Pro, 16GB RAM')).toBeNull();
    expect(brandOf('Boxa inteligenta compatibila Amazon Alexa')).toBeNull();
    expect(brandOf('Televizor TCL 55C655, Smart Google TV')).toBe('TCL');
    expect(brandOf('Telefon mobil Google Pixel 10')).toBe('Google');
    expect(brandOf('Boxa inteligenta Amazon Echo Dot')).toBe('Amazon');
    expect(brandOf('Laptop Microsoft Surface Laptop 7')).toBe('Microsoft');
  });

  it('returns null for empty input', () => {
    expect(detectBrand(null)).toBeNull();
    expect(detectBrand('')).toBeNull();
  });
});

describe('handhelds and no-name devices (live eMAG run, 2026-10-27)', () => {
  it('knows handheld and retro console makers', () => {
    expect(brandOf('Consola portabila retro ANBERNIC RG35XX H cu jocuri, Bluvista®')).toBe(
      'Anbernic',
    );
    expect(brandOf('Consola retro portabila TRIMUI Smart Pro cu jocuri, Bluvista®')).toBe('Trimui');
    expect(brandOf('Consola de joc Miyoo Mini Plus, culoare alba, portabila')).toBe('Miyoo');
    expect(brandOf('Consola portabila Retroid Pocket 5, Snapdragon 865, 8GB RAM')).toBe('Retroid');
    expect(brandOf('Consola Evercade Super Pocket Data East Edition')).toBe('Evercade');
    expect(brandOf('Consola portabila My Arcade Retro Machine, 200 Jocuri')).toBe('My Arcade');
    expect(brandOf('Consola portabila Mangmi Air X, Qualcomm Snapdragon 662')).toBe('Mangmi');
    expect(brandOf('Kiano Slim TV Travel Televizor 19" pentru camion si rulote')).toBe('Kiano');
  });

  it('ignores what a retro handheld emulates', () => {
    expect(
      brandOf(
        'Consola retro portabila R36S 64GB cu jocuri, CPU RK3326, Emulator N64 PSP PS1 PlayStation Sega, Alb',
      ),
    ).toBeNull();
    expect(
      brandOf('Consola Bluvista® R36S portabila retro, Emulator N64 PSP PS1 PlayStation Sega'),
    ).toBe('Bluvista');
  });

  it.each([
    ['Telefon mobil pentru seniori, Garsonal®, cu meniul in limba Romana', 'Garsonal', 'trademark'],
    ['Controller Wireless Dual-Sense pentru PS5, negru, HAPPY JOKER®', 'Happy Joker', 'trademark'],
    ['Consola Retro, BYONDSELF®, 128G, 4K, 20000 de Jocuri Incorporate', 'Byondself', 'trademark'],
  ])('%s → declared trademark %s', (title, name, guess) => {
    expect(detectBrand(title)).toMatchObject({
      name,
      known: false,
      via: 'title',
      guess,
      confidence: 0.8,
    });
  });

  it.each([
    ['SweetLink S2 Plus Telefon mobil pentru seniori, taste mari', 'SweetLink', 'prefix'],
    ['ZHISHAN Consola de jocuri portabila 32 biti pentru copii', 'Zhishan', 'prefix'],
    ['Telefon Mobil Seniori VERITY, Functie SOS pentru Siguranta', 'Verity', 'after_noun'],
    [
      'Telefon Mobil pentru Seniori Mapajoy MP2, 4G, Meniu in Limba Romana',
      'Mapajoy',
      'after_noun',
    ],
    ['Laptop XIAORAN 15.6", Intel Celeron N400, 16GB RAM', 'Xiaoran', 'after_noun'],
    ['Laptop Auusda cu procesor Intel Alder Celeon N5100, 32GB', 'Auusda', 'after_noun'],
    ['Televizor LED Smart NEO LED-24ELWO25, Wi-Fi, WebOS', 'NEO', 'after_noun'],
    ['Consola SUP Game Box, 400 jocuri, Rotita volum', 'SUP', 'after_noun'],
    ['Consola portabila 6000+ jocuri NEXTLY, X6, ecran 3.5 inch', 'Nextly', 'after_noun'],
    [
      'Consola de jocuri retro Timeless Tools, 620 jocuri, 2 controller',
      'Timeless Tools',
      'after_noun',
    ],
    ['Consola de Jocuri Portabila Retoo PlayTech, Ecran HD 3.5 inch', 'Retoo', 'after_noun'],
    ['Consola portabila, Taipintee, 800 jocuri clasice retro', 'Taipintee', 'segment'],
    ['Consola de jocuri, Planet Tech, 400 de jocuri, Galben', 'Planet Tech', 'segment'],
    ['Smartphone mini 3G, Rainbuvvy, XS18 Pro, 2GB RAM, 16GB', 'Rainbuvvy', 'segment'],
  ])('%s → unknown brand %s by position (%s)', (title, name, guess) => {
    expect(detectBrand(title)).toMatchObject({
      name,
      known: false,
      via: 'title',
      guess,
      confidence: 0.6,
    });
  });

  it.each([
    'Laptop 14" cu procesor Intel Celeron J4105, 8GB RAM, 128GB SSD, Intel® UHD Graphics 600',
    'Gaming Notebook 16 GB RAM 512 GB 1 TB SSD expansiune Core i3',
    'Mini Laptop 8" 2-in-1, Laptop Computer Win 11, Intel N95',
    'Consola Game Box, Micro-USB, Multiplayer, portabila, cu 400 de jocuri, retro, galben',
    'Consola arcade retro portabila Street Fighter II Color',
    'Consola de jocuri PSP X12, 8GB memorie, ecran HD 5,1 inch, albastra',
    'Consola jocuri video retro, Negru, Monitor',
    'Consola de jocuri, Consola Portabila, Ecran 3 inch, 500 Jocuri',
    'Mini consola Retro Portabila Nostalgic Jocuri 2 Jocatori',
    'Husa pentru iPhone 17, Silicon, Negru',
    'Joc Mario Kart World pentru Nintendo Switch 2',
  ])('%s → no brand guessed', (title) => {
    expect(detectBrand(title)).toBeNull();
  });

  it('prefers a brand field to a guessed title brand', () => {
    expect(detectBrand('Consola portabila, Taipintee, 800 jocuri', 'Bedee')).toMatchObject({
      name: 'Bedee',
      via: 'field',
      known: false,
    });
    expect(detectBrand('Consola portabila, Taipintee, 800 jocuri', 'Anbernic')).toMatchObject({
      name: 'Anbernic',
      via: 'field',
      known: true,
    });
  });
});
