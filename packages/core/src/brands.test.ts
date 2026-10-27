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
