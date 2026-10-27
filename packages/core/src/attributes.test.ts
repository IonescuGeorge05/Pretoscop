import { describe, expect, it } from 'vitest';
import { extractAttributes } from './attributes';
import { detectProductKind } from './product-kind';

const attrs = (title: string, categoryHint?: string) =>
  extractAttributes(title, { categoryHint: categoryHint ?? null });

describe('storage, RAM and VRAM', () => {
  it.each([
    ['Telefon mobil Samsung Galaxy S25 Ultra, 12GB RAM, 256GB, 5G', 12, 256],
    ['Smartphone Xiaomi Redmi Note 14 Pro 5G, 8GB/256GB', 8, 256],
    ['Smartphone Samsung Galaxy S25 FE 5G 8/256GB Navy', 8, 256],
    ['Telefon Xiaomi 15 Ultra 16+512GB', 16, 512],
    ['Telefon Samsung Galaxy S21 FE 5G 6GB 128GB Graphite', 6, 128],
    ['Laptop ASUS Vivobook 16, 16GB, 512GB SSD, Intel UHD Graphics', 16, 512],
    ['Laptop Lenovo IdeaPad, 16GB DDR5, 1TB SSD', 16, 1024],
    ['Laptop Acer Nitro V 15, 16GB, 1TB SSD, GeForce RTX 4060 8GB, No OS', 16, 1024],
    ['Laptop Apple MacBook Air 13" cu cipul M4, 8 nuclee GPU, 16GB, 256GB SSD', 16, 256],
    ['Consola portabila ASUS ROG Xbox Ally X, 24GB RAM, 1TB SSD', 24, 1024],
    ['Tableta Lenovo Tab M11, 4GB RAM, 128GB', 4, 128],
  ])('%s → RAM %i, storage %i', (title, ram, storage) => {
    const a = attrs(title);
    expect(a.ramGb).toBe(ram);
    expect(a.storageGb).toBe(storage);
  });

  it('reads TB as 1024 GB and 1000 GB as 1 TB', () => {
    expect(attrs('SSD Samsung 990 PRO 2TB').storageGb).toBe(2048);
    expect(attrs('Hard disk Seagate 1000GB').storageGb).toBe(1024);
    expect(attrs('SSD extern 1.5TB').storageGb).toBe(1536);
    expect(attrs('Consola PlayStation 5 Slim Digital Edition, 1TB + joc EA FC 26').storageGb).toBe(
      1024,
    );
  });

  it('uses the product kind for unlabeled capacities', () => {
    expect(attrs('Memorie RAM Kingston FURY Beast 32GB (2x16GB) DDR5 6000MHz').ramGb).toBe(32);
    expect(
      attrs('Memorie RAM Kingston FURY Beast 32GB (2x16GB) DDR5 6000MHz').storageGb,
    ).toBeUndefined();
    expect(attrs('Placa video MSI GeForce RTX 4060 8GB GDDR6').vramGb).toBe(8);
    expect(attrs('Placa video MSI GeForce RTX 4060 8GB GDDR6').ramGb).toBeUndefined();
    expect(attrs('Card de memorie microSDXC 256GB, UHS-I').storageGb).toBe(256);
    expect(attrs('Stick memorie USB SanDisk 64GB').storageGb).toBe(64);
    expect(attrs('eBook Reader Kindle Paperwhite, 16GB').storageGb).toBe(16);
    expect(attrs('Ochelari VR Meta Quest 3S, 128GB').storageGb).toBe(128);
  });

  it('marks graphics memory in laptop titles as VRAM, not RAM', () => {
    const a = attrs('Laptop HP Victus, 16GB DDR5, 512GB SSD, NVIDIA GeForce RTX 4050 6GB');
    expect(a).toMatchObject({ ramGb: 16, storageGb: 512, vramGb: 6 });
  });

  it('reads the "4G RAM" typo as 4 GB of RAM, not 4G connectivity', () => {
    const a = attrs('Telefon Mobil Xiaomi REDMI A7 Pro, 4G RAM, 64GB ROM, Black');
    expect(a).toMatchObject({ ramGb: 4, storageGb: 64 });
    expect(a.connectivity).toBeUndefined();
    expect(attrs('Telefon Samsung Galaxy A16, 4G, 128GB').connectivity).toEqual(['4g']);
  });

  it('leaves an ambiguous single small capacity on a phone unset and ignores MB', () => {
    expect(attrs('Telefon mobil XYZ 8GB').storageGb).toBeUndefined();
    expect(attrs('Telefon mobil XYZ 8GB').ramGb).toBeUndefined();
    expect(attrs('Hard disk 2TB, 256MB cache').storageGb).toBe(2048);
  });
});

describe('screen size', () => {
  it.each([
    ['Tableta Apple iPad Air 11" (M3), 128GB', 11],
    ['Tableta Samsung Galaxy Tab S10 FE, 10,9", 8GB RAM', 10.9],
    ["Notebook Lenovo 15.6'' LOQ 15IAX9", 15.6],
    ['Monitor BenQ MOBIUZ EX2710Q 27 inch, QHD', 27],
    ['Televizor Hisense 55 inchi, 4K', 55],
    ['Televizor LED Samsung 55DU7172, 138 cm, Smart', 55],
    ['Televizor Hisense 43A6N, 108 cm', 43],
    ['Televizor LG 86QNED86T6A, 218 cm', 86],
    ['Laptop Dell, 39.6 cm, 8GB', 15.6],
    ['Bratara fitness Xiaomi Smart Band 10, AMOLED 1.72", Midnight Black', 1.72],
    ['Rucsac laptop Samsonite Mysight 15.6", Negru', 15.6],
  ])('%s → %s"', (title, inches) => {
    expect(attrs(title).screenInches).toBe(inches);
  });

  it('ignores ranges, widths, heights, form factors and "2 in 1"', () => {
    expect(attrs('Suport TV de perete Hama, 32-65", max. 35 kg').screenInches).toBeUndefined();
    expect(attrs('Frigider Arctic, 223 l, H 144 cm').screenInches).toBeUndefined();
    expect(attrs('Plita incorporabila Beko, 60 cm').screenInches).toBeUndefined();
    expect(attrs('Hard Disk extern WD Elements 2TB, 2.5 inch').screenInches).toBeUndefined();
    expect(attrs('Laptop 2 in 1 HP Envy x360').screenInches).toBeUndefined();
    expect(attrs('Comoda TV 160 cm').screenInches).toBeUndefined();
  });
});

describe('resolution', () => {
  it.each([
    ['Televizor 55", 4K Ultra HD', '4k'],
    ['Televizor 65", 8K', '8k'],
    ['Monitor 27", WQHD', 'qhd'],
    ['Monitor 34", UWQHD 3440x1440', 'uwqhd'],
    ['Monitor 24", Full HD', 'fhd'],
    ['Monitor 24", 1920 x 1080', 'fhd'],
    ['Laptop 16", WUXGA', 'wuxga'],
    ['Laptop 14", 2.8K OLED', '2.8k'],
    ['Televizor 32", HD Ready', 'hd'],
    ['Monitor 49", DQHD', 'dqhd'],
  ])('%s → %s', (title, resolution) => {
    expect(attrs(title).resolution).toBe(resolution);
  });

  it('does not read HDR10 as HD', () => {
    expect(attrs('Televizor 55", HDR10+').resolution).toBeUndefined();
  });
});

describe('colour', () => {
  it.each([
    ['Telefon Samsung Galaxy S25 Ultra, 256GB, Titanium Black', 'black', 'negru'],
    ['Combina frigorifica Samsung, 344 l, Inox', 'silver', 'argintiu'],
    ['Telefon Apple iPhone 15, Natural Titanium', 'natural_titanium', 'titan natural'],
    [
      'Smartwatch Apple Watch Ultra 3, Carcasa Titan Natural, Curea Trail Loop Albastru',
      'natural_titanium',
      'titan natural',
    ],
    ['Smartwatch Huawei Watch GT 5 Pro, Titanium Strap, Titanium', 'titanium', 'titan'],
    ['Telefon Apple iPhone 13, Midnight', 'black', 'negru'],
    ['Laptop Apple MacBook Air, Space Grey', 'gray', 'gri'],
    ['Casti gaming HyperX Cloud III, Negru/Rosu', 'black', 'negru'],
    ['Telefon Samsung Galaxy S25 Ultra, Titanium Silverblue', 'blue', 'albastru'],
    ['Telefon Apple iPhone 17, Rose Gold', 'rose_gold', 'roz auriu'],
    ['Masina de spalat rufe Beko, 6 kg, alb', 'white', 'alb'],
    ['Telefon Apple iPhone 14 Pro, Deep Purple', 'purple', 'mov'],
    ['Husa transparenta', 'transparent', 'transparent'],
  ])('%s → %s (%s)', (title, color, ro) => {
    expect(attrs(title)).toMatchObject({ color, colorRo: ro });
  });

  it('reads compound colours by their last word (real eMAG titles)', () => {
    expect(attrs('Telefon Samsung Galaxy A15, 128GB, 5G, Blue Black').color).toBe('black');
    expect(attrs('Telefon Samsung Galaxy A37, 256GB, 5G, Awesome Graygreen').color).toBe('green');
    expect(attrs('Telefon Samsung Galaxy A56, 256GB, 5G, Awesome LightGray').color).toBe('gray');
    expect(attrs('Telefon Google Pixel 10 Pro XL, 256GB, Jade').color).toBe('green');
    expect(attrs('Telefon Apple iPhone 16 Pro Max, Desert Titanium').color).toBe('beige');
    expect(attrs('Smartwatch Samsung Galaxy Watch Ultra, Titanium Silver').color).toBe('silver');
    expect(
      attrs('Telefon Motorola edge 70 fusion, 7000 mAh Pantone Silhouette (black)').color,
    ).toBe('black');
    expect(attrs('Telefon Apple iPhone 18 Pro, 256GB, 5G, Glacier').color).toBeUndefined();
  });

  it('ignores colour words that are not colours', () => {
    for (const title of [
      'Sursa Corsair RM850e, 850W, 80+ Gold',
      'SSD WD Black SN850X 1TB',
      'Bec Philips Hue White and Color Ambiance, E27',
      'Televizor Philips 50PUS8009/12, Smart Titan OS',
      'Telefon Black Shark 4 Pro',
      'Joc Call of Duty Gold Edition',
      'Reducere Black Friday laptop',
    ]) {
      expect(attrs(title).color, title).toBeUndefined();
    }
    expect(attrs('Tastatura Razer BlackWidow V4, Green Switch, RGB, Negru').color).toBe('black');
  });
});

describe('energy class, capacities and power', () => {
  it.each([
    ['Televizor Samsung, Clasa G', 'G'],
    ['Masina de spalat, clasa energetica D', 'D'],
    ['Uscator de rufe, Clasa A+++', 'A+++'],
    ['Masina de spalat cu uscator, Clasa D/E', 'D'],
    ['Aer conditionat, 12000 BTU, A++', 'A++'],
    ['Frigider, energy class: E', 'E'],
  ])('%s → %s', (title, energy) => {
    expect(attrs(title).energyClass).toBe(energy);
  });

  it('does not read energy classes inside model codes', () => {
    expect(attrs('Lada frigorifica Heinner HCF-205NHA+').energyClass).toBeUndefined();
    expect(attrs('Telefon Galaxy A56').energyClass).toBeUndefined();
  });

  it('reads litres (largest value) and kilograms only for washers and dryers', () => {
    expect(attrs('Frigider Arctic, 223 l, Clasa E').capacityL).toBe(223);
    expect(attrs('Combina frigorifica 360 l (frigider 250 l, congelator 110 l)').capacityL).toBe(
      360,
    );
    expect(attrs('Friteuza cu aer cald, 7,2 l, 2000 W').capacityL).toBe(7.2);
    expect(attrs('Boiler electric Ariston Pro1 Eco 80 V EU, 80 l').capacityL).toBe(80);
    expect(attrs('Masina de spalat rufe Arctic, 8 kg, 1200 RPM').capacityKg).toBe(8);
    expect(attrs('Masina de spalat rufe cu uscator Bosch, 10.5/6 kg').capacityKg).toBe(10.5);
    expect(attrs('Uscator de rufe Electrolux, 9 kg').capacityKg).toBe(9);
    expect(attrs('Masina de paine Heinner, 900 W, 1 kg').capacityKg).toBeUndefined();
    expect(attrs('Laptop ultraportabil, 1.2 kg').capacityKg).toBeUndefined();
  });

  it('reads power in W and kW', () => {
    expect(attrs('Aspirator, 2.000 W').powerW).toBe(2000);
    expect(attrs('Espressor, 1450W').powerW).toBe(1450);
    expect(attrs('Plita, 7,4 kW').powerW).toBe(7400);
  });
});

describe('year, generation, connectivity, editions, case size, pack count', () => {
  it('reads years but not powers or speeds', () => {
    expect(attrs('Telefon Nokia 3210 4G (2024)').year).toBe(2024);
    expect(attrs('eBook Reader Kindle Paperwhite 2024, 7"').year).toBe(2024);
    expect(attrs('Aspirator 2000 W').year).toBeUndefined();
    expect(attrs('Memorie DDR5 2133 MHz').year).toBeUndefined();
  });

  it.each([
    ['Laptop Lenovo ThinkPad E14 Gen 6', 'gen6'],
    ['Boxa Amazon Echo Dot (5th Gen)', 'gen5'],
    ['Casti Apple AirPods Pro (a 2-a generatie)', 'gen2'],
    ['Trotineta Xiaomi Scooter 4 Pro (2nd Gen)', 'gen2'],
    ['Laptop Apple MacBook Air 13" cu cipul M4', 'm4'],
    ['Laptop Apple MacBook Pro 16" cu cip M4 Pro', 'm4-pro'],
  ])('%s → %s', (title, generation) => {
    expect(attrs(title).generation).toBe(generation);
  });

  it('does not read PCIe or USB generations, or M.2, as product generations', () => {
    expect(attrs('SSD Samsung 990 PRO 2TB, PCIe Gen 4.0 x4, M.2').generation).toBeUndefined();
    expect(attrs('SSD extern Samsung T7, USB 3.2 Gen 2').generation).toBeUndefined();
  });

  it('collects connectivity', () => {
    expect(attrs('Telefon Samsung Galaxy A16, Dual SIM, 4G, NFC').connectivity).toEqual([
      '4g',
      'dual_sim',
      'nfc',
    ]);
    expect(attrs('Tableta Apple iPad 11, Wi-Fi + Cellular').connectivity).toEqual([
      'cellular',
      'wifi',
    ]);
    expect(attrs('Smartwatch Samsung Galaxy Watch8, 44mm, BT').connectivity).toEqual(['bluetooth']);
    expect(attrs('Telefon 5G, eSIM').connectivity).toEqual(['5g', 'esim']);
  });

  it.each([
    ['Consola PlayStation 5 Slim Digital Edition, 1TB + joc EA FC 26', ['slim', 'digital']],
    ['Consola Sony PlayStation 5 Pro, 2TB', ['pro']],
    ['Consola Sony PlayStation 5 Slim (Disc), 1TB', ['slim', 'disc']],
    ['Telefon APPLE iPhone 17 Pro Max 5G, 512GB', ['pro', 'max']],
    ['Telefon mobil Samsung Galaxy S25 Ultra, 256GB', ['ultra']],
    ['Telefon mobil Samsung Galaxy S24 FE, 8GB RAM', ['fe']],
    ['Telefon mobil realme 14 Pro+ 5G', ['pro', 'plus']],
    ['Laptop Apple MacBook Air 13"', ['air']],
    ['Placa video ASUS GeForce RTX 5070 Ti OC', ['ti']],
    ['Placa video MSI GeForce RTX 4070 SUPER 12GB', ['super']],
  ])('%s → %j', (title, edition) => {
    expect(attrs(title).edition).toEqual(edition);
  });

  it('ignores edition words outside the model name', () => {
    expect(attrs('Televizor Samsung 55DU7172, Smart, 4K Ultra HD').edition).toBeUndefined();
    expect(attrs('Laptop Dell Latitude 5550, Intel Core Ultra 5 125U').edition).toBeUndefined();
    expect(attrs('Laptop Dell, Windows 11 Pro').edition).toBeUndefined();
    expect(attrs('Suport TV, max. 35 kg').edition).toBeUndefined();
    expect(attrs('Aparat foto digital compact').edition).toBeUndefined();
  });

  it('reads smartwatch case sizes and multipack counts', () => {
    expect(attrs('Smartwatch Apple Watch Series 11, GPS, Carcasa Aluminiu 46mm').caseSizeMm).toBe(
      46,
    );
    expect(attrs('Cablu 46mm').caseSizeMm).toBeUndefined();
    expect(attrs('Set 2 becuri LED inteligente Xiaomi').packCount).toBe(2);
    expect(attrs('Sistem Mesh TP-Link Deco X50, 3-pack').packCount).toBe(3);
    expect(attrs('Folie sticla, 2 bucati').packCount).toBe(2);
    expect(attrs('Telefon mobil Samsung').packCount).toBeUndefined();
  });

  it('returns only the kind for an empty title', () => {
    expect(extractAttributes('')).toEqual({});
    expect(extractAttributes('Telefon mobil')).toEqual({ kind: 'phone' });
  });
});

describe('detectProductKind', () => {
  it.each([
    ['Telefon mobil Samsung', 'phone'],
    ['Smartphone Xiaomi', 'phone'],
    ['Tableta Apple iPad', 'tablet'],
    ['Tableta grafica Wacom', 'peripheral'],
    ['Laptop ASUS', 'laptop'],
    ['Televizor LED Samsung', 'tv'],
    ['Monitor Gaming LG', 'monitor'],
    ['Consola PlayStation 5', 'console'],
    ['Pachet Consola Sony PS5', 'console'],
    ['Joc EA FC 26', 'game'],
    ['Placa video ASUS', 'gpu'],
    ['Memorie RAM Kingston', 'ram'],
    ['Memorie USB SanDisk', 'usb_drive'],
    ['SSD Samsung', 'storage'],
    ['Card de memorie Samsung', 'memory_card'],
    ['Carcasa Lian Li O11, Mid-Tower', 'pc_case'],
    ['Carcasa telefon iPhone 15', 'accessory'],
    ['Husa iPhone 17', 'accessory'],
    ['Bratara fitness Xiaomi', 'fitness_band'],
    ['Bratara silicon pentru Apple Watch', 'accessory'],
    ['Baterie externa Anker', 'power_bank'],
    ['Masina de spalat rufe Arctic', 'washer'],
    ['Masina de spalat rufe cu uscator Bosch', 'washer_dryer'],
    ['Masina de spalat vase Bosch', 'dishwasher'],
    ['Uscator de rufe Electrolux', 'dryer'],
    ['Cuptor cu microunde Samsung', 'microwave'],
    ['Cuptor incorporabil Electrolux', 'oven'],
    ['Combina frigorifica LG', 'fridge'],
    ['Filtru de cafea Philips', 'coffee'],
    ['Filtru apa pentru frigider', 'accessory'],
    ['Ceva necunoscut', 'other'],
  ])('%s → %s', (title, kind) => {
    expect(detectProductKind(title)).toBe(kind);
  });

  it('falls back to the category', () => {
    expect(detectProductKind('Samsung Galaxy S25', 'Telefoane mobile > Smartphone')).toBe('phone');
    expect(detectProductKind('Spigen Ultra Hybrid', 'Accesorii telefoane > Huse')).toBe(
      'accessory',
    );
    expect(detectProductKind('Ceva', null)).toBe('other');
  });
});
