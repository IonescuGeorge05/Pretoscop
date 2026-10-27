/**
 * Labelled title corpus for the attribute, brand, MPN, condition, bundle and accessory rules.
 *
 * SYNTHETIC: these titles were written by hand in the styles of eMAG, Altex, Media Galaxy,
 * Flanco, PC Garage, evoMAG, Dedeman, cel.ro and Vexio (2026-10-27), because the Phase-0
 * recorder has not produced real titles yet. The lead appends real, anonymized titles from the
 * recorder's snapshots later (the plan asks for ≥150 real titles); keep the labels honest:
 * label what a careful human reads in the title, never what the code happens to output.
 *
 * Label conventions:
 * - `brand`: canonical brand name, or null when the title names none (accessories "pentru iPhone").
 * - `mpn`: the manufacturer part/model code readable in the title, normalized (upper case, no
 *   separators); null when there is none. Short series names (S25, X200, G923, AX55) are not MPNs.
 * - `storageGb` (1 TB = 1024), `ramGb`, `screenInches`, `color` (canonical key), `energyClass`,
 *   `capacityL`, `capacityKg`: omitted = the title does not state it.
 * - `condition` defaults to `new`; `isBundle` and `isAccessory` default to false.
 */

export type CorpusShop =
  'emag' | 'altex' | 'mediagalaxy' | 'flanco' | 'pcgarage' | 'evomag' | 'dedeman' | 'cel' | 'vexio';

export interface CorpusExpectation {
  brand: string | null;
  mpn?: string | null;
  storageGb?: number;
  ramGb?: number;
  screenInches?: number;
  color?: string;
  energyClass?: string;
  capacityL?: number;
  capacityKg?: number;
  condition?: 'new' | 'refurbished' | 'used';
  isBundle?: boolean;
  isAccessory?: boolean;
}

export interface CorpusEntry {
  title: string;
  shop: CorpusShop;
  expect: CorpusExpectation;
}

export const TITLE_CORPUS: readonly CorpusEntry[] = [
  // ---------------------------------------------------------------- phones
  {
    shop: 'emag',
    title: 'Telefon mobil Samsung Galaxy S25 Ultra, Dual SIM, 12GB RAM, 256GB, 5G, Titanium Black',
    expect: { brand: 'Samsung', ramGb: 12, storageGb: 256, color: 'black' },
  },
  {
    shop: 'altex',
    title: 'Telefon SAMSUNG Galaxy S25 Ultra 5G, 512GB, 12GB RAM, Dual SIM, Titanium Silverblue',
    expect: { brand: 'Samsung', ramGb: 12, storageGb: 512, color: 'blue' },
  },
  {
    shop: 'flanco',
    title: 'Telefon mobil Samsung Galaxy A56 5G, 8GB RAM, 256GB, Awesome Graphite, SM-A566BZKCEUE',
    expect: { brand: 'Samsung', mpn: 'SMA566BZKCEUE', ramGb: 8, storageGb: 256, color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 17 Pro, 256GB, 5G, Cosmic Orange',
    expect: { brand: 'Apple', storageGb: 256, color: 'orange' },
  },
  {
    shop: 'altex',
    title: 'Telefon APPLE iPhone 17 Pro Max 5G, 512GB, Deep Blue, MG8U4QL/A',
    expect: { brand: 'Apple', mpn: 'MG8U4QLA', storageGb: 512, color: 'blue' },
  },
  {
    shop: 'cel',
    title: 'Apple iPhone 16 128GB Black',
    expect: { brand: 'Apple', storageGb: 128, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 16e, 128GB, 5G, White',
    expect: { brand: 'Apple', storageGb: 128, color: 'white' },
  },
  {
    shop: 'evomag',
    title: 'Smartphone Xiaomi Redmi Note 14 Pro 5G, 8GB/256GB, Dual SIM, Midnight Black',
    expect: { brand: 'Xiaomi', ramGb: 8, storageGb: 256, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Redmi Note 14, 6GB RAM, 128GB, 4G, Ocean Blue',
    expect: { brand: 'Xiaomi', ramGb: 6, storageGb: 128, color: 'blue' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil POCO X7 Pro 5G, 12GB RAM, 512GB, Dual SIM, Yellow',
    expect: { brand: 'Xiaomi', ramGb: 12, storageGb: 512, color: 'yellow' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Google Pixel 10 Pro, 16GB RAM, 256GB, 5G, Obsidian',
    expect: { brand: 'Google', ramGb: 16, storageGb: 256, color: 'black' },
  },
  {
    shop: 'flanco',
    title: 'Telefon mobil Motorola Moto G85 5G, 8GB RAM, 256GB, Dual SIM, Cobalt Blue',
    expect: { brand: 'Motorola', ramGb: 8, storageGb: 256, color: 'blue' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Honor 400 Lite, 8GB RAM, 256GB, 5G, Marrs Green',
    expect: { brand: 'Honor', ramGb: 8, storageGb: 256, color: 'green' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil OnePlus 13, 12GB RAM, 256GB, 5G, Black Eclipse',
    expect: { brand: 'OnePlus', ramGb: 12, storageGb: 256, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Nothing Phone (3a), 8GB RAM, 128GB, 5G, White',
    expect: { brand: 'Nothing', ramGb: 8, storageGb: 128, color: 'white' },
  },
  {
    shop: 'altex',
    title: 'Telefon HUAWEI Pura 80 Pro, 512GB, 12GB RAM, Dual SIM, Glazed Black',
    expect: { brand: 'Huawei', ramGb: 12, storageGb: 512, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Oppo Reno14 F 5G, 8GB RAM, 256GB, Opal Blue',
    expect: { brand: 'Oppo', ramGb: 8, storageGb: 256, color: 'blue' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil realme 14 Pro+ 5G, 12GB RAM, 512GB, Pearl White',
    expect: { brand: 'Realme', ramGb: 12, storageGb: 512, color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil vivo X200 FE, 12GB RAM, 512GB, 5G, Amber Yellow',
    expect: { brand: 'Vivo', ramGb: 12, storageGb: 512, color: 'yellow' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Samsung Galaxy Z Fold7, 12GB RAM, 512GB, 5G, Blue Shadow',
    expect: { brand: 'Samsung', ramGb: 12, storageGb: 512, color: 'blue' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Samsung Galaxy Z Flip7 FE, 8GB RAM, 256GB, 5G, Black',
    expect: { brand: 'Samsung', ramGb: 8, storageGb: 256, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Allview Soul X10, Dual SIM, 4GB RAM, 64GB, 4G, Gri',
    expect: { brand: 'Allview', ramGb: 4, storageGb: 64, color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Nokia 3210 4G (2024), Dual SIM, Scuba Blue',
    expect: { brand: 'Nokia', color: 'blue' },
  },
  {
    shop: 'flanco',
    title: 'Telefon mobil Samsung Galaxy A16, Dual SIM, 4GB RAM, 128GB, 4G, Light Green',
    expect: { brand: 'Samsung', ramGb: 4, storageGb: 128, color: 'green' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 15, 128GB, Pink, Resigilat',
    expect: { brand: 'Apple', storageGb: 128, color: 'pink', condition: 'refurbished' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 13, 128GB, Midnight, Refurbished Grad A',
    expect: { brand: 'Apple', storageGb: 128, color: 'black', condition: 'refurbished' },
  },
  {
    shop: 'cel',
    title: 'Telefon mobil Samsung Galaxy S23, 8GB RAM, 256GB, Phantom Black, second hand',
    expect: { brand: 'Samsung', ramGb: 8, storageGb: 256, color: 'black', condition: 'used' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Xiaomi 15T Pro, 12GB RAM, 512GB, 5G, Mocha Gold',
    expect: { brand: 'Xiaomi', ramGb: 12, storageGb: 512, color: 'gold' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Ulefone Armor 28 Ultra, 16GB RAM, 1TB, 5G, Rugged, Negru',
    expect: { brand: 'Ulefone', ramGb: 16, storageGb: 1024, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil CAT S75, Dual SIM, 6GB RAM, 128GB, 5G, Negru',
    expect: { brand: 'CAT', ramGb: 6, storageGb: 128, color: 'black' },
  },
  {
    shop: 'pcgarage',
    title: 'Telefon mobil Samsung Galaxy S25 Edge, 12GB RAM, 256GB, 5G, Titanium Silver',
    expect: { brand: 'Samsung', ramGb: 12, storageGb: 256, color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone Air, 256GB, 5G, Sky Blue',
    expect: { brand: 'Apple', storageGb: 256, color: 'blue' },
  },
  {
    shop: 'evomag',
    title: 'Smartphone Samsung Galaxy S25 FE 5G 8/256GB Navy',
    expect: { brand: 'Samsung', ramGb: 8, storageGb: 256, color: 'blue' },
  },
  {
    shop: 'cel',
    title: 'Telefon Xiaomi 15 Ultra 16/512GB 5G Silver Chrome',
    expect: { brand: 'Xiaomi', ramGb: 16, storageGb: 512, color: 'silver' },
  },
  {
    shop: 'emag',
    title:
      'Cumpara Telefon mobil Samsung Galaxy A26 5G, 6GB RAM, 128GB, Black la pret mic - eMAG.ro',
    expect: { brand: 'Samsung', ramGb: 6, storageGb: 128, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Samsung Galaxy S24 FE, 8GB RAM, 128GB, 5G, Blue + Incarcator 25W cadou',
    expect: { brand: 'Samsung', ramGb: 8, storageGb: 128, color: 'blue', isBundle: true },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 14 Pro, 256GB, Deep Purple, Ca nou',
    expect: { brand: 'Apple', storageGb: 256, color: 'purple', condition: 'used' },
  },
  {
    shop: 'altex',
    title: 'Telefon MOTOROLA razr 60 Ultra 5G, 512GB, 16GB RAM, Dual SIM, Scarab',
    expect: { brand: 'Motorola', ramGb: 16, storageGb: 512 },
  },
  {
    shop: 'vexio',
    title: 'Telefon mobil Honor Magic7 Pro, 12GB RAM, 512GB, 5G, Black',
    expect: { brand: 'Honor', ramGb: 12, storageGb: 512, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Samsung Galaxy A36 5G, 6GB RAM, 128GB, Awesome Lavender',
    expect: { brand: 'Samsung', ramGb: 6, storageGb: 128, color: 'purple' },
  },

  // ---------------------------------------------------------------- tablets and e-readers
  {
    shop: 'emag',
    title: 'Tableta Apple iPad Air 11" (M3), 128GB, Wi-Fi, Space Grey',
    expect: { brand: 'Apple', screenInches: 11, storageGb: 128, color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Tableta Samsung Galaxy Tab S10 FE, 10.9", 8GB RAM, 128GB, Wi-Fi, Gray',
    expect: { brand: 'Samsung', screenInches: 10.9, ramGb: 8, storageGb: 128, color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Tableta Lenovo Tab M11, 11", 4GB RAM, 128GB, Wi-Fi, Luna Grey, cu Lenovo Tab Pen',
    expect: { brand: 'Lenovo', screenInches: 11, ramGb: 4, storageGb: 128, color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Tableta Xiaomi Redmi Pad 2, 11", 4GB RAM, 128GB, Wi-Fi, Graphite Gray',
    expect: { brand: 'Xiaomi', screenInches: 11, ramGb: 4, storageGb: 128, color: 'gray' },
  },
  {
    shop: 'altex',
    title: 'Tableta APPLE iPad 11 (A16), 11", 256GB, Wi-Fi + Cellular, Blue',
    expect: { brand: 'Apple', screenInches: 11, storageGb: 256, color: 'blue' },
  },
  {
    shop: 'flanco',
    title: 'Tableta Samsung Galaxy Tab A9+, 11", 4GB RAM, 64GB, 5G, Graphite',
    expect: { brand: 'Samsung', screenInches: 11, ramGb: 4, storageGb: 64, color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Tableta grafica Wacom One M, Negru',
    expect: { brand: 'Wacom', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Tableta Huawei MatePad 11.5" S PaperMatte, 8GB RAM, 256GB, Wi-Fi, Space Gray',
    expect: { brand: 'Huawei', screenInches: 11.5, ramGb: 8, storageGb: 256, color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'eBook Reader Kindle Paperwhite 2024, 7", 16GB, Wi-Fi, Black',
    expect: { brand: 'Amazon', screenInches: 7, storageGb: 16, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Tableta pentru copii Lenovo Tab M9 Kids, 9", 3GB RAM, 32GB, Wi-Fi, Arctic Grey + Husa protectie',
    expect: {
      brand: 'Lenovo',
      screenInches: 9,
      ramGb: 3,
      storageGb: 32,
      color: 'gray',
      isBundle: true,
    },
  },
  {
    shop: 'emag',
    title: 'Tableta Samsung Galaxy Tab S11 Ultra, 14.6", 12GB RAM, 512GB, 5G, Moonstone Gray',
    expect: { brand: 'Samsung', screenInches: 14.6, ramGb: 12, storageGb: 512, color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Tableta Lenovo Idea Tab Pro, 12.7", 8GB RAM, 256GB, Wi-Fi, Luna Grey, Resigilat',
    expect: {
      brand: 'Lenovo',
      screenInches: 12.7,
      ramGb: 8,
      storageGb: 256,
      color: 'gray',
      condition: 'refurbished',
    },
  },
  {
    shop: 'emag',
    title: 'Tableta Apple iPad Pro 13" (M5), 512GB, Wi-Fi, Space Black, Nano-texture glass',
    expect: { brand: 'Apple', screenInches: 13, storageGb: 512, color: 'black' },
  },

  // ---------------------------------------------------------------- laptops and desktops
  {
    shop: 'emag',
    title:
      'Laptop ASUS Vivobook 16 X1605VA cu procesor Intel® Core™ i5-13420H pana la 4.60 GHz, 16", WUXGA, 16GB, 512GB SSD, Intel UHD Graphics, No OS, Cool Silver',
    expect: {
      brand: 'ASUS',
      mpn: 'X1605VA',
      screenInches: 16,
      ramGb: 16,
      storageGb: 512,
      color: 'silver',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Lenovo IdeaPad Slim 3 15IRH10 cu procesor Intel® Core™ i7-13620H pana la 4.90 GHz, 15.3", WUXGA, 16GB DDR5, 1TB SSD, Intel® UHD Graphics, No OS, Luna Grey',
    expect: {
      brand: 'Lenovo',
      mpn: '15IRH10',
      screenInches: 15.3,
      ramGb: 16,
      storageGb: 1024,
      color: 'gray',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Apple MacBook Air 13" cu cipul M4, 10 nuclee CPU, 8 nuclee GPU, 16GB, 256GB SSD, Sky Blue',
    expect: { brand: 'Apple', screenInches: 13, ramGb: 16, storageGb: 256, color: 'blue' },
  },
  {
    shop: 'altex',
    title:
      'Laptop APPLE MacBook Pro 14" cu cip M5, 10-core CPU, 10-core GPU, 16GB RAM, 512GB SSD, Space Black, MDE04ZE/A',
    expect: {
      brand: 'Apple',
      mpn: 'MDE04ZEA',
      screenInches: 14,
      ramGb: 16,
      storageGb: 512,
      color: 'black',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Gaming HP Victus 15-fb3006nq, AMD Ryzen™ 5 8645HS pana la 5.0 GHz, 15.6", Full HD, 144Hz, 16GB DDR5, 512GB SSD, NVIDIA® GeForce RTX™ 4050 6GB, Free DOS, Mica Silver',
    expect: {
      brand: 'HP',
      mpn: '15FB3006NQ',
      screenInches: 15.6,
      ramGb: 16,
      storageGb: 512,
      color: 'silver',
    },
  },
  {
    shop: 'pcgarage',
    title:
      'Laptop Dell Latitude 5550, Intel Core Ultra 5 125U, 15.6" FHD, 16GB RAM, 512GB SSD, Intel Graphics, Windows 11 Pro, Gray',
    expect: { brand: 'Dell', screenInches: 15.6, ramGb: 16, storageGb: 512, color: 'gray' },
  },
  {
    shop: 'emag',
    title:
      'Laptop Acer Nitro V 15 ANV15-41, AMD Ryzen 7 7735HS, 15.6", Full HD, 144Hz, 16GB, 1TB SSD, GeForce RTX 4060 8GB, No OS, Obsidian Black',
    expect: {
      brand: 'Acer',
      mpn: 'ANV1541',
      screenInches: 15.6,
      ramGb: 16,
      storageGb: 1024,
      color: 'black',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Gaming ASUS ROG Strix G16 G614JV-N3110, Intel Core i7-13650HX, 16", FHD+, 165Hz, 16GB, 1TB SSD, GeForce RTX 4060 8GB, No OS, Eclipse Gray',
    expect: {
      brand: 'ASUS',
      mpn: 'G614JVN3110',
      screenInches: 16,
      ramGb: 16,
      storageGb: 1024,
      color: 'gray',
    },
  },
  {
    shop: 'evomag',
    title:
      'Laptop Lenovo ThinkPad E14 Gen 6, Intel Core i5-1335U, 14" WUXGA, 16GB RAM, 512GB SSD, Windows 11 Pro, Negru, 21M7002BRI',
    expect: {
      brand: 'Lenovo',
      mpn: '21M7002BRI',
      screenInches: 14,
      ramGb: 16,
      storageGb: 512,
      color: 'black',
    },
  },
  {
    shop: 'pcgarage',
    title:
      'Laptop MSI Modern 15 B13M-438XRO, Intel Core i5-1335U, 15.6" FHD, 8GB, 512GB SSD, Intel Iris Xe, No OS, Classic Black',
    expect: {
      brand: 'MSI',
      mpn: 'B13M438XRO',
      screenInches: 15.6,
      ramGb: 8,
      storageGb: 512,
      color: 'black',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop 2 in 1 HP Envy x360 14-fc0009nq, Intel Core Ultra 7 155U, 14" 2.8K OLED Touch, 16GB, 1TB SSD, Windows 11 Home, Meteor Silver',
    expect: {
      brand: 'HP',
      mpn: '14FC0009NQ',
      screenInches: 14,
      ramGb: 16,
      storageGb: 1024,
      color: 'silver',
    },
  },
  {
    shop: 'evomag',
    title:
      "Notebook / Laptop Lenovo 15.6'' LOQ 15IAX9, FHD IPS 144Hz, Procesor Intel® Core™ i5-12450HX, 16GB DDR5, 512GB SSD, GeForce RTX 3050 6GB, No OS, Luna Grey",
    expect: {
      brand: 'Lenovo',
      mpn: '15IAX9',
      screenInches: 15.6,
      ramGb: 16,
      storageGb: 512,
      color: 'gray',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Microsoft Surface Laptop 7, 13.8" PixelSense, Snapdragon X Plus, 16GB RAM, 512GB SSD, Windows 11 Home, Platinum',
    expect: { brand: 'Microsoft', screenInches: 13.8, ramGb: 16, storageGb: 512, color: 'silver' },
  },
  {
    shop: 'emag',
    title:
      'Laptop Gaming Lenovo Legion Pro 7 16IAX10H, Intel Core Ultra 9 275HX, 16" WQXGA OLED 240Hz, 32GB DDR5, 2TB SSD, GeForce RTX 5080 16GB, Windows 11 Home, Eclipse Black',
    expect: {
      brand: 'Lenovo',
      mpn: '16IAX10H',
      screenInches: 16,
      ramGb: 32,
      storageGb: 2048,
      color: 'black',
    },
  },
  {
    shop: 'pcgarage',
    title:
      'Laptop HP 255 G10, AMD Ryzen 5 7530U, 15.6" FHD, 8GB RAM, 512GB SSD, AMD Radeon Graphics, Free DOS, Dark Ash Silver',
    expect: { brand: 'HP', screenInches: 15.6, ramGb: 8, storageGb: 512, color: 'silver' },
  },
  {
    shop: 'emag',
    title:
      'Laptop ASUS Zenbook 14 OLED UX3405CA, Intel Core Ultra 7 255H, 14" 3K OLED, 32GB, 1TB SSD, Windows 11 Home, Ponder Blue, Resigilat',
    expect: {
      brand: 'ASUS',
      mpn: 'UX3405CA',
      screenInches: 14,
      ramGb: 32,
      storageGb: 1024,
      color: 'blue',
      condition: 'refurbished',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Acer Aspire Go 15 AG15-31P, Intel Core i3-N305, 15.6" FHD, 8GB, 512GB SSD, Windows 11 Home S, Pure Silver',
    expect: {
      brand: 'Acer',
      mpn: 'AG1531P',
      screenInches: 15.6,
      ramGb: 8,
      storageGb: 512,
      color: 'silver',
    },
  },
  {
    shop: 'vexio',
    title:
      'Laptop refurbished Dell Latitude 7490, Intel Core i5-8350U, 14" FHD, 16GB DDR4, 256GB SSD, Windows 10 Pro, Grad A',
    expect: {
      brand: 'Dell',
      screenInches: 14,
      ramGb: 16,
      storageGb: 256,
      condition: 'refurbished',
    },
  },
  {
    shop: 'altex',
    title:
      'Laptop Gaming MSI Katana 15 B13VFK, i7-13620H, 15.6" FHD 144Hz, 16GB, 1TB SSD, RTX 4060 8GB, No OS + Mouse Gaming Cadou',
    expect: {
      brand: 'MSI',
      mpn: 'B13VFK',
      screenInches: 15.6,
      ramGb: 16,
      storageGb: 1024,
      isBundle: true,
    },
  },
  {
    shop: 'emag',
    title: 'Laptop Apple MacBook Air 15" cu cip M4, 24GB, 512GB SSD, Midnight - eMAG.ro',
    expect: { brand: 'Apple', screenInches: 15, ramGb: 24, storageGb: 512, color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Laptop ASUS TUF Gaming F16 FX607JV-QT167, Intel Core i7-13650HX, 16" FHD+ 165Hz, 16GB DDR5, 1TB SSD, GeForce RTX 4060 8GB, No OS, Mecha Gray',
    expect: {
      brand: 'ASUS',
      mpn: 'FX607JVQT167',
      screenInches: 16,
      ramGb: 16,
      storageGb: 1024,
      color: 'gray',
    },
  },
  {
    shop: 'pcgarage',
    title:
      'Laptop Lenovo IdeaPad Slim 3 15ABR8, Ryzen 5 7530U, 15.6", 8GB, 512GB SSD, No OS, Arctic Grey, cod produs 82XM00F2RM',
    expect: {
      brand: 'Lenovo',
      mpn: '82XM00F2RM',
      screenInches: 15.6,
      ramGb: 8,
      storageGb: 512,
      color: 'gray',
    },
  },
  {
    shop: 'emag',
    title:
      'Sistem PC Gaming Serioux Powered by ASUS, AMD Ryzen 7 7700, 32GB DDR5, 1TB SSD, GeForce RTX 5070 12GB, Fara sistem de operare',
    expect: { brand: 'Serioux', ramGb: 32, storageGb: 1024 },
  },
  {
    shop: 'emag',
    title: 'Mini PC Apple Mac mini cu cip M4, 16GB, 256GB SSD, Silver',
    expect: { brand: 'Apple', ramGb: 16, storageGb: 256, color: 'silver' },
  },
  {
    shop: 'emag',
    title:
      'Desktop PC Lenovo IdeaCentre AIO 24IRH9, 23.8" FHD, Intel Core i5-13420H, 16GB, 512GB SSD, Windows 11 Home, Cloud Grey',
    expect: {
      brand: 'Lenovo',
      mpn: '24IRH9',
      screenInches: 23.8,
      ramGb: 16,
      storageGb: 512,
      color: 'gray',
    },
  },

  // ---------------------------------------------------------------- PC components and storage
  {
    shop: 'emag',
    title: 'Placa video ASUS TUF Gaming GeForce RTX 5070 Ti OC Edition, 16GB GDDR7, 256-bit',
    expect: { brand: 'ASUS' },
  },
  {
    shop: 'pcgarage',
    title: 'Placa video Gigabyte Radeon RX 9070 XT GAMING OC 16GB GDDR6 256-bit',
    expect: { brand: 'Gigabyte' },
  },
  {
    shop: 'emag',
    title: 'Placa video MSI GeForce RTX 4060 VENTUS 2X BLACK OC 8GB GDDR6 128-bit',
    expect: { brand: 'MSI', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Procesor AMD Ryzen 7 9800X3D, 4.7GHz/5.2GHz, Socket AM5, Box',
    expect: { brand: 'AMD' },
  },
  {
    shop: 'emag',
    title: 'Procesor Intel Core Ultra 7 265K, 3.9GHz, Socket 1851, Box',
    expect: { brand: 'Intel' },
  },
  {
    shop: 'emag',
    title: 'Memorie RAM Kingston FURY Beast 32GB (2x16GB) DDR5 6000MHz CL30 Dual Channel Kit',
    expect: { brand: 'Kingston', ramGb: 32 },
  },
  {
    shop: 'pcgarage',
    title:
      'Memorie Corsair Vengeance RGB 32GB DDR5 6000MHz CL36 Kit Dual Channel, CMH32GX5M2E6000C36',
    expect: { brand: 'Corsair', mpn: 'CMH32GX5M2E6000C36', ramGb: 32 },
  },
  {
    shop: 'emag',
    title: 'SSD Samsung 990 PRO 2TB, PCIe Gen 4.0 x4, NVMe, M.2',
    expect: { brand: 'Samsung', storageGb: 2048 },
  },
  {
    shop: 'emag',
    title: 'SSD Kingston NV3 1TB, PCIe 4.0 x4, M.2 2280, NVMe',
    expect: { brand: 'Kingston', storageGb: 1024 },
  },
  {
    shop: 'pcgarage',
    title: 'SSD WD Black SN850X 1TB PCI Express 4.0 x4 M.2 2280',
    expect: { brand: 'Western Digital', mpn: 'SN850X', storageGb: 1024 },
  },
  {
    shop: 'emag',
    title: 'Hard disk Seagate BarraCuda 2TB, 7200rpm, 256MB cache, SATA-III, ST2000DM008',
    expect: { brand: 'Seagate', mpn: 'ST2000DM008', storageGb: 2048 },
  },
  {
    shop: 'pcgarage',
    title: 'Placa de baza ASUS ROG STRIX B650-A GAMING WIFI, Socket AM5',
    expect: { brand: 'ASUS' },
  },
  {
    shop: 'emag',
    title: 'Sursa Corsair RM850e, 850W, 80+ Gold, Full Modulara',
    expect: { brand: 'Corsair', mpn: 'RM850E' },
  },
  {
    shop: 'emag',
    title: 'Carcasa Lian Li O11 Dynamic EVO, Mid-Tower, Tempered Glass, Alb',
    expect: { brand: 'Lian Li', color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Cooler procesor ARCTIC Liquid Freezer III 360 A-RGB, Negru',
    expect: { brand: 'Arctic', color: 'black' },
  },
  {
    shop: 'pcgarage',
    title: 'Cooler CPU Noctua NH-D15 chromax.black',
    expect: { brand: 'Noctua', mpn: 'NHD15', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Ventilator be quiet! Silent Wings 4 120mm PWM',
    expect: { brand: 'be quiet!' },
  },
  {
    shop: 'emag',
    title: 'Placa video Sapphire PULSE AMD Radeon RX 9060 XT 16GB GDDR6',
    expect: { brand: 'Sapphire' },
  },
  {
    shop: 'pcgarage',
    title: 'Memorie G.Skill Trident Z5 RGB 64GB (2x32GB) DDR5 6400MHz CL32',
    expect: { brand: 'G.Skill', ramGb: 64 },
  },
  {
    shop: 'emag',
    title: 'SSD extern Samsung T7 Shield 2TB, USB 3.2 Gen 2, Beige',
    expect: { brand: 'Samsung', storageGb: 2048, color: 'beige' },
  },
  {
    shop: 'emag',
    title: 'Stick memorie USB SanDisk Ultra Flair 128GB, USB 3.0',
    expect: { brand: 'SanDisk', storageGb: 128 },
  },
  {
    shop: 'emag',
    title: 'Card de memorie Samsung PRO Plus microSDXC 256GB, UHS-I U3, A2, V30 + adaptor SD',
    expect: { brand: 'Samsung', storageGb: 256 },
  },
  {
    shop: 'pcgarage',
    title: 'Placa video PNY GeForce RTX 5060 Ti 16GB OC Dual Fan',
    expect: { brand: 'PNY' },
  },
  {
    shop: 'pcgarage',
    title: 'Sursa Seasonic FOCUS GX-750 V4, 750W, 80+ Gold, Full Modulara',
    expect: { brand: 'Seasonic', mpn: 'GX750' },
  },
  {
    shop: 'emag',
    title: 'Hard Disk extern WD Elements Portable 2TB, USB 3.0, 2.5 inch, Negru',
    expect: { brand: 'Western Digital', storageGb: 2048, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'SSD Crucial P3 Plus 1TB, PCIe Gen 4.0 x4, M.2',
    expect: { brand: 'Crucial', storageGb: 1024 },
  },

  // ---------------------------------------------------------------- monitors
  {
    shop: 'emag',
    title: 'Monitor LED Dell P2425H, 23.8", Full HD, IPS, 100Hz, 5ms, Negru',
    expect: { brand: 'Dell', mpn: 'P2425H', screenInches: 23.8, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Monitor Gaming LG UltraGear 27GS95QE-B, 27", OLED, QHD, 240Hz, 0.03ms, Negru',
    expect: { brand: 'LG', mpn: '27GS95QEB', screenInches: 27, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Monitor LED Samsung Odyssey G5 LS27CG510EUXEN, 27", QHD, 165Hz, 1ms, FreeSync Premium',
    expect: { brand: 'Samsung', mpn: 'LS27CG510EUXEN', screenInches: 27 },
  },
  {
    shop: 'pcgarage',
    title: 'Monitor Gaming AOC 24G4X, 23.8", Fast IPS, Full HD, 180Hz, 1ms, Negru',
    expect: { brand: 'AOC', mpn: '24G4X', screenInches: 23.8, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Monitor IPS Philips 27E1N1300AE, 27", Full HD, 100Hz, USB-C, Boxe, Negru',
    expect: { brand: 'Philips', mpn: '27E1N1300AE', screenInches: 27, color: 'black' },
  },
  {
    shop: 'evomag',
    title: 'Monitor ASUS ProArt PA278QV, 27", WQHD, IPS, 75Hz, 5ms, Negru',
    expect: { brand: 'ASUS', mpn: 'PA278QV', screenInches: 27, color: 'black' },
  },
  {
    shop: 'evomag',
    title: 'Monitor BenQ MOBIUZ EX2710Q 27 inch, QHD, IPS, 165Hz, 1ms',
    expect: { brand: 'BenQ', mpn: 'EX2710Q', screenInches: 27 },
  },
  {
    shop: 'emag',
    title: 'Monitor curbat Samsung Odyssey G9 OLED LS49DG950SUXEN, 49", DQHD, 240Hz',
    expect: { brand: 'Samsung', mpn: 'LS49DG950SUXEN', screenInches: 49 },
  },
  {
    shop: 'emag',
    title: 'Monitor Xiaomi Gaming Monitor G27i 2026, 27", Fast IPS, FHD, 180Hz',
    expect: { brand: 'Xiaomi', screenInches: 27 },
  },
  {
    shop: 'emag',
    title: 'Monitor Samsung Smart M8 LS32DM801UUXDU, 32", 4K UHD, Smart TV, Webcam, Warm White',
    expect: { brand: 'Samsung', mpn: 'LS32DM801UUXDU', screenInches: 32, color: 'white' },
  },

  // ---------------------------------------------------------------- TVs
  {
    shop: 'emag',
    title: 'Televizor LED Samsung 55DU7172, 138 cm, Smart, 4K Ultra HD, Clasa G',
    expect: { brand: 'Samsung', mpn: '55DU7172', screenInches: 55, energyClass: 'G' },
  },
  {
    shop: 'altex',
    title: 'Televizor SAMSUNG UE55DU7172UXXH, 138 cm, Smart, 4K Ultra HD, LED, Clasa G',
    expect: { brand: 'Samsung', mpn: 'UE55DU7172UXXH', screenInches: 55, energyClass: 'G' },
  },
  {
    shop: 'emag',
    title: 'Televizor OLED LG OLED55C46LA, 139 cm, Smart, 4K Ultra HD, 100Hz, Clasa F',
    expect: { brand: 'LG', mpn: 'OLED55C46LA', screenInches: 55, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title:
      'Televizor LED Sony BRAVIA KD-65X75WL, 164 cm, Smart Google TV, 4K Ultra HD, HDR, Clasa F',
    expect: { brand: 'Sony', mpn: 'KD65X75WL', screenInches: 65, energyClass: 'F' },
  },
  {
    shop: 'flanco',
    title: 'Televizor QLED TCL 65C655, 164 cm, Smart Google TV, 4K Ultra HD, HDR10+, Clasa F',
    expect: { brand: 'TCL', mpn: '65C655', screenInches: 65, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor Hisense 43A6N, 108 cm, Smart, 4K Ultra HD, LED, Clasa E',
    expect: { brand: 'Hisense', mpn: '43A6N', screenInches: 43, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title: 'Televizor LED Philips 50PUS8009/12, 126 cm, Smart Titan OS, 4K UHD, Ambilight, Clasa F',
    expect: { brand: 'Philips', mpn: '50PUS800912', screenInches: 50, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor Smart LED Vortex V32TD1200, 80 cm, HD, Clasa E',
    expect: { brand: 'Vortex', mpn: 'V32TD1200', screenInches: 32, energyClass: 'E' },
  },
  {
    shop: 'altex',
    title: 'Televizor ALLVIEW 40ePlay6100-F, 101 cm, Smart Android, Full HD, Clasa F',
    expect: { brand: 'Allview', mpn: '40EPLAY6100F', screenInches: 40, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor Samsung Neo QLED QE75QN90DATXXH, 189 cm, Smart, 4K, 120Hz, Clasa F',
    expect: { brand: 'Samsung', mpn: 'QE75QN90DATXXH', screenInches: 75, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor LG 86QNED86T6A, 218 cm, Smart, 4K Ultra HD, QNED, Clasa F',
    expect: { brand: 'LG', mpn: '86QNED86T6A', screenInches: 86, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor Xiaomi TV A Pro 2025 55", QLED, 4K, Google TV',
    expect: { brand: 'Xiaomi', screenInches: 55 },
  },
  {
    shop: 'emag',
    title: 'Televizor Smart Tech 24HN10T3, 60 cm, HD Ready, Clasa E',
    expect: { brand: 'Smart Tech', mpn: '24HN10T3', screenInches: 24, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title: 'Televizor Panasonic TV-65W93AEG, 164 cm, Smart, 4K Ultra HD, HDR, Clasa G',
    expect: { brand: 'Panasonic', mpn: 'TV65W93AEG', screenInches: 65, energyClass: 'G' },
  },
  {
    shop: 'emag',
    title: 'Televizor Nei 32NE4505, 81 cm, Smart, HD, Clasa F',
    expect: { brand: 'Nei', mpn: '32NE4505', screenInches: 32, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Televizor TCL 98P745, 248 cm, Smart Google TV, 4K Ultra HD, 144Hz, Clasa G, Resigilat',
    expect: {
      brand: 'TCL',
      mpn: '98P745',
      screenInches: 98,
      energyClass: 'G',
      condition: 'refurbished',
    },
  },
  {
    shop: 'altex',
    title: 'Televizor LED Samsung 43DU7172, 108 cm, Smart, 4K Ultra HD, Clasa G | Altex',
    expect: { brand: 'Samsung', mpn: '43DU7172', screenInches: 43, energyClass: 'G' },
  },
  {
    shop: 'emag',
    title: 'Televizor Samsung 65DU7172, 163 cm, Smart, 4K Ultra HD, Clasa G, Ambalaj deteriorat',
    expect: {
      brand: 'Samsung',
      mpn: '65DU7172',
      screenInches: 65,
      energyClass: 'G',
      condition: 'refurbished',
    },
  },
  {
    shop: 'mediagalaxy',
    title: 'Televizor HISENSE 55E7Q, 139 cm, Smart, 4K Ultra HD, QLED, Clasa F',
    expect: { brand: 'Hisense', mpn: '55E7Q', screenInches: 55, energyClass: 'F' },
  },

  // ---------------------------------------------------------------- audio
  {
    shop: 'emag',
    title: 'Casti audio wireless Sony WH-1000XM6, Noise Cancelling, Bluetooth, Negru',
    expect: { brand: 'Sony', mpn: 'WH1000XM6', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Casti True Wireless Apple AirPods Pro 3, ANC, USB-C, Alb',
    expect: { brand: 'Apple', color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Casti In-Ear Samsung Galaxy Buds3 Pro, ANC, Silver',
    expect: { brand: 'Samsung', color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Boxa portabila JBL Flip 7, Bluetooth, IP68, Albastru',
    expect: { brand: 'JBL', color: 'blue' },
  },
  {
    shop: 'emag',
    title: 'Boxa portabila JBL PartyBox Encore Essential 2, 100W, Bluetooth, Negru',
    expect: { brand: 'JBL', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Soundbar Samsung HW-Q600F, 3.1.2, 360W, Dolby Atmos, Wireless Subwoofer, Negru',
    expect: { brand: 'Samsung', mpn: 'HWQ600F', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Casti gaming HyperX Cloud III Wireless, Negru/Rosu',
    expect: { brand: 'HyperX', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Boxa inteligenta Amazon Echo Dot (5th Gen), Alexa, Charcoal',
    expect: { brand: 'Amazon', color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Sistem audio Marshall Stanmore III, Bluetooth, Negru',
    expect: { brand: 'Marshall', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Casti Bose QuietComfort Ultra Headphones (2nd Gen), Black',
    expect: { brand: 'Bose', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Casti Beats Studio Pro Wireless, Deep Brown',
    expect: { brand: 'Beats', color: 'brown' },
  },
  {
    shop: 'emag',
    title: 'Microfon Rode NT-USB Mini, USB, Negru',
    expect: { brand: 'Rode', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Casti Apple AirPods 4 cu Active Noise Cancellation, Alb',
    expect: { brand: 'Apple', color: 'white' },
  },
  {
    shop: 'altex',
    title: 'Boxa portabila SONY ULT Field 1, Bluetooth, IP67, Negru',
    expect: { brand: 'Sony', color: 'black' },
  },

  // ---------------------------------------------------------------- consoles and games
  {
    shop: 'emag',
    title: 'Consola PlayStation 5 Slim Digital Edition, 1TB + joc EA FC 26',
    expect: { brand: 'Sony', storageGb: 1024, isBundle: true },
  },
  {
    shop: 'emag',
    title: 'Consola Sony PlayStation 5 Pro, 2TB, Alb',
    expect: { brand: 'Sony', storageGb: 2048, color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Consola Sony PlayStation 5 Slim (Disc), 1TB, CFI-2016',
    expect: { brand: 'Sony', mpn: 'CFI2016', storageGb: 1024 },
  },
  {
    shop: 'emag',
    title: 'Consola Nintendo Switch 2, 256GB, 7.9", Negru',
    expect: { brand: 'Nintendo', storageGb: 256, screenInches: 7.9, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Consola Nintendo Switch 2 + Mario Kart World (cod descarcare)',
    expect: { brand: 'Nintendo', isBundle: true },
  },
  {
    shop: 'emag',
    title: 'Consola Microsoft Xbox Series X, 1TB, Negru',
    expect: { brand: 'Microsoft', storageGb: 1024, color: 'black' },
  },
  {
    shop: 'altex',
    title: 'Consola Xbox Series S 512GB, Robot White',
    expect: { brand: 'Microsoft', storageGb: 512, color: 'white' },
  },
  {
    shop: 'emag',
    title:
      'Consola portabila ASUS ROG Xbox Ally X, 24GB RAM, 1TB SSD, 7", AMD Ryzen Z2 Extreme, Negru',
    expect: { brand: 'ASUS', ramGb: 24, storageGb: 1024, screenInches: 7, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Joc EA SPORTS FC 26 pentru PlayStation 5',
    expect: { brand: 'Electronic Arts' },
  },
  { shop: 'emag', title: 'Joc Ghost of Yotei Standard Edition PS5', expect: { brand: null } },
  {
    shop: 'emag',
    title: 'Controller wireless Sony DualSense pentru PlayStation 5, Midnight Black',
    expect: { brand: 'Sony', color: 'black', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Volan Logitech G923 TRUEFORCE pentru PS5/PS4/PC',
    expect: { brand: 'Logitech', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Ochelari VR Meta Quest 3S, 128GB, Alb',
    expect: { brand: 'Meta', storageGb: 128, color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Consola Valve Steam Deck OLED, 512GB, 7.4"',
    expect: { brand: 'Valve', storageGb: 512, screenInches: 7.4 },
  },
  {
    shop: 'emag',
    title:
      'Pachet Consola Sony PlayStation 5 Slim Digital, 1TB + 2 controllere DualSense + joc Astro Bot',
    expect: { brand: 'Sony', storageGb: 1024, isBundle: true },
  },
  {
    shop: 'cel',
    title: 'Consola Sony PlayStation 4 Slim 500GB, Negru, folosita',
    expect: { brand: 'Sony', storageGb: 500, color: 'black', condition: 'used' },
  },
  {
    shop: 'emag',
    title: 'Set Consola PlayStation 5 Slim Digital + 2 jocuri (Gran Turismo 7, Spider-Man 2)',
    expect: { brand: 'Sony', isBundle: true },
  },

  // ---------------------------------------------------------------- smartwatches and wearables
  {
    shop: 'emag',
    title:
      'Smartwatch Apple Watch Series 11, GPS, Carcasa Aluminiu 46mm, Jet Black, Curea Sport M/L',
    expect: { brand: 'Apple', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Ceas smartwatch Samsung Galaxy Watch8, 44mm, BT, Graphite',
    expect: { brand: 'Samsung', color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Smartwatch Garmin Forerunner 265, 46mm, AMOLED, Black/Powder Grey',
    expect: { brand: 'Garmin', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Bratara fitness Xiaomi Smart Band 10, AMOLED 1.72", Midnight Black',
    expect: { brand: 'Xiaomi', screenInches: 1.72, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Smartwatch Huawei Watch GT 5 Pro 46mm, Titanium Strap, Titanium',
    expect: { brand: 'Huawei', color: 'titanium' },
  },
  {
    shop: 'emag',
    title: 'Smartwatch Amazfit Balance 2, 47mm, Negru',
    expect: { brand: 'Amazfit', color: 'black' },
  },
  {
    shop: 'emag',
    title:
      'Smartwatch Apple Watch Ultra 3, GPS + Cellular, 49mm, Carcasa Titan Natural, Curea Trail Loop Albastru',
    expect: { brand: 'Apple', color: 'natural_titanium' },
  },
  {
    shop: 'emag',
    title:
      'Smartwatch Google Pixel Watch 4, 45mm, LTE, Matte Black Aluminium, Obsidian Active Band',
    expect: { brand: 'Google', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Ceas inteligent Huawei Watch Fit 4, Black',
    expect: { brand: 'Huawei', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Smartwatch copii Xplora X6 Play, 4G, GPS, Albastru',
    expect: { brand: 'Xplora', color: 'blue' },
  },

  // ---------------------------------------------------------------- large appliances
  {
    shop: 'emag',
    title: 'Masina de spalat rufe Arctic APL81222XLAB4, 8 kg, 1200 RPM, Clasa A, Alb',
    expect: {
      brand: 'Arctic',
      mpn: 'APL81222XLAB4',
      capacityKg: 8,
      energyClass: 'A',
      color: 'white',
    },
  },
  {
    shop: 'emag',
    title:
      'Masina de spalat rufe Samsung WW90DB7U94GBU4, 9 kg, 1400 RPM, Clasa A, Ecobubble, AI Control, Negru',
    expect: {
      brand: 'Samsung',
      mpn: 'WW90DB7U94GBU4',
      capacityKg: 9,
      energyClass: 'A',
      color: 'black',
    },
  },
  {
    shop: 'dedeman',
    title: 'Masina de spalat rufe slim Beko WUE6612DBA, 6 kg, 1200 rpm, clasa D, alb',
    expect: { brand: 'Beko', mpn: 'WUE6612DBA', capacityKg: 6, energyClass: 'D', color: 'white' },
  },
  {
    shop: 'emag',
    title:
      'Masina de spalat rufe cu uscator Bosch WNA254U0BY, 10.5/6 kg, 1400 rpm, Clasa D/E, Serie 6, Alb',
    expect: {
      brand: 'Bosch',
      mpn: 'WNA254U0BY',
      capacityKg: 10.5,
      energyClass: 'D',
      color: 'white',
    },
  },
  {
    shop: 'emag',
    title: 'Uscator de rufe Electrolux EW7D394UE, Pompa de caldura, 9 kg, Clasa A+++, Alb',
    expect: {
      brand: 'Electrolux',
      mpn: 'EW7D394UE',
      capacityKg: 9,
      energyClass: 'A+++',
      color: 'white',
    },
  },
  {
    shop: 'emag',
    title: 'Frigider cu doua usi Arctic AD60240M30W, 223 l, Clasa E, H 144 cm, Alb',
    expect: {
      brand: 'Arctic',
      mpn: 'AD60240M30W',
      capacityL: 223,
      energyClass: 'E',
      color: 'white',
    },
  },
  {
    shop: 'emag',
    title: 'Combina frigorifica Samsung RB34C632ESA/EF, 344 l, No Frost, Clasa E, H 185 cm, Inox',
    expect: {
      brand: 'Samsung',
      mpn: 'RB34C632ESAEF',
      capacityL: 344,
      energyClass: 'E',
      color: 'silver',
    },
  },
  {
    shop: 'flanco',
    title:
      'Combina frigorifica LG GBB72PZVCN1, 384 l, Total No Frost, Clasa C, Inverter Linear Compressor, 203 cm, Platinum Silver',
    expect: { brand: 'LG', mpn: 'GBB72PZVCN1', capacityL: 384, energyClass: 'C', color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Frigider Side by Side Hisense RS711N4WFE, 562 l, Total No Frost, Clasa E, Inox',
    expect: {
      brand: 'Hisense',
      mpn: 'RS711N4WFE',
      capacityL: 562,
      energyClass: 'E',
      color: 'silver',
    },
  },
  {
    shop: 'dedeman',
    title: 'Lada frigorifica Heinner HCF-205NHA+, 200 l, Clasa F, Alb',
    expect: {
      brand: 'Heinner',
      mpn: 'HCF205NHA',
      capacityL: 200,
      energyClass: 'F',
      color: 'white',
    },
  },
  {
    shop: 'emag',
    title: 'Masina de spalat vase Bosch SMS4EVI14E, 13 seturi, Clasa C, 60 cm, Inox',
    expect: { brand: 'Bosch', mpn: 'SMS4EVI14E', energyClass: 'C', color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Masina de spalat vase incorporabila Whirlpool W7I HP42 L, 14 seturi, Clasa C',
    expect: { brand: 'Whirlpool', mpn: 'W7IHP42L', energyClass: 'C' },
  },
  {
    shop: 'emag',
    title: 'Cuptor incorporabil Electrolux EOF5C50BX, Electric, 72 l, Grill, Clasa A, Inox',
    expect: {
      brand: 'Electrolux',
      mpn: 'EOF5C50BX',
      capacityL: 72,
      energyClass: 'A',
      color: 'silver',
    },
  },
  {
    shop: 'emag',
    title: 'Plita incorporabila Beko HII64200FMT, Inductie, 4 zone, 60 cm, Negru',
    expect: { brand: 'Beko', mpn: 'HII64200FMT', color: 'black' },
  },
  {
    shop: 'dedeman',
    title: 'Aragaz Gorenje GK5C40WF, 4 arzatoare, Cuptor gaz 70 l, Clasa A, Alb',
    expect: { brand: 'Gorenje', mpn: 'GK5C40WF', capacityL: 70, energyClass: 'A', color: 'white' },
  },
  {
    shop: 'dedeman',
    title: 'Hota decorativa Teka DLH 686 T, 60 cm, 680 m3/h, Clasa A, Inox',
    expect: { brand: 'Teka', mpn: 'DLH686T', energyClass: 'A', color: 'silver' },
  },
  {
    shop: 'emag',
    title:
      'Aer conditionat Daikin Sensira FTXF35E, 12000 BTU, Inverter, Clasa A++, Wi-Fi, Kit instalare inclus',
    expect: { brand: 'Daikin', mpn: 'FTXF35E', energyClass: 'A++' },
  },
  {
    shop: 'dedeman',
    title: 'Aparat de aer conditionat Gree Pular GWH12AGB, 12000 BTU, Clasa A++, Inverter, Alb',
    expect: { brand: 'Gree', mpn: 'GWH12AGB', energyClass: 'A++', color: 'white' },
  },
  {
    shop: 'dedeman',
    title: 'Boiler electric Ariston Pro1 Eco 80 V EU, 80 l, 1800 W, Clasa C',
    expect: { brand: 'Ariston', capacityL: 80, energyClass: 'C' },
  },
  {
    shop: 'emag',
    title:
      'Masina de spalat rufe Whirlpool FFB 8458 BV EE, 8 kg, 1400 rpm, Clasa A, Alb, Resigilat',
    expect: {
      brand: 'Whirlpool',
      mpn: 'FFB8458BVEE',
      capacityKg: 8,
      energyClass: 'A',
      color: 'white',
      condition: 'refurbished',
    },
  },
  {
    shop: 'emag',
    title: 'Congelator Samsung RZ32C7BDEWW/EF, 323 l, No Frost, Clasa E, Alb',
    expect: {
      brand: 'Samsung',
      mpn: 'RZ32C7BDEWWEF',
      capacityL: 323,
      energyClass: 'E',
      color: 'white',
    },
  },
  {
    shop: 'emag',
    title: 'Frigider incorporabil Whirlpool ARG180701, 314 l, Clasa F, Alb',
    expect: {
      brand: 'Whirlpool',
      mpn: 'ARG180701',
      capacityL: 314,
      energyClass: 'F',
      color: 'white',
    },
  },
  {
    shop: 'emag',
    title: 'Cuptor cu microunde Samsung MS23K3513AK/OL, 23 l, 800 W, Negru',
    expect: { brand: 'Samsung', mpn: 'MS23K3513AKOL', capacityL: 23, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Masina de spalat rufe Candy Smart Pro CO4 1074TWM6/1-S, 7 kg, 1400 RPM, Clasa A, Alb',
    expect: { brand: 'Candy', mpn: '1074TWM61S', capacityKg: 7, energyClass: 'A', color: 'white' },
  },

  // ---------------------------------------------------------------- small appliances and personal care
  {
    shop: 'emag',
    title: "Espressor automat De'Longhi Magnifica Start ECAM220.21.B, 1450 W, 15 bar, Negru",
    expect: { brand: "De'Longhi", mpn: 'ECAM22021B', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Espressor automat DeLonghi Dinamica Plus ECAM370.85.SB, 1450W, Lapte, Argintiu/Negru',
    expect: { brand: "De'Longhi", mpn: 'ECAM37085SB', color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Espressor Philips seria 3300 EP3341/50, LatteGo, 1500 W, 15 bar, Negru',
    expect: { brand: 'Philips', mpn: 'EP334150', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Friteuza cu aer cald Philips Airfryer XXL HD9285/90, 7.2 l, 2000 W, Negru',
    expect: { brand: 'Philips', mpn: 'HD928590', capacityL: 7.2, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Friteuza cu aer cald Ninja Foodi Dual Zone AF300EU, 7.6 l, 2470 W, Negru/Gri',
    expect: { brand: 'Ninja', mpn: 'AF300EU', capacityL: 7.6, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Friteuza fara ulei Cosori Pro LE CAF-L501-KEU, 4.7 l, 1500 W, Negru',
    expect: { brand: 'Cosori', mpn: 'CAFL501KEU', capacityL: 4.7, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Aspirator vertical Dyson V15 Detect Absolute, 660 W, 0.76 l, Galben/Nichel',
    expect: { brand: 'Dyson', capacityL: 0.76, color: 'yellow' },
  },
  {
    shop: 'emag',
    title: 'Aspirator robot Roborock Qrevo Curv 2 Pro, Mop, 25000 Pa, Statie de autogolire, Negru',
    expect: { brand: 'Roborock', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Aspirator robot Xiaomi Robot Vacuum S20+, Mop, 6000 Pa, Alb',
    expect: { brand: 'Xiaomi', color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Aspirator fara sac Rowenta Compact Power XXL RO4B50EA, 900 W, 2.5 l, Clasa A, Negru',
    expect: { brand: 'Rowenta', mpn: 'RO4B50EA', capacityL: 2.5, energyClass: 'A', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Fierbator Tefal KO6931, 1.7 l, 2400 W, Inox',
    expect: { brand: 'Tefal', mpn: 'KO6931', capacityL: 1.7, color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Blender Ninja TB201EU, 1200 W, 2.1 l, Auto-iQ, Negru',
    expect: { brand: 'Ninja', mpn: 'TB201EU', capacityL: 2.1, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Robot de bucatarie KitchenAid Artisan 5KSM175PSEER, 4.8 l, 300 W, Empire Red',
    expect: { brand: 'KitchenAid', mpn: '5KSM175PSEER', capacityL: 4.8, color: 'red' },
  },
  {
    shop: 'emag',
    title: 'Mixer vertical Braun MultiQuick 5 MQ5235WH, 1000 W, Alb',
    expect: { brand: 'Braun', mpn: 'MQ5235WH', color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Uscator de par Dyson Supersonic HD07, 1600 W, Nichel/Cupru',
    expect: { brand: 'Dyson', color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Aparat de tuns Philips OneBlade Pro 360 QP6551/15, Lama 360, Acumulator',
    expect: { brand: 'Philips', mpn: 'QP655115' },
  },
  {
    shop: 'emag',
    title: 'Periuta de dinti electrica Oral-B iO Series 9, Black Onyx',
    expect: { brand: 'Oral-B', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Placa de par Remington S9100 PROluxe, 230°C, Negru/Roz',
    expect: { brand: 'Remington', mpn: 'S9100', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Cantar de baie inteligent Xiaomi Body Composition Scale S400, Alb',
    expect: { brand: 'Xiaomi', color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Purificator de aer Philips Seria 2000 AC2887/10, 79 m², Filtru HEPA, Alb',
    expect: { brand: 'Philips', mpn: 'AC288710', color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Cafetiera Russell Hobbs Heaven 26960-56, 1.25 l, 1100 W, Inox',
    expect: { brand: 'Russell Hobbs', mpn: '2696056', capacityL: 1.25, color: 'silver' },
  },
  {
    shop: 'dedeman',
    title: 'Masina de paine Heinner HBM-900XBK, 900 W, 1 kg, Negru',
    expect: { brand: 'Heinner', mpn: 'HBM900XBK', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Statie de calcat Philips PerfectCare 7000 PSG7140/20, 2700 W, 7.5 bar, 1.8 l',
    expect: { brand: 'Philips', mpn: 'PSG714020', capacityL: 1.8 },
  },
  {
    shop: 'emag',
    title: 'Aspirator cu sac Bosch Serie 4 BGLS4A444, 600 W, 4 l, Clasa A, Negru',
    expect: { brand: 'Bosch', mpn: 'BGLS4A444', capacityL: 4, energyClass: 'A', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Aspirator vertical Samsung Bespoke Jet AI VS90F40DSK/GE, 280 W, Satin Black',
    expect: { brand: 'Samsung', mpn: 'VS90F40DSKGE', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Set cutite Tefal Ice Force, 5 piese, Inox',
    expect: { brand: 'Tefal', color: 'silver' },
  },

  // ---------------------------------------------------------------- accessories and peripherals
  {
    shop: 'emag',
    title: 'Husa de protectie pentru iPhone 17 Pro, Silicon, Negru',
    expect: { brand: null, color: 'black', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Husa Apple Silicone Case cu MagSafe pentru iPhone 17 Pro Max, Ink Blue',
    expect: { brand: 'Apple', color: 'blue', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Folie sticla Spigen Glas.tR EZ Fit pentru Samsung Galaxy S25 Ultra, 2 bucati',
    expect: { brand: 'Spigen', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Incarcator retea Samsung EP-T2510, 25W, USB-C, Alb',
    expect: { brand: 'Samsung', mpn: 'EPT2510', color: 'white', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Cablu de date Ugreen USB-C la Lightning, 1m, Alb',
    expect: { brand: 'Ugreen', color: 'white', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Incarcator Apple 20W USB-C Power Adapter, Alb',
    expect: { brand: 'Apple', color: 'white', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Husa laptop Tellur 15.6 inch, Neopren, Negru',
    expect: { brand: 'Tellur', screenInches: 15.6, color: 'black', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Suport TV de perete Hama, 32-65", max. 35 kg, Negru',
    expect: { brand: 'Hama', color: 'black', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Rucsac laptop Samsonite Mysight 15.6", Negru',
    expect: { brand: 'Samsonite', screenInches: 15.6, color: 'black', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Curea pentru Apple Watch 42/44/45/46mm, Silicon, Midnight',
    expect: { brand: null, color: 'black', isAccessory: true },
  },
  { shop: 'emag', title: 'Stylus Apple Pencil Pro', expect: { brand: 'Apple', isAccessory: true } },
  {
    shop: 'emag',
    title: 'Hub USB-C Baseus 6 in 1, HDMI 4K, USB 3.0, PD 100W, Gri',
    expect: { brand: 'Baseus', color: 'gray', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Adaptor Lenovo USB-C la HDMI 2.1, Gri',
    expect: { brand: 'Lenovo', color: 'gray', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Baterie externa Anker PowerCore 20000mAh, 20W, Negru',
    expect: { brand: 'Anker', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Geanta laptop Dell EcoLoop Pro 15", Negru',
    expect: { brand: 'Dell', screenInches: 15, color: 'black', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Mouse wireless Logitech MX Master 3S, Graphite',
    expect: { brand: 'Logitech', color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Tastatura mecanica Razer BlackWidow V4, Green Switch, RGB, Negru',
    expect: { brand: 'Razer', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Cartus cerneala HP 305 Black, 120 pagini',
    expect: { brand: 'HP', color: 'black', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Folie de protectie Hydrogel pentru Samsung Galaxy Watch 7 44mm, Transparenta',
    expect: { brand: null, color: 'transparent', isAccessory: true },
  },

  // ---------------------------------------------------------------- networking, printing, cameras, mobility, lighting
  {
    shop: 'emag',
    title: 'Router wireless TP-Link Archer AX55, Wi-Fi 6, Dual-Band, Gigabit',
    expect: { brand: 'TP-Link' },
  },
  {
    shop: 'emag',
    title: 'Sistem Mesh TP-Link Deco X50, Wi-Fi 6, 3-pack, Alb',
    expect: { brand: 'TP-Link', color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Imprimanta multifunctionala inkjet Epson EcoTank L3270, A4, Wi-Fi, Negru',
    expect: { brand: 'Epson', mpn: 'L3270', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Imprimanta laser monocrom Brother HL-L2400DW, A4, Duplex, Wireless',
    expect: { brand: 'Brother', mpn: 'HLL2400DW' },
  },
  {
    shop: 'emag',
    title: 'Camera foto mirrorless Sony Alpha A7 IV, 33 MP, 4K, Body, Negru',
    expect: { brand: 'Sony', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Drona DJI Mini 4 Pro, 4K HDR, 34 min, DJI RC 2',
    expect: { brand: 'DJI' },
  },
  {
    shop: 'emag',
    title: 'Camera de actiune GoPro HERO13 Black',
    expect: { brand: 'GoPro', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Trotineta electrica Xiaomi Electric Scooter 4 Pro (2nd Gen), 350 W, 25 km/h, Negru',
    expect: { brand: 'Xiaomi', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Camera supraveghere TP-Link Tapo C200, 1080p, Wi-Fi, 360°',
    expect: { brand: 'TP-Link' },
  },
  {
    shop: 'emag',
    title: 'Bec LED inteligent Philips Hue White and Color Ambiance, E27, 9W, Bluetooth',
    expect: { brand: 'Philips' },
  },
  {
    shop: 'emag',
    title: 'Kit Philips Hue White Ambiance, 3 becuri E27 + Bridge',
    expect: { brand: 'Philips' },
  },
  {
    shop: 'emag',
    title: 'Set 2 becuri LED inteligente Xiaomi Mi Smart LED Bulb Essential, E27, 9W',
    expect: { brand: 'Xiaomi' },
  },
];

/**
 * Holdout batch: 72 more synthetic titles written and labelled after the rules existed, without
 * running the rules on them first, to estimate accuracy on unseen titles. Its first-run accuracy
 * is recorded in the M06 module report; rules were then fixed only where a miss revealed a general
 * gap (never a per-title special case), so it is no longer a true holdout.
 */
export const HOLDOUT_CORPUS: readonly CorpusEntry[] = [
  {
    shop: 'evomag',
    title: 'Telefon Mobil Apple iPhone 16 Pro Max, 6.9 inch, 256 GB, 5G, Desert Titanium',
    expect: { brand: 'Apple', storageGb: 256, screenInches: 6.9, color: 'beige' },
  },
  {
    shop: 'pcgarage',
    title: 'Telefon mobil Samsung Galaxy S24 Ultra, Dual SIM, 12GB RAM, 512GB, 5G, Titanium Violet',
    expect: { brand: 'Samsung', ramGb: 12, storageGb: 512, color: 'purple' },
  },
  {
    shop: 'altex',
    title: 'Telefon MOTOROLA edge 60 fusion 5G, 256GB, 8GB RAM, Dual SIM, PANTONE Slipstream',
    expect: { brand: 'Motorola', storageGb: 256, ramGb: 8 },
  },
  {
    shop: 'flanco',
    title: 'Telefon mobil Xiaomi Redmi 15C, 4GB RAM, 128GB, Dual SIM, Midnight Black',
    expect: { brand: 'Xiaomi', ramGb: 4, storageGb: 128, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Samsung Galaxy A06, Dual SIM, 4GB RAM, 64GB, 4G, Light Blue',
    expect: { brand: 'Samsung', ramGb: 4, storageGb: 64, color: 'blue' },
  },
  {
    shop: 'mediagalaxy',
    title: 'Telefon HONOR X9c 5G, 256GB, 12GB RAM, Dual SIM, Titanium Purple',
    expect: { brand: 'Honor', storageGb: 256, ramGb: 12, color: 'purple' },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Google Pixel 9a, 8GB RAM, 128GB, 5G, Porcelain',
    expect: { brand: 'Google', ramGb: 8, storageGb: 128 },
  },
  {
    shop: 'emag',
    title: 'Telefon mobil Apple iPhone 15 Plus, 512GB, 5G, Yellow',
    expect: { brand: 'Apple', storageGb: 512, color: 'yellow' },
  },
  {
    shop: 'cel',
    title: 'Telefon Samsung Galaxy S21 FE 5G 6GB 128GB Graphite',
    expect: { brand: 'Samsung', ramGb: 6, storageGb: 128, color: 'gray' },
  },
  {
    shop: 'emag',
    title:
      'Laptop Lenovo IdeaPad Slim 5 14AKP10 cu procesor AMD Ryzen™ AI 7 350, 14", WUXGA OLED, 16GB, 1TB SSD, AMD Radeon™ 860M, No OS, Cosmic Blue',
    expect: {
      brand: 'Lenovo',
      mpn: '14AKP10',
      screenInches: 14,
      ramGb: 16,
      storageGb: 1024,
      color: 'blue',
    },
  },
  {
    shop: 'pcgarage',
    title:
      "Laptop ASUS Gaming 15.6'' TUF F15 FX507VV, FHD 144Hz, Procesor Intel® Core™ i7-13620H, 16GB DDR4, 1TB SSD, GeForce RTX 4060 8GB, No OS, Jaeger Gray",
    expect: {
      brand: 'ASUS',
      mpn: 'FX507VV',
      screenInches: 15.6,
      ramGb: 16,
      storageGb: 1024,
      color: 'gray',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Dell Inspiron 3530, Intel Core i5-1334U pana la 4.6 GHz, 15.6" Full HD, 8GB, 512GB SSD, Intel Iris Xe Graphics, Ubuntu, Carbon Black',
    expect: { brand: 'Dell', screenInches: 15.6, ramGb: 8, storageGb: 512, color: 'black' },
  },
  {
    shop: 'evomag',
    title:
      'Laptop HP 15-fd0057nq, 15.6 inch FHD, Intel Core i3-N305, 8GB DDR4, 512GB SSD, Intel UHD, Free DOS, Natural Silver',
    expect: {
      brand: 'HP',
      mpn: '15FD0057NQ',
      screenInches: 15.6,
      ramGb: 8,
      storageGb: 512,
      color: 'silver',
    },
  },
  {
    shop: 'emag',
    title:
      'Laptop Apple MacBook Pro 16" cu cip M4 Pro, 14 nuclee CPU, 20 nuclee GPU, 24GB, 512GB SSD, Space Black - Romanian Keyboard',
    expect: { brand: 'Apple', screenInches: 16, ramGb: 24, storageGb: 512, color: 'black' },
  },
  {
    shop: 'altex',
    title:
      'Laptop ACER Swift Go 14 SFG14-73, Intel Core Ultra 5 125H pana la 4.5GHz, 14" 2.8K OLED, 16GB, 512GB SSD, Intel Arc, Windows 11 Home, Pure Silver',
    expect: {
      brand: 'Acer',
      mpn: 'SFG1473',
      screenInches: 14,
      ramGb: 16,
      storageGb: 512,
      color: 'silver',
    },
  },
  {
    shop: 'emag',
    title: 'Placa video GIGABYTE GeForce RTX 5060 WINDFORCE OC 8GB GDDR7 128-bit',
    expect: { brand: 'Gigabyte' },
  },
  {
    shop: 'pcgarage',
    title: 'SSD Samsung 9100 PRO 1TB PCI Express 5.0 x4 M.2 2280',
    expect: { brand: 'Samsung', storageGb: 1024 },
  },
  {
    shop: 'emag',
    title: 'Memorie Kingston FURY Renegade RGB 48GB, DDR5, 6400MHz, CL32, Kit Dual Channel',
    expect: { brand: 'Kingston', ramGb: 48 },
  },
  {
    shop: 'emag',
    title: 'Procesor Intel® Core™ i5-14400F, 2.5GHz, 20MB, Socket 1700, Box',
    expect: { brand: 'Intel' },
  },
  {
    shop: 'evomag',
    title: 'Placa de baza MSI MAG B650 TOMAHAWK WIFI, Socket AM5',
    expect: { brand: 'MSI' },
  },
  {
    shop: 'emag',
    title: 'Monitor LED LG 27US550-W, 27", 4K UHD, IPS, HDR10, Alb',
    expect: { brand: 'LG', mpn: '27US550W', screenInches: 27, color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Monitor Gaming MSI MAG 274QRF QD E2, 27", Rapid IPS, WQHD, 180Hz, 1ms, Negru',
    expect: { brand: 'MSI', mpn: '274QRF', screenInches: 27, color: 'black' },
  },
  {
    shop: 'altex',
    title: 'Televizor LG OLED65C54LA, 164 cm, Smart, 4K Ultra HD, 120Hz, Clasa F',
    expect: { brand: 'LG', mpn: 'OLED65C54LA', screenInches: 65, energyClass: 'F' },
  },
  {
    shop: 'flanco',
    title: 'Televizor Samsung QLED 50Q60D, 125 cm, Smart, 4K Ultra HD, Clasa E',
    expect: { brand: 'Samsung', mpn: '50Q60D', screenInches: 50, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title: 'Televizor Philips 43PFS6000/12, 108 cm, Smart, Full HD, LED, Clasa E',
    expect: { brand: 'Philips', mpn: '43PFS600012', screenInches: 43, energyClass: 'E' },
  },
  {
    shop: 'emag',
    title: 'Televizor Sony BRAVIA 7 K-55XR70, 139 cm, Mini LED, Smart Google TV, 4K HDR, Clasa F',
    expect: { brand: 'Sony', mpn: 'K55XR70', screenInches: 55, energyClass: 'F' },
  },
  {
    shop: 'dedeman',
    title: 'Televizor LED Smart Tech 32HN10T3, 81 cm, HD, Clasa E, negru',
    expect: {
      brand: 'Smart Tech',
      mpn: '32HN10T3',
      screenInches: 32,
      energyClass: 'E',
      color: 'black',
    },
  },
  {
    shop: 'emag',
    title: 'Casti wireless Apple AirPods Max (2024), USB-C, Midnight',
    expect: { brand: 'Apple', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Casti In-Ear Sony WF-1000XM5, Noise Cancelling, Bluetooth, Argintiu',
    expect: { brand: 'Sony', mpn: 'WF1000XM5', color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Boxa portabila Marshall Emberton III, Bluetooth, IP67, Black & Brass',
    expect: { brand: 'Marshall', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Consola Sony PlayStation 5 Pro, 2TB SSD, Alb + Controller DualSense Midnight Black',
    expect: { brand: 'Sony', storageGb: 2048, color: 'white', isBundle: true },
  },
  {
    shop: 'emag',
    title: 'Joc Mario Kart World pentru Nintendo Switch 2',
    expect: { brand: 'Nintendo' },
  },
  {
    shop: 'emag',
    title: 'Controller Microsoft Xbox Wireless Controller, Carbon Black',
    expect: { brand: 'Microsoft', color: 'black', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Smartwatch Samsung Galaxy Watch Ultra 2025, 47mm, LTE, Titanium Silver',
    expect: { brand: 'Samsung', color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Smartwatch Garmin Venu 4, 45mm, AMOLED, Slate/Black',
    expect: { brand: 'Garmin', color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Bratara fitness Huawei Band 10, Black',
    expect: { brand: 'Huawei', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Masina de spalat rufe Beko B5WFU78418WB, 8 kg, 1400 RPM, Clasa A, Alb',
    expect: { brand: 'Beko', mpn: 'B5WFU78418WB', capacityKg: 8, energyClass: 'A', color: 'white' },
  },
  {
    shop: 'dedeman',
    title: 'Masina de spalat rufe Heinner HWM-V7014D++, 7 kg, 1400 rpm, Clasa D, alb',
    expect: { brand: 'Heinner', mpn: 'HWMV7014D', capacityKg: 7, energyClass: 'D', color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Combina frigorifica Arctic AK60406M40NFW, 362 l, No Frost, Clasa E, Alb',
    expect: {
      brand: 'Arctic',
      mpn: 'AK60406M40NFW',
      capacityL: 362,
      energyClass: 'E',
      color: 'white',
    },
  },
  {
    shop: 'emag',
    title: 'Frigider Bosch KGN392LDC, 368 l, No Frost, Clasa D, H 203 cm, Inox',
    expect: { brand: 'Bosch', mpn: 'KGN392LDC', capacityL: 368, energyClass: 'D', color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Uscator de rufe Samsung DV90CGC2A0AELE, 9 kg, Pompa de caldura, Clasa A+++, Alb',
    expect: {
      brand: 'Samsung',
      mpn: 'DV90CGC2A0AELE',
      capacityKg: 9,
      energyClass: 'A+++',
      color: 'white',
    },
  },
  {
    shop: 'emag',
    title: 'Masina de spalat vase Beko BDFN15430W, 14 seturi, Clasa E, 60 cm, Alb',
    expect: { brand: 'Beko', mpn: 'BDFN15430W', energyClass: 'E', color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Cuptor cu microunde Whirlpool MWP 304 B, 30 l, 900 W, Grill, Negru',
    expect: { brand: 'Whirlpool', mpn: 'MWP304B', capacityL: 30, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Aer conditionat Samsung Wind-Free AR12CXFAAWKNEU, 12000 BTU, Clasa A++, Wi-Fi, Alb',
    expect: { brand: 'Samsung', mpn: 'AR12CXFAAWKNEU', energyClass: 'A++', color: 'white' },
  },
  {
    shop: 'dedeman',
    title: 'Boiler electric Tesy GCV 801238 B11 TSR, 80 l, Clasa C',
    expect: { brand: 'Tesy', capacityL: 80, energyClass: 'C' },
  },
  {
    shop: 'emag',
    title: 'Espressor automat Philips Seria 2200 EP2231/40, 1500 W, 15 bar, LatteGo, Negru',
    expect: { brand: 'Philips', mpn: 'EP223140', color: 'black' },
  },
  {
    shop: 'emag',
    title: "Espressor manual De'Longhi Dedica Style EC685.M, 1300 W, 15 bar, Argintiu",
    expect: { brand: "De'Longhi", mpn: 'EC685M', color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Friteuza cu aer cald Tefal Easy Fry Dual XXL EY905D10, 11 l, 2700 W, Negru',
    expect: { brand: 'Tefal', mpn: 'EY905D10', capacityL: 11, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Aspirator robot iRobot Roomba Combo j5+, Mop, Statie de autogolire, Negru',
    expect: { brand: 'iRobot', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Aspirator vertical fara fir Bosch Unlimited 7 BBS711W, 18 V, 0.3 l, Alb',
    expect: { brand: 'Bosch', mpn: 'BBS711W', capacityL: 0.3, color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Uscator de par Philips 5000 Series BHD512/20, 2300 W, Ionizare, Negru',
    expect: { brand: 'Philips', mpn: 'BHD51220', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Aparat de ras electric Braun Series 9 Pro+ 9575cc, Wet&Dry, Argintiu',
    expect: { brand: 'Braun', mpn: '9575CC', color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Fierbator electric Russell Hobbs Attentiv 26200-70, 1.7 l, 3000 W, Inox',
    expect: { brand: 'Russell Hobbs', mpn: '2620070', capacityL: 1.7, color: 'silver' },
  },
  {
    shop: 'emag',
    title: 'Husa Spigen Ultra Hybrid pentru Samsung Galaxy S25 Ultra, Transparent',
    expect: { brand: 'Spigen', color: 'transparent', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Folie de sticla Lemontti pentru iPhone 16 Pro, Full Glue, Transparenta',
    expect: { brand: 'Lemontti', color: 'transparent', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Incarcator auto Baseus, 2x USB-C, 65W, Negru',
    expect: { brand: 'Baseus', color: 'black', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Cablu Apple USB-C la Lightning, 1 m, Alb',
    expect: { brand: 'Apple', color: 'white', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Suport auto magnetic pentru telefon Hoco, Negru',
    expect: { brand: 'Hoco', color: 'black', isAccessory: true },
  },
  {
    shop: 'emag',
    title: 'Mouse gaming Razer DeathAdder V3 Pro, Wireless, 30000 DPI, Alb',
    expect: { brand: 'Razer', color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Router Wi-Fi 7 TP-Link Archer BE550, Tri-Band, 9200 Mbps, Negru',
    expect: { brand: 'TP-Link', mpn: 'BE550', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Imprimanta laser color HP Color LaserJet Pro MFP 4302fdw, A4, Duplex',
    expect: { brand: 'HP', mpn: '4302FDW' },
  },
  {
    shop: 'emag',
    title: 'Trotineta electrica Segway Ninebot E2 Pro E, 350 W, 25 km/h, Negru',
    expect: { brand: 'Segway', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Drona DJI Neo, 4K, 18 min, Gri',
    expect: { brand: 'DJI', color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Consola Nintendo Switch OLED, 64GB, Alb',
    expect: { brand: 'Nintendo', storageGb: 64, color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Ceas inteligent Xiaomi Redmi Watch 5 Active, Bluetooth, Negru',
    expect: { brand: 'Xiaomi', color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Tableta Samsung Galaxy Tab S9 FE+, 12.4", 8GB RAM, 128GB, Wi-Fi, Gray',
    expect: { brand: 'Samsung', screenInches: 12.4, ramGb: 8, storageGb: 128, color: 'gray' },
  },
  {
    shop: 'emag',
    title: 'Televizor Hisense 65U7NQ, 164 cm, Smart, 4K Ultra HD, Mini LED, 144Hz, Clasa F',
    expect: { brand: 'Hisense', mpn: '65U7NQ', screenInches: 65, energyClass: 'F' },
  },
  {
    shop: 'emag',
    title: 'Aspirator fara sac Philips 3000 Series XB3122/09, 900 W, 1.5 l, Clasa A, Albastru',
    expect: { brand: 'Philips', mpn: 'XB312209', capacityL: 1.5, energyClass: 'A', color: 'blue' },
  },
  {
    shop: 'emag',
    title: 'Robot de bucatarie Bosch MUM5 MUMS2EW00, 900 W, 3.9 l, Alb',
    expect: { brand: 'Bosch', mpn: 'MUMS2EW00', capacityL: 3.9, color: 'white' },
  },
  {
    shop: 'emag',
    title: 'Cafetiera Philips HD7461/20, 1000 W, 1.2 l, Negru/Argintiu',
    expect: { brand: 'Philips', mpn: 'HD746120', capacityL: 1.2, color: 'black' },
  },
  {
    shop: 'emag',
    title: 'Set 3 tigai Tefal Ingenio Easy Plus, 22/24/28 cm, Negru',
    expect: { brand: 'Tefal', color: 'black' },
  },
  { shop: 'emag', title: 'Comoda TV Bonami 160 cm, Stejar', expect: { brand: null } },
];
