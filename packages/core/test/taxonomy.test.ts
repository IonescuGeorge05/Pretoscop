import { describe, expect, it } from 'vitest';
import { categorize, categoriesCompatible, TAXONOMY, taxonomyPath } from '../src/taxonomy';

describe('categorize (title prefix first, breadcrumb fallback)', () => {
  it.each([
    ['Telefon mobil Samsung Galaxy S26 FE, Dual SIM, 8GB RAM, 128GB, 5G, Blueberry', 'telefoane-mobile'],
    ['Apple iPhone 17 Pro Max, 256GB, Silver', 'telefoane-mobile'],
    ['Tableta Lenovo Tab M11, 11", 4GB, 128GB, Wi-Fi', 'tablete'],
    ['Laptop ASUS Vivobook 16 X1605VA, i5-13420H, 16GB, 512GB SSD', 'laptopuri'],
    ['Televizor LED Samsung 55DU7172, 138 cm, Smart, 4K Ultra HD', 'televizoare'],
    ['Monitor LED LG UltraGear 27GR75Q, 27", QHD, 165Hz', 'monitoare'],
    ['Placa video MSI GeForce RTX 5070 VENTUS 2X OC 12GB GDDR7', 'placi-video'],
    ['SSD Kingston NV3 1TB, PCI Express 4.0 x4, M.2 2280', 'stocare'],
    ['Memorie Kingston FURY Beast 32GB DDR5 6000MHz', 'memorii-ram'],
    ['Consola PlayStation 5 Slim Digital Edition, 1TB', 'console'],
    ['Joc EA SPORTS FC 26 pentru PlayStation 5', 'jocuri'],
    ['Mașină de spălat rufe Arctic APL81222XLAB4, 8 kg, 1200 RPM, Clasa A, Alb', 'masini-de-spalat-rufe'],
    ['Masina de spalat vase incorporabila Bosch SMV2ITX18E, 12 seturi', 'masini-de-spalat-vase'],
    ['Combina frigorifica Samsung RB34C600EB1/EF, 344 l, Clasa E', 'frigidere'],
    ['Aspirator robot Roborock Q7 Max', 'aspiratoare'],
    ['Espressor automat De’Longhi Magnifica S ECAM22.110.B', 'espressoare'],
    ['Friteuza cu aer cald Philips Airfryer XXL HD9650/90', 'friteuze'],
    ['Cuptor cu microunde Samsung MS23K3513AW, 23 l', 'cuptoare-cu-microunde'],
    ['Trotineta electrica Xiaomi Electric Scooter 4 Pro', 'trotinete-electrice'],
    ['Casti wireless Sony WH-1000XM6, Negru', 'casti'],
  ])('%s → %s', (title, slug) => {
    expect(categorize(title)).toBe(slug);
  });

  it('accessories never get the device category', () => {
    expect(categorize('Husa de protectie pentru iPhone 17 Pro, Silicon, Negru', null, { isAccessory: true })).toBeNull();
    expect(categorize('Memorie USB SanDisk 128GB')).toBeNull();
    expect(categorize('Monitor audio bebelusi Philips Avent')).toBeNull();
  });

  it('falls back to the breadcrumb (last segment first)', () => {
    expect(categorize('Samsung Galaxy A56 5G 256GB', 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile')).toBe('telefoane-mobile');
    expect(categorize('Chrystal UE55U8072H 55Inch', 'Acasa > TV si Electronice > Televizoare > Samsung')).toBe('televizoare');
    expect(categorize('Ceva necunoscut', 'Jucarii > Lego')).toBeNull();
  });

  it('paths and compatibility', () => {
    expect(taxonomyPath('telefoane-mobile')).toBe('telefoane-tablete/telefoane-mobile');
    expect(categoriesCompatible('televizoare', null)).toBe(true);
    expect(categoriesCompatible('televizoare', 'monitoare')).toBe(false);
    expect(new Set(TAXONOMY.map((n) => n.slug)).size).toBe(TAXONOMY.length);
  });
});
