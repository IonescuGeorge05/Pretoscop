/**
 * REAL titles from the first live run (eMAG listings recorded by PretoscopBot on 2026-10-27,
 * 22:50–23:10: phones, laptops, TVs, console hardware). A reproducible sample of the 960 offers
 * the lead exported (every 6th offer per category, titles already in REAL_CORPUS skipped) plus the
 * problem titles the lead reported, each with its breadcrumb. Labelled by reading, before the
 * fixes of the second M06 round; the accuracy before and after is in the README ("Title corpus and
 * accuracy").
 *
 * Conventions on top of titles.ts: no-name products are labelled with the brand word the seller
 * uses (Bedee, Darklove, BYONDSELF® …); built-in games of retro handhelds are not bundles, a game,
 * controller or gift added to a console or phone is; marketing colour names that do not say a
 * colour (Iris, Citrus, TerraCotta, Night Sky) are labelled as no colour.
 */
import type { CorpusEntry } from './titles';

export const REAL_LIVE_CORPUS: readonly CorpusEntry[] = [
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 15, 128GB, 5G, Black',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 128, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Samsung Galaxy A16, Dual SIM, 128GB, 4GB RAM, 4G, Black',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Samsung', storageGb: 128, ramGb: 4, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 18 Pro, 512GB, 5G, Burgundy',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 512, color: 'red' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Google Pixel 9a, 128GB, 8GB RAM, 5G, Iris',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Google', storageGb: 128, ramGb: 8 },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 18 Pro Max, 2TB, 5G, Black',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 2048, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Google Pixel 10a, 128GB, 8GB RAM, 5G, Obsidian',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Google', storageGb: 128, ramGb: 8, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 17 Pro Max, 512GB, 5G, Deep Blue',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 512, color: 'blue' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone Duo, 1TB, 5G, Night Sky',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 1024 },
  },
  {
    shop: 'emag',
    title:
      'Telefon mobil Motorola edge 70 fusion, 7000 mAh, 256GB, 8GB RAM, 5G, PANTONE Silhouette (black)',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Motorola', storageGb: 256, ramGb: 8, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Samsung Galaxy S26 Ultra, Dual SIM, 16GB RAM, 1TB, 5G, Black',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Samsung', ramGb: 16, storageGb: 1024, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 18 Pro Max, 512GB, 5G, Silver',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 512, color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Samsung Galaxy A56, Dual SIM, 8GB RAM, 128GB, 5G, Awesome Graphite',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Samsung', ramGb: 8, storageGb: 128, color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Smartphone mini 3G, Rainbuvvy, XS18 Pro, 2GB RAM, 16GB, Dual SIM, roz',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Rainbuvvy', ramGb: 2, storageGb: 16, color: 'pink' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 16, 128GB, 5G, White',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 128, color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Nokia 106, Dual SIM, Negru',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Nokia', color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Smartphone 4G 6.26 inch 2GB 16GB Android 8.1 Dual SIM Violet, Potrivita pentru incepatori',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: null, screenInches: 6.26, ramGb: 2, storageGb: 16, color: 'purple' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Samsung Galaxy A07, Dual SIM, 64GB, 4GB RAM, 4G, Black',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Samsung', storageGb: 64, ramGb: 4, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 17 Pro Max, 512GB, 5G, Cosmic Orange',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 512, color: 'orange' },
  },
  {
    shop: 'emag',
    title:
      'SweetLink F2 Plus Telefon mobil pentru seniori, taste mari, meniu in limba Romana, buton SOS, dual SIM, Pentru Varstnici, Bluetooth, lanterna, radio, Stand incarcare, Albastru',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'SweetLink', color: 'blue' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone Duo, 2TB, 5G, Night Sky',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 2048 },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone Duo, 2TB, 5G, Star White',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 2048, color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Samsung Galaxy Z Flip8, 12GB RAM, 512GB, 5G, Pink',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Samsung', ramGb: 12, storageGb: 512, color: 'pink' },
  },
  {
    shop: 'emag',
    title: 'Telefon Mobil Xiaomi REDMI A7 Pro, 4G RAM, 128GB ROM, Black + Woven Strap Ring Stand',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Xiaomi', ramGb: 4, storageGb: 128, color: 'black', isBundle: true },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Nokia 105 (2024), Dual SIM, Purple',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Nokia', color: 'purple' },
  },
  {
    shop: 'emag',
    title:
      'Telefon mobil pentru seniori, Garsonal®, cu meniul in limba Romana, functiile de lanterna si radio FM, buton SOS,2G, dual SIM,98 de ore de timp de asteptare, Negru',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Garsonal', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 18 Pro Max, 2TB, 5G, Burgundy',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 2048, color: 'red' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 17, 256GB, 5G, White',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 256, color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Samsung Galaxy A57, Dual SIM, 8GB RAM, 256GB, 5G, Awesome Lilac',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Samsung', ramGb: 8, storageGb: 256, color: 'purple' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 18 Pro, 1TB, 5G, Burgundy',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Apple', storageGb: 1024, color: 'red' },
  },
  {
    shop: 'emag',
    title:
      "Apple MacBook Air 13'' cu procesor Apple M5, 10 nuclee CPU, 10 nuclee GPU, 24GB RAM, 1TB SSD, Sky Blue, Tastatura Internationala, Manual RO, Fara incarcator",
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Apple', screenInches: 13, ramGb: 24, storageGb: 1024, color: 'blue' },
  },
  {
    shop: 'emag',
    title:
      'Laptop Lenovo ThinkPad E16 Gen 2 cu procesor Intel® Core™ Ultra 5 125U pana la 4.3GHz, 16" WUXGA, IPS, 16GB DDR5 RAM, 512GB SSD, Intel® Graphics, Windows® 11 Pro, Black, 3Y Onsite upgrade',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Lenovo', screenInches: 16, ramGb: 16, storageGb: 512, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      "Apple MacBook Air 13'' cu procesor Apple M5, 10 nuclee CPU, 8 nuclee GPU, 16GB RAM, 512GB SSD, Sky Blue, Tastatura Internationala, Manual RO, Fara incarcator",
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Apple', screenInches: 13, ramGb: 16, storageGb: 512, color: 'blue' },
  },
  {
    shop: 'emag',
    title:
      'Apple MacBook Neo 13" Retina cu procesor Apple A18 Pro 6 nuclee CPU, 5 nuclee GPU, 16 nuclee NeuralEngine, 8GB RAM, 256GB SSD, Citrus, Tastatura Internationala, Manual RO, Fara incarcator',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Apple', screenInches: 13, ramGb: 8, storageGb: 256 },
  },
  {
    shop: 'emag',
    title:
      'Apple MacBook Neo 13" Retina cu procesor Apple A18 Pro 6 nuclee CPU, 5 nuclee GPU, 16 nuclee NeuralEngine, 8GB RAM, 512GB SSD, Indigo, Tastatura Internationala, Manual RO, Fara incarcator',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Apple', screenInches: 13, ramGb: 8, storageGb: 512, color: 'blue' },
  },
  {
    shop: 'emag',
    title:
      'Apple MacBook Neo 13" Retina cu procesor Apple A18 Pro 6 nuclee CPU, 5 nuclee GPU, 16 nuclee NeuralEngine, 8GB RAM, 256GB SSD, Silver, Tastatura Internationala, Manual RO, Fara incarcator',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Apple', screenInches: 13, ramGb: 8, storageGb: 256, color: 'silver' },
  },
  {
    shop: 'emag',
    title:
      "Laptop Acer Aspire Lite 15 cu procesor Intel® Celeron® N4500 pana la 2.8GHz, 15.6'', Full HD, IPS, 8GB LPDDR4X, 256GB SSD, Intel® UHD Graphic, No OS, Pure Silver",
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Acer', screenInches: 15.6, ramGb: 8, storageGb: 256, color: 'silver' },
  },
  {
    shop: 'emag',
    title:
      'Laptop HP 15-fd0090nq cu procesor Intel® Core™ i3-1315U pana la 4.5 GHz, 15.6", Full HD, 8GB DDR4 RAM, 512GB SSD, Intel® UHD Graphics, Windows 11 Home, Moonlight Blue',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'HP',
      mpn: '15FD0090NQ',
      screenInches: 15.6,
      ramGb: 8,
      storageGb: 512,
      color: 'blue',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Lenovo IdeaPad Slim 3 15ABR8 cu procesor AMD Ryzen™ 5 5625U pana la 4.3 GHz, 15.6" Full HD, 8 GB DDR4 RAM, 512 GB SSD, AMD Radeon™ Graphics, Windows 11 Pro, Arctic Grey',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'Lenovo',
      mpn: '15ABR8',
      screenInches: 15.6,
      ramGb: 8,
      storageGb: 512,
      color: 'gray',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Lenovo IdeaPad Slim 5 16IPH11 cu procesor Intel Core™ Ultra 5 322 pana la 4.4GHz, 16" WUXGA, OLED, 16GB DDR5, 512GB SSD, Intel® Graphics, No OS, Cosmic Blue, 3y Courier or Carry-in',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'Lenovo',
      mpn: '16IPH11',
      screenInches: 16,
      ramGb: 16,
      storageGb: 512,
      color: 'blue',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop HP 250R G10 cu procesor Intel® Core™ 7 150U pana la 5.40 GHz, 15.6", Full HD, 16GB DDR4, 512GB SSD, Intel Graphics, Windows 11 Pro, Dark Ash Silver',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'HP', screenInches: 15.6, ramGb: 16, storageGb: 512, color: 'silver' },
  },
  {
    shop: 'emag',
    title:
      'Laptop ASUS PM3606CHA cu procesor AMD Ryzen™ 7 8840HS pana la 5.10 GHz, 16", WUXGA, 16GB RAM, 512GB SSD, AMD Radeon™ 780M, No OS, Misty Grey',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'ASUS',
      mpn: 'PM3606CHA',
      screenInches: 16,
      ramGb: 16,
      storageGb: 512,
      color: 'gray',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Gaming Lenovo Legion 5 15IAX11 cu procesor Intel Core™ Ultra 7 251HX pana la 5.1GHz, 15.3" WQXGA, OLED, 165Hz, 32GB DDR5, 1TB SSD, NVIDIA GeForce RTX™ 5070 12GB GDDR7, No OS, Eclipse Black, 3Y on-site Premium Care',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'Lenovo',
      mpn: '15IAX11',
      screenInches: 15.3,
      ramGb: 32,
      storageGb: 1024,
      color: 'black',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Lenovo V15 G4 IRU, Procesor Intel® Core™ i3-1315U, 15.6" FHD IPS, 16 GB DDR4, 1 TB SSD, GMA UHD, Windows 11 Pro, Business Black',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Lenovo', screenInches: 15.6, ramGb: 16, storageGb: 1024, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      "Laptop ASUS VivoBook 15 cu procesor Intel® Core™i5-1334U pana la 4.6 GHz, 15.6'', Full HD, IPS, 8 GB DDR4 RAM, 256 GB SSD, Windows 11 Pro, TerraCotta",
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'ASUS', screenInches: 15.6, ramGb: 8, storageGb: 256 },
  },
  {
    shop: 'emag',
    title:
      'Laptop 14" cu procesor Intel Celeron J4105, 8GB RAM, 128GB SSD, 1920*1080 FHD, Windows 11 Pro, Intel® UHD Graphics 600, 5GHz Wifi, 5000mAh, Argintiu',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: null, screenInches: 14, ramGb: 8, storageGb: 128, color: 'silver' },
  },
  {
    shop: 'emag',
    title:
      "Laptop Gaming ASUS ROG Strix G16 G615LH cu procesor Intel® Core™ Ultra 7 255HX pana la 5.20 GHz, 16'', 2.5K, 240Hz, 16GB RAM, 512GB SSD, NVIDIA® GeForce RTX™ 5050 8GB, No OS, Eclipse Gray",
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'ASUS',
      mpn: 'G615LH',
      screenInches: 16,
      ramGb: 16,
      storageGb: 512,
      color: 'gray',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Acer Extensa 15, procesor i5-13420H, 8 GB RAM, 512 GB SSD, 15.6", Full HD, Silver',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Acer', screenInches: 15.6, ramGb: 8, storageGb: 512, color: 'silver' },
  },
  {
    shop: 'emag',
    title:
      'Laptop Lenovo V15 G4 IRU, Procesor Intel® Core™ i3-1315U, 15.6" FHD IPS, 16 GB DDR4, 256 GB SSD, GMA UHD, Windows 11 Pro, Business Black',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Lenovo', screenInches: 15.6, ramGb: 16, storageGb: 256, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Laptop HP OmniBook 5 AI WUXGA 16 inch Intel Core Ultra 7 255U 16GB 512GB SSD Windows 11 Home Silver',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'HP', screenInches: 16, ramGb: 16, storageGb: 512, color: 'silver' },
  },
  {
    shop: 'emag',
    title:
      "Laptop ASUS ExpertBook B1 B1503CVA cu procesor Intel® Core™ 5 120U pana la 5.00 GHz, 15.6', FHD, 16GB RAM, 1TB SSD, Intel Graphics, No OS, Gentle Grey",
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'ASUS',
      mpn: 'B1503CVA',
      screenInches: 15.6,
      ramGb: 16,
      storageGb: 1024,
      color: 'gray',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop HP 15-fd0015nq cu procesor Intel® Core™ i7-1355U pana la 5.0 GHz, 15.6", Full HD, 16 GB DDR4 RAM, 512 GB SSD, Intel® Iris® Xe Graphics, Windows 11 Pro, Natural Silver',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'HP',
      mpn: '15FD0015NQ',
      screenInches: 15.6,
      ramGb: 16,
      storageGb: 512,
      color: 'silver',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Gaming MSI Katana 15 HX B14WEK cu procesor Intel® Core™ i7-14650HX pana la 5.2GHz, 15.6" QHD, 165Hz, 16GB DDR5 RAM, 512GB SSD, NVIDIA® GeForce RTX™ 5050 GDDR7, No OS, Black',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'MSI',
      mpn: 'B14WEK',
      screenInches: 15.6,
      ramGb: 16,
      storageGb: 512,
      color: 'black',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Apple MacBook Pro 14" cu procesor Apple M5, 10 nuclee CPU si 10 nuclee GPU, 16GB RAM, 1TB SSD, Space Black, Tastatura Internationala, Manual RO, Fara incarcator',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Apple', screenInches: 14, ramGb: 16, storageGb: 1024, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Laptop HP OmniBook 3 NG AI 14-ha0008nn cu procesor AMD Ryzen™ AI 7 350 pana la 5.0GHz, 14.0", Full HD, 24GB DDR5 RAM, 512GB SSD, AMD Radeon™ 860M Graphics, Windows 11 Home, Glacier Silver',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'HP',
      mpn: '14HA0008NN',
      screenInches: 14,
      ramGb: 24,
      storageGb: 512,
      color: 'silver',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Lenovo V15 G5 IRL cu procesor Intel Core™ i5-13420H pana la 4.60 GHz, 15.6" FHD IPS, 16GB RAM, 1TB SSD, Intel® UHD Graphics, No OS',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Lenovo', screenInches: 15.6, ramGb: 16, storageGb: 1024 },
  },
  {
    shop: 'emag',
    title:
      'Laptop ASUS Vivobook Go 15 cu procesor AMD Ryzen™ 5 40 pana la 4.30 GHz, 15.6", Full HD, 8GB RAM, 512GB SSD, AMD Radeon 610M, No OS, Mixed Black',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'ASUS', screenInches: 15.6, ramGb: 8, storageGb: 512, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Laptop Gaming Lenovo LOQ 15AHP10 Procesor AMD Ryzen™ 5 220 16M Cache, up to 4.9 GHz, 15.6" Full HD IPS 144Hz, 16GB, 512GB SSD, NVIDIA GeForce RTX 5050 @8GB, No OS, Gri',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'Lenovo',
      mpn: '15AHP10',
      screenInches: 15.6,
      ramGb: 16,
      storageGb: 512,
      color: 'gray',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Gaming Acer Nitro 16S AI AN16S-61-R7LG cu procesor AMD Ryzen™ AI 9 365 pana la 5.0GHz, 16", WUXGA, IPS, 180Hz, 32GB DDR5 RAM, 1TB SSD, NVIDIA® GeForce RTX™ 5060 8GB GDDR7, No OS, Obsidian Black',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'Acer',
      mpn: 'AN16S61R7LG',
      screenInches: 16,
      ramGb: 32,
      storageGb: 1024,
      color: 'black',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Asus Vivobook Go 15 E1504FA-BQ2424W, E1504FA-BQ2424W, 15.6", AMD Ryzen 5 7520U (4-core), Grafica AMD Radeon, 16GB 5500MHz LPDDR5, Argintiu',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'ASUS',
      mpn: 'E1504FABQ2424W',
      screenInches: 15.6,
      ramGb: 16,
      color: 'silver',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop ASUS Vivobook R1504VA Procesor Intel Core i3-1315U 10M Cache, up to 4.50 GHz 15.6" FHD, 8GB, 512GB SSD, Intel UHD Graphics, Albastru',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'ASUS',
      mpn: 'R1504VA',
      screenInches: 15.6,
      ramGb: 8,
      storageGb: 512,
      color: 'blue',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop AUUSDA, Procesor AMD 3 3250C(pana la 3.6 GHz), 16GB RAM, SSD 512GB, Ecran IPS 15.6" FHD, Tastatura Iluminata, Windows 11 Pro, AMD Radeon RX Vega 3, Roz',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Auusda', screenInches: 15.6, ramGb: 16, storageGb: 512, color: 'pink' },
  },
  {
    shop: 'emag',
    title:
      'Laptop Gaming Acer Nitro V15 ANV15-52-95UT cu procesor Intel® Core™ i9-13900H pana la 5.40 GHz, 15.6" FullHD, IPS, 165Hz, 16GB DDR4 RAM, 512GB SSD, NVIDIA® GeForce RTX™ 5060 8GB GDDR7, No OS, Obsidian Black',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'Acer',
      mpn: 'ANV155295UT',
      screenInches: 15.6,
      ramGb: 16,
      storageGb: 512,
      color: 'black',
    },
  },
  {
    shop: 'emag',
    title:
      "Laptop Gaming ROG Strix G18 G814FP cu procesor AMD Ryzen™ 9 9955HX pana la 5.4GHz, 18'', Full HD+, WUXGA, 144Hz, IPS, 32GB DDR5 RAM, 1TB SSD, NVIDIA® GeForce RTX™ 5070 8GB GDDR7, No OS, Eclipse Gray",
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'ASUS',
      mpn: 'G814FP',
      screenInches: 18,
      ramGb: 32,
      storageGb: 1024,
      color: 'gray',
    },
  },
  {
    shop: 'emag',
    title:
      "Laptop Gaming ASUS TUF A16 FA608UM cu procesor AMD Ryzen™ 7 260 pana la 5.1GHz, 16'', Full HD+, 165Hz, IPS, 16GB DDR5 RAM, 512GB SSD, NVIDIA® GeForce RTX™ 5060 8GB GDDR7, No OS, Jaeger Gray",
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'ASUS',
      mpn: 'FA608UM',
      screenInches: 16,
      ramGb: 16,
      storageGb: 512,
      color: 'gray',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Lenovo ThinkBook 16 Gen 9 cu procesor AMD Ryzen™ 5 220 pana la 4.90 GHz, 16" WUXGA IPS 400nits, 32GB RAM, 512GB SSD, AMD Radeon™ 740M Graphics, No OS',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Lenovo', screenInches: 16, ramGb: 32, storageGb: 512 },
  },
  {
    shop: 'emag',
    title:
      'Laptop Lenovo IdeaPad Slim 3 17IWC11 cu procesor Intel Core™ 3 304 pana la 4.3GHz, 17.3" Full HD, IPS, 8GB DDR5, 512GB SSD, Intel® Graphics, No OS, Luna Grey, 3y Courier or Carry-in',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'Lenovo',
      mpn: '17IWC11',
      screenInches: 17.3,
      ramGb: 8,
      storageGb: 512,
      color: 'gray',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Blackview Acebook 10,16GB DDR4 512GB SSD+2TB TF, Intel N150 3.6GHz/Intel® Graphics, Windows 11 Pro,60.8Wh,18.5" FHD+, HDMI 2.0, BT5.2, WI-FI 6, USB 3.2, Gri',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Blackview', screenInches: 18.5, ramGb: 16, storageGb: 512, color: 'gray' },
  },
  {
    shop: 'emag',
    title:
      'Laptop Gaming HP VICTUS 15-fb3039nn cu procesor AMD Ryzen™ Ryzen 7 260 pana la 5.1GHz, 15.6", Full HD, 24GB DDR5 RAM, 1TB SSD, NVIDIA® GeForce RTX™ 5050 8GB GDDR7, Free DOS, Mica Silver',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: {
      brand: 'HP',
      mpn: '15FB3039NN',
      screenInches: 15.6,
      ramGb: 24,
      storageGb: 1024,
      color: 'silver',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Lenovo V15 G4 IRU, Procesor Intel® Core™ i3-1315U, 15.6" FHD IPS, 16 GB DDR4, 512 GB SSD, GMA UHD, Windows 11 Pro, Business Black',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Lenovo', screenInches: 15.6, ramGb: 16, storageGb: 512, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Televizor LG LED 50UA73003LA, 126 cm, Smart, 4K Ultra HD, Clasa G',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'LG', mpn: '50UA73003LA', screenInches: 50, energyClass: 'G' },
  },
  {
    shop: 'emag',
    title: 'Televizor TCL QLED 65P8K, 164 cm, Smart Google TV, 4K Ultra HD, 144Hz, Clasa F',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'TCL', mpn: '65P8K', screenInches: 65, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor SAMSUNG LED 65U8072H, 163 cm, Smart, 4K Ultra HD, Clasa F (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Samsung', mpn: '65U8072H', screenInches: 65, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor TCL QLED 65T69C, 164 cm, Smart Google TV, 4K Ultra HD, Clasa F',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'TCL', mpn: '65T69C', screenInches: 65, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor LG LED 43NU850B3LA, 108 cm, Smart, 4K Utra HD, Clasa G (Model2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'LG', mpn: '43NU850B3LA', screenInches: 43, energyClass: 'G' },
  },
  {
    shop: 'emag',
    title:
      'Televizor TCL QD-MiniLed 55C6K, 139 cm, QLED, Smart Google TV, 4K Ultra HD, 144Hz, Clasa F',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'TCL', mpn: '55C6K', screenInches: 55, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor SAMSUNG LED 32H5002, 80 cm, Smart, HD, Clasa F',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Samsung', mpn: '32H5002', screenInches: 32, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor Mini LED TCL 139 cm (55") 55C61KS, Ultra HD 4K, Smart TV, CI+',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'TCL', mpn: '55C61KS', screenInches: 55 },
  },
  {
    shop: 'emag',
    title: 'Televizor LED Star-Light 40DM6600, 100 cm, Smart, Full HD, Clasa E',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Star-Light', mpn: '40DM6600', screenInches: 40, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title: 'Televizor TCL QLED 75T69C, 189 cm, Smart Google TV, 4K Ultra HD, Clasa F',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'TCL', mpn: '75T69C', screenInches: 75, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title:
      'Televizor TCL QD-MiniLed 55C6K Pro, 139 cm, QLED, Smart Google TV, 4K Ultra HD, 144Hz, Clasa E (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'TCL', mpn: '55C6K', screenInches: 55, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title: 'Televizor METZ LED 60MUF7000Z, 152 cm, Smart Google TV, 4K Ultra HD, Clasa E',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Metz', mpn: '60MUF7000Z', screenInches: 60, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title:
      'Televizor LG OLED Evo 65C62LA, 163 cm, Smart, 4k Ultra HD, 165 Hz, Clasa E (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'LG', mpn: '65C62LA', screenInches: 65, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title: 'Televizor Xiaomi QLED A Pro, 108 cm, Smart Google TV, 4K Ultra HD, Clasa F',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Xiaomi', screenInches: 43, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title:
      'Televizor LED Smart Crown 32FB12V02AW, Alimentare 12V Auto/Rulote, HD Ready 1366x768, Wi-Fi, Android, 81 cm, Clasa F, Negru',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: {
      brand: 'Crown',
      mpn: '32FB12V02AW',
      screenInches: 32,
      energyClass: 'F',
      color: 'black',
    },
  },
  {
    shop: 'emag',
    title:
      'Televizor LED Smart-Tech, 60 cm, 24HN01V3CA, HD, alimentare 12V (Masina, Rulota), Clasa E',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Smart Tech', mpn: '24HN01V3CA', screenInches: 24, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title: 'Televizor LG LED 75NU850B3LA, 189 cm, Smart, 4K Ultra HD, Clasa F (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'LG', mpn: '75NU850B3LA', screenInches: 75, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor LG OLED evo 77C52LA, 195 cm, Smart, 4K Ultra HD, 100 Hz, Clasa F',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'LG', mpn: '77C52LA', screenInches: 77, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title:
      'Televizor SAMSUNG OLED 77S90H, 195 cm, Smart, 4K Ultra HD, 165 Hz, Clasa E (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Samsung', mpn: '77S90H', screenInches: 77, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title:
      'Televizor LG OLED Evo 55C62LA, 138 cm, Smart, 4k Ultra HD, 165 Hz, Clasa F (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'LG', mpn: '55C62LA', screenInches: 55, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor Allview LED 50WiPlay6301-U, 125cm, Smart, 4K Ultra HD, Clasa E',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Allview', mpn: '50WIPLAY6301U', screenInches: 50, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title:
      'Televizor Philips AMBILIGHT tv LED 65PUS8001, 164 cm, Smart TV, 4K Ultra HD, Clasa F (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Philips', mpn: '65PUS8001', screenInches: 65, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title:
      'Televizor LG OLED Evo 77C6ELB, 194 cm, Smart, 4k Ultra HD, 165 Hz, Clasa E (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'LG', mpn: '77C6ELB', screenInches: 77, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title: 'Televizor TCL LED 43P6K, 108 cm, Smart Google TV, 4K Ultra HD, Clasa F',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'TCL', mpn: '43P6K', screenInches: 43, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor METZ QLED 43MQH7000Z, 108 cm, Smart Google TV, Full HD, Clasa E (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Metz', mpn: '43MQH7000Z', screenInches: 43, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title:
      'Televizor TCL SQD-MiniLed 65C7L, 164 cm, QLED, Smart Google TV, 4K Ultra HD, 144Hz, Sunet Bang & Olufsen, Clasa E (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'TCL', mpn: '65C7L', screenInches: 65, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title: 'Televizor TCL QLED 85T69C, 214 cm, Smart Google TV, 4K Ultra HD, Clasa F',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'TCL', mpn: '85T69C', screenInches: 85, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor SAMSUNG MiniLED 85M72H, 214 cm, Smart, 4K Ultra HD, Clasa F (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Samsung', mpn: '85M72H', screenInches: 85, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor Allview LED 43iPlay6300-U, 109 cm, Smart, 4K Ultra HD, Clasa F',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Allview', mpn: '43IPLAY6300U', screenInches: 43, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title:
      'Televizor SAMSUNG MiniLED Neo QLED 55QN85F, 138 cm, Smart, 4K Ultra HD, 100 Hz, Clasa F',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Samsung', mpn: '55QN85F', screenInches: 55, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title:
      'Televizor TCL SQD-MiniLed 98C8L, 248 cm, QLED, Smart Google TV, 4K Ultra HD, 144Hz, Sunet Bang & Olufsen, Clasa D (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'TCL', mpn: '98C8L', screenInches: 98, energyClass: 'D' },
  },
  {
    shop: 'emag',
    title:
      'Televizor TCL MiniLed Art 75A400 Pro, 189 cm, QLED, Smart Google TV, 4K Ultra HD, 144Hz, Clasa E (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'TCL', mpn: '75A400', screenInches: 75, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title:
      'Televizor Philips AMBILIGHT tv QLED 55PQS8501, 139 cm, Smart TV, 4K Ultra HD, Clasa F (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Philips', mpn: '55PQS8501', screenInches: 55, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor SAMSUNG MiniLED 75M72H, 189 cm, Smart, 4K Ultra HD, Clasa F (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Samsung', mpn: '75M72H', screenInches: 75, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title:
      'Televizor SAMSUNG Micro RGB 65R85H, 163cm, Smart, 4K Ultra HD, 144 Hz, Clasa F (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Samsung', mpn: '65R85H', screenInches: 65, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title:
      'Televizor TCL SQD-MiniLed 75X11L, 189 cm, QLED, Smart Google TV, 4K Ultra HD, 144Hz, Clasa G (Model 2026)',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'TCL', mpn: '75X11L', screenInches: 75, energyClass: 'G' },
  },
  {
    shop: 'emag',
    title: 'Televizor QLED Smart Samsung, 138 cm, 55Q6FN, 4K Ultra HD, Clasa A',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Samsung', mpn: '55Q6FN', screenInches: 55, energyClass: 'A' },
  },
  {
    shop: 'emag',
    title: 'Televizor SAMSUNG QLED 55Q7F2, 138 cm, Smart, 4K Ultra HD, Clasa G',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Samsung', mpn: '55Q7F2', screenInches: 55, energyClass: 'G' },
  },
  {
    shop: 'emag',
    title: 'Televizor Allview LED 32ATC6200-H, 81 cm, HD, Clasa E',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Allview', mpn: '32ATC6200H', screenInches: 32, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title:
      'Televizor QLED HYUNDAI 43 HYN 8110 VDQ4K, 108 cm, Smart, 4K Ultra HD, Clasa F ( Model 2024 )',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Hyundai', mpn: '43HYN8110VDQ4K', screenInches: 43, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Consola NINTENDO SWITCH V2 (WITH NEON RED & NEON BLUE JOY-CONS)',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Nintendo', color: 'red' },
  },
  {
    shop: 'emag',
    title:
      'Consola Nintendo Switch 2 + Joc Sport Resort + 90 zile Abonament Nintendo Switch Online pentru Nintendo Switch 2',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Nintendo', isBundle: true },
  },
  {
    shop: 'emag',
    title: 'PlayStation Portal Remote Player, White',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Sony', color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Consola PlayStation 5 Pro, Disc Edition, 2TB SSD',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Sony', storageGb: 2048 },
  },
  {
    shop: 'emag',
    title:
      'Consola Gaming Android 14 INOMEVIX®, Ecran IPS 5.5", Octa-Core, 6GB RAM, 128GB, peste 25.000 jocuri, emulare PS2/PSP/retro, compatibilitate Google Play, WiFi 5G, streaming PC cu Moonlight si Steam Link, Consola jocuri adulti si copii, Consola portabila',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Inomevix', screenInches: 5.5, ramGb: 6, storageGb: 128 },
  },
  {
    shop: 'emag',
    title:
      '‌Consola jocuri retro portabila, Yulinland®, 17.000+ jocuri preinstalate, Suport 10 emulatoare, IPS LCD 3.5" 640x480, Sistem Linux open source, Transparent negru',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Yulinland', screenInches: 3.5, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      "Consola de Jocuri Portabila cu 15.000+ Jocuri incorporate, VisionHub®, Ecran LCD HD 5'' inch, Quad-Core RK3128, 64GB Stocare, Joystick-uri 3D iluminate, Baterie 3500mAh, Emulatoare Multiple, Iesire Video/Audio, Design Compact si Performanta Maxima, Negru",
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'VisionHub', screenInches: 5, storageGb: 64, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Consolă portabilă ASUS ROG Xbox Ally, procesor AMD Ryzen Z2 A, 16GB RAM, 512GB SSD, alb',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'ASUS', ramGb: 16, storageGb: 512, color: 'white' },
  },
  {
    shop: 'emag',
    title:
      'Consola portabila retro ANBERNIC RG35XX H cu jocuri, Bluvista®, quad core Cortex-A53 1.5GHz, 1GB LPDDR4, IPS LCD 3.5" 640x480, 3300 mAh, WiFi 5, Bluetooth 4.2, Negru',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Anbernic', mpn: 'RG35XX', ramGb: 1, screenInches: 3.5, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Consola de jocuri Bedee AR Motion, 28 de jocuri preincarcate, control prin camera si butoane, sistem de jocuri video TV Plug & Play, pentru copii si adulti, Negru',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Bedee', color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Consola retro portabila R36S 64GB cu jocuri, quad core Cortex-A53 1.5GHz, 1GB DDR3, IPS LCD 3.5" 640x480, 3200 mAh, negru transparent',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: null, storageGb: 64, ramGb: 1, screenInches: 3.5, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Consola portabila jocuri, NUODWELL, Cu casti audio, Ecran 4.3 inch, Redare muzica/video/e-book, Peste 6000 de jocuri instalate, Acumulator 1500 mah, Usor de utilizat si de transportat, ABS, 17.5x7.5cm, Gri',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Nuodwell', screenInches: 4.3, color: 'gray' },
  },
  {
    shop: 'emag',
    title:
      'Consola jocuri retro, 620 jocuri clasice incorporate, 2 controllere, iesire AV, plug and play, negru, portabil, pentru TV si familie',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: null, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Consola portabila, Taipintee, 800 jocuri clasice retro, ecran color 3 inch, baterie 1020mAh, iesire AV pentru TV, albastru',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Taipintee', screenInches: 3, color: 'blue' },
  },
  {
    shop: 'emag',
    title:
      'Consola Retro, BYONDSELF®, 128G, 4K, Lesire HDMI de Inalta Definitie, 2 Wireless 2.4 GHz, 20000 de Jocuri Incorporate, Suport 2 Jucatori, Negru',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Byondself', storageGb: 128, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Consola retro tv 9999 jocuri 2 controllere pistol jocuri video clasice copii adulti',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: null },
  },
  {
    shop: 'emag',
    title: 'Consola Portabila Nintendo Game & Watch: Super Mario Bros',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Nintendo' },
  },
  {
    shop: 'emag',
    title: 'Consola Evercade Super Pocket Data East Edition',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Evercade' },
  },
  {
    shop: 'emag',
    title: 'Consola jocuri, Sup, Portabil, 400 jocuri, Rosu',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Sup', color: 'red' },
  },
  {
    shop: 'emag',
    title:
      'Consola SUP Game Box, 400 jocuri, Rotita volum, Ecran LCD de 3.0 ", Cablu AV, Micro-USB, Multiplayer, Portabil, Rosu',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Sup', screenInches: 3, color: 'red' },
  },
  {
    shop: 'emag',
    title:
      'Consola retro 64GB cu jocuri, Poisoon, sistem de operare standard, procesor quad core 1.5GHz, 1GB LPDDR4, IPS OCA 4" 800x680, 3500 mAh, suport card TF, port microfon, portabila, violet transparent',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Poisoon', storageGb: 64, ramGb: 1, screenInches: 4, color: 'purple' },
  },
  {
    shop: 'emag',
    title: 'Consola Retro, 25000+ jocuri, 4K HDMI, 2 controlere wireless 2.4G, Negru, 64GB',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: null, storageGb: 64, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Consola Retro, 25000+ jocuri, 4K HDMI, 2 controlere wireless 2.4G, Negru, 128GB',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: null, storageGb: 128, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Consola de jocuri retro wireless RQQM, 10000+ jocuri, 2 controlere wireless 2.4G, HDMI 4K, 64GB',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'RQQM', storageGb: 64 },
  },
  {
    shop: 'emag',
    title:
      'Consola portabila Mangmi Air X, Qualcomm Snapdragon 662 2GHz, 4GB LPDDR4X, IPS LCD 5.5" 1920x1080, 5000 mAh, WiFi 5, Bluetooth 5.0, alb',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Mangmi', ramGb: 4, screenInches: 5.5, color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Consola PlayStation 5 (PS5) Slim, 1TB SSD, E-Chassis, Fortnite Flowering Chaos Bundle',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Sony', storageGb: 1024, isBundle: true },
  },
  {
    shop: 'emag',
    title: 'Consola Nintendo Switch Lite Yellow + Animal Crossing: New Horizons',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Nintendo', color: 'yellow', isBundle: true },
  },
  {
    shop: 'emag',
    title:
      'Consola de Jocuri Portabila Retro, Darklove, 400 de jocuri, Multiplayer, Controller inclus, Iesire AV, Display 3inch, 1020mAh, Negru',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Darklove', screenInches: 3, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Consola portabila 6000+ jocuri NEXTLY, X6, ecran 3.5 inch, rezolutie 640x480, HD, card sd inclus 32GB, multiplayer, difuzor, redare muzica/video/e-book, acumulator 2000 mah, incarcare tip C, conectare tv, verde inchis',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Nextly', screenInches: 3.5, storageGb: 32, color: 'green' },
  },
  {
    shop: 'emag',
    title:
      'Consola Gameboy, Darklove, 400 in 1, Cu un controler, Joc pentru doi jucatori, Conectare AV TV, Ecran 3 inch, Rosu',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Darklove', screenInches: 3, color: 'red' },
  },
  {
    shop: 'emag',
    title:
      "Consola retro portabila R36TMAX, Bedee, 64GB, Ecran HD IPS de 4.0'' 720x720, Baterie 4000mAh, Reincarcabil, Joystick-uri 3D, CPU RK3326, Emulator N64 PSP PS1 PlayStation Sega, Arcade portabila de buzunar, Wireless, Negru",
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Bedee', storageGb: 64, screenInches: 4, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Consola Microsoft Xbox Series X, 1TB, Negru',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Microsoft', storageGb: 1024, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Consola portabila retro R36T, XONGSOR®, 64GB, 18000+ jocuri, ecran IPS 3.5", WiFi, baterie 3500mAh, albastru',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Xongsor', storageGb: 64, screenInches: 3.5, color: 'blue' },
  },
  {
    shop: 'emag',
    title:
      'Consola retro portabila R36S, Bedee, procesor 64-bit quad-core Cortex A35 1.5GHz,1GB DDR3L RAM, Doua carduri 32GB+128G, ecran IPS OCA MiPi 3.5" 640x480,128GB memorie,21000+ jocuri, peste 10 emulatori, Linux PS1 PSP N64 GBA, joystick precis',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Bedee', ramGb: 1, storageGb: 128, screenInches: 3.5 },
  },
  {
    shop: 'emag',
    title: 'Joc cu afisaj color LCD, Viva, portabil, 400, 3.7V, Negru',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Viva', color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Consola de jocuri portabila X9, Bedee,6000+ jocuri, ecran HD 5.5 inch, Top 10 emulatoare, iesire TV, incarcare USB-C, baterie 2000mAh, memorie extensibila pana la 128GB, design ergonomic ABS',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Bedee', screenInches: 5.5 },
  },
  {
    shop: 'emag',
    title:
      'Consola de Jocuri Portabila, BYONDSELF®, Retro, Ecran IPS 4 Inch, 128GB, 22000+ de Jocuri, 720 x 720, 4000mAh, Ecran HD de Inalta Calitate, Doua Joystick-uri, Mufa pentru Casti, Compact, Negru',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Byondself', screenInches: 4, storageGb: 128, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Consola de Jocuri Portabila Retoo PlayTech, Ecran HD 3.5 inch, 500+ Jocuri, Cablu AV, USB Inclus, Suport 2 Jucatori, Suport Suplimentar cu Fir, Baterie de 1200 mAh Controlul Volumului, Lesire Video TV-OUT, Albastru/Rosu',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Retoo', screenInches: 3.5, color: 'blue' },
  },
  {
    shop: 'emag',
    title: 'Consolă de jocuri Bedee X12plus, 7 inch, 16GB, design ergonomic, multicolor',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Bedee', screenInches: 7, storageGb: 16, color: 'multicolor' },
  },
  {
    shop: 'emag',
    title:
      'Consola Retro Portabila METISTA® X20, Ecran IPS 7 inch, Pana la 10.000 Jocuri, Memorie 32GB, 8 Simulatoare, Baterie 4500mAh, Dual Joystick, Functii Multimedia, Redare Video, Muzica, E-book, Imagini, AV TV, Negru',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Metista', screenInches: 7, storageGb: 32, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'SweetLink S2 Plus Telefon mobil pentru seniori, meniu in limba Romana, taste mari, buton SOS, 1400 mAh, Pentru Varstnici, buton SOS, lanterna, radio, Stand incarcare, negru',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'SweetLink', color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Kiano Slim TV Travel Televizor 19" pentru camion si rulote | LED HD TV | Incarcator auto | HDMI USB | Dolby Audio | Tuner DVB-T2/S2 | Negru |',
    category: 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare',
    expect: { brand: 'Kiano', screenInches: 19, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Gaming Notebook 16 GB RAM 512 GB 1 TB SSD expansiune Core i3 (pana la 3.2 GHz) Laptop Notebook 16 inch 1920 x 1200 IPS UHD 5G WiFi cu mouse si tastatura autocolante Italian-Gri',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: null, ramGb: 16, storageGb: 512, screenInches: 16, color: 'gray' },
  },
  {
    shop: 'emag',
    title:
      'Mini Laptop 8" 2-in-1, Laptop Computer Win 11, Intel N95(up to 3.4GHz), 12GB RAM 512GB SSD, Touchscreen HD, Backlit Keyboard, Wi-Fi 6, USB-C, Lightweight Portable PC for Work/Kids/School',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: null, screenInches: 8, ramGb: 12, storageGb: 512 },
  },
  {
    shop: 'emag',
    title: 'Lenovo LOQ 15ARP9, 15.6", 16GB, GeForce RTX 4050, SSD512, 144Hz',
    category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
    expect: { brand: 'Lenovo', mpn: '15ARP9', screenInches: 15.6, ramGb: 16, storageGb: 512 },
  },
  {
    shop: 'emag',
    title:
      'Gameboy cu 400 de jocuri, multiplayer, 2v2, Retro FC, video prezentare, compatibil TV, portabil, retro, negru',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: null, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Miyoo Mini Plus Consola de joc portabila, culoare mov transparent, ecran IPS 3.5 inch, suport pentru mii de jocuri retro (NES, SNES, Game Boy)',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Miyoo', screenInches: 3.5, color: 'purple' },
  },
  {
    shop: 'emag',
    title: 'Consola PlayStation 5 (PS5) Slim, 1TB SSD, D-Chassis + Joc NBA 2K26',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Sony', storageGb: 1024, isBundle: true },
  },
  {
    shop: 'emag',
    title: 'Consola PlayStation 5 (PS5) Slim, 1TB SSD, E-Chassis, EA Sports FC 26 Bundle',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Sony', storageGb: 1024, isBundle: true },
  },
  {
    shop: 'emag',
    title:
      'Telefon mobil iHunt Primo 4G, Dual SIM, Ecran 2.4-inch, Butoane Mari, Camera Foto, Suport card microSD, Radio FM, Lanterna + Stativ cu statie de incarcare',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'iHunt', screenInches: 2.4, isBundle: true },
  },
  {
    shop: 'emag',
    title:
      'Telefon mobil Motorola edge 70 fusion FIFA edition, 256GB, 8GB RAM, 5G, PANTONE Silhouette (black) + moto buds bass',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    expect: { brand: 'Motorola', storageGb: 256, ramGb: 8, color: 'black', isBundle: true },
  },
  {
    shop: 'emag',
    title:
      'Set 2 Controllers wireless, PS4, PS-TV si PS Now, Double Shock – Touch Pad, Serie-Compatible AM-13, laptop, pad, phone, cu vibratii, cablu incarcator inclus, negru, rosu HAPPY JOKER®',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Happy Joker', color: 'black', isAccessory: true },
  },
  {
    shop: 'emag',
    title:
      'Controller Wireless Dual-Sense pentru PS5, compatibile doar cu jocuri din /PS4/PS4 PRO/PS4 SLIM, negru, senzor de miscare, incarcator dual inclus, HAPPY JOKER®',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Happy Joker', color: 'black', isAccessory: true },
  },
  {
    shop: 'emag',
    title:
      'Consola retro portabila R36S Bluvista®, 64GB cu jocuri, 15000 jocuri, ArkOS 2.0, IPS LCD 3.5" 640x480, CPU RK3326, GPU MALI-G31MP2, 1GB DDR3L, Emulator N64 PSP PS1 PlayStation Sega, Alb',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Bluvista', storageGb: 64, ramGb: 1, screenInches: 3.5, color: 'white' },
  },
  {
    shop: 'emag',
    title:
      'Consola Retro Portabila cu 400 Jocuri si Conexiune TV + Controller pentru Copii si Adulti',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: null },
  },
  {
    shop: 'emag',
    title: 'Joc TV Consola Retro + Pistol 2x Pady + 9999 jocuri',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: null },
  },
  {
    shop: 'emag',
    title: 'Consola PlayStation 5 (PS5) Slim, 1TB SSD, D-Chassis + Extra controller',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Sony', storageGb: 1024, isBundle: true },
  },
  {
    shop: 'emag',
    title: 'Consola PlayStation 5 (PS5) Digital Edition - 30th Anniversary Limited Edition Bundle',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: 'Sony', isBundle: true },
  },
  {
    shop: 'emag',
    title:
      'Consola de Jocuri Portabila LCX 4.3 Inch, card inclus de 64GB, Ecran LCD 480x272, Baterie 2000mAh, Procesor Quad core - Cortex-A7 1.2GHz, Sistem de operare Linux/Emelec 4.3, 25.000 Jocuri Clasice si 150 Jocuri PSP, Suport card TF, Port microfon',
    category: 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware',
    expect: { brand: null, screenInches: 4.3, storageGb: 64 },
  },
];
