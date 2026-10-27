import { categorize, detectBrand, extractAttributes, foldLower, gtinCheckDigit, normalizeGtin, slugify, taxonomyNode } from '@pretoscop/core';
import type { ProductRow } from '../src/document';

/**
 * A small catalogue of realistic Romanian shop titles for relevance tests. Brand, category and
 * attributes come from the same core functions the matcher uses, so the documents look like the
 * real ones.
 */
export const TITLES: Array<[number, string, number | null]> = [
  // [id, title, total price in lei (null = not in stock)]
  [1, 'Televizor Samsung 55U8072H, 138 cm, Smart, 4K Ultra HD, LED, Clasa F', 2299.99],
  [2, 'Televizor SAMSUNG QLED 55Q7FA, 138 cm, Smart, 4K Ultra HD, Clasa G (Model 2025)', 2899],
  [3, 'Televizor Samsung QE65S90H, 163 cm, Smart, 4K Ultra HD, OLED, Clasa E', 7499],
  [4, 'Televizor LG OLED evo 55C52LA, 139 cm, Smart, 4K Ultra HD, 100 Hz, Clasa F', 5199],
  [5, 'Televizor Philips 55PUS8001, 139 cm, Smart, 4K Ultra HD, LED, Clasa F', 2499],
  [6, 'Televizor Samsung 43U8072H, 108 cm, Smart, 4K Ultra HD, LED, Clasa F', 1599],
  [7, 'Combina frigorifica Samsung RB34C600EB1/EF, 344 l, Clasa E, No Frost, Negru', 2799],
  [8, 'Frigider side by side LG GSXV90BSAE, 635 l, Clasa E, InstaView, Total No Frost, Negru', 9999],
  [9, 'Frigider cu o usa Heinner HF-V120F, 120 l, Clasa F, Alb', 699],
  [10, 'Combina frigorifica Bosch KGN39VLCT, 363 l, Clasa C, No Frost, Inox', 3599],
  [11, 'Consola PlayStation 5 Slim, 1TB SSD, D-Chassis', 2449],
  [12, 'Consola Sony PlayStation 5 Pro, 2TB SSD', 3699],
  [13, 'Consola Microsoft Xbox Series X, 1TB, Negru', 2599],
  [14, 'Consola Nintendo Switch 2, Light Blue/Light Red Joy-Con', 2299],
  [15, 'Laptop ASUS Vivobook 15 X1504VA cu procesor Intel Core i5-1335U, 15.6", Full HD, 16GB RAM, 512GB SSD, Intel Iris Xe, No OS, Cool Silver', 2799],
  [16, 'Laptop ASUS TUF Gaming A15 cu procesor AMD Ryzen 7 7445HS, 15.6", Full HD, 144Hz, 16GB DDR5, 1TB SSD, NVIDIA GeForce RTX 5060 8GB, No OS', 4999],
  [17, 'Laptop ASUS Zenbook 14 UX3405MA, Intel Core Ultra 7 155H, 14" OLED, 32GB RAM, 1TB SSD, Windows 11 Home', 6299],
  [18, 'Laptop Lenovo IdeaPad Slim 3 15IRH8, Intel Core i5-13420H, 15.6" Full HD, 16GB RAM, 512GB SSD, No OS', 2599],
  [19, 'Laptop Gaming Lenovo LOQ 15IAX9, Intel Core i5-12450HX, 15.6" FHD 144Hz, 12GB RAM, 512GB SSD, RTX 5070 8GB', 5499],
  [20, 'Telefon mobil Apple iPhone 17 Pro, 256GB, 5G, Cosmic Orange', 6999],
  [21, 'Telefon mobil Apple iPhone 17 Pro Max, 256GB, 5G, Deep Blue', 7799],
  [22, 'Telefon mobil Apple iPhone 17, 256GB, 5G, Black', 4999],
  [23, 'Telefon mobil Apple iPhone 17 Pro, 512GB, 5G, Silver', 8199],
  [24, 'Telefon mobil Samsung Galaxy A57, Dual SIM, 8GB RAM, 128GB, 5G, Awesome Navy', 1899],
  [25, 'Mașină de spălat rufe Samsung WW90DB7U94GBU4, 9 kg, 1400 RPM, Clasa A, Alb', 2399],
  [26, 'Televizor TCL 55P8K, 139 cm, Smart Google TV, 4K Ultra HD, Clasa F', null],
];

const BODY = '880609553000';
/** A valid GTIN-13 for product 24 (barcode search). */
export const GTIN_24 = `${BODY}${gtinCheckDigit(BODY)}`;

export function catalogueRows(): ProductRow[] {
  return TITLES.map(([id, title, total]) => {
    const category = categorize(title);
    const node = category ? taxonomyNode(category) : undefined;
    const parent = node?.parent ? taxonomyNode(node.parent) : undefined;
    const brand = detectBrand(title, null, category);
    const bani = total === null ? null : Math.round(total * 100);
    return {
      id,
      slug: `${slugify(title, 60)}-${id}`,
      title,
      titleAscii: foldLower(title),
      mpn: null,
      mpnNorm: null,
      attributes: extractAttributes(title, { categoryHint: category }) as Record<string, unknown>,
      provisional: false,
      popularity: 0,
      brand: brand?.name ?? null,
      brandSlug: brand?.slug ?? null,
      brandAliases: [],
      categorySlug: category,
      categoryName: node?.nameRo ?? null,
      categoryPath: category && parent ? `${parent.slug}/${category}` : category,
      parentSlug: parent?.slug ?? null,
      parentName: parent?.nameRo ?? null,
      family: null,
      familyId: null,
      image: null,
      gtins: id === 24 ? [normalizeGtin(GTIN_24)!] : [],
      observationsDays: 0,
      verdict: 'insufficient_data',
      historyStartedAt: null,
      offerCount: 1,
      shopCount: 1,
      shopSlugs: ['emag'],
      minPriceBani: bani,
      minTotalBani: bani,
      minShop: bani === null ? null : 'eMAG',
      inStockCount: bani === null ? 0 : 1,
      lastChangeAt: null,
      updatedAt: new Date('2026-10-27T10:00:00Z'),
    };
  });
}
