import { describe, expect, it } from 'vitest';
import { detectAccessory } from './accessory';
import { detectBundle } from './bundle';

describe('detectBundle', () => {
  it.each([
    ['Consola PlayStation 5 Slim Digital Edition, 1TB + joc EA FC 26', 'game:plus:joc'],
    ['Consola Nintendo Switch 2 + Mario Kart World (cod descarcare)', 'game:plus:mario'],
    ['Pachet Consola Sony PlayStation 5 Slim, 1TB + 2 controllere', 'accessory:pachet'],
    ['Set PS5 Slim + 2 jocuri', 'game:plus:2'],
    ['Set Consola PlayStation 5 Slim Digital + 2 jocuri (Gran Turismo 7)', 'game:plus:2'],
    ['Bundle Xbox Series X + Forza Horizon 5', 'game:bundle'],
    ['Telefon mobil Samsung Galaxy S24 FE, 128GB, Blue + Incarcator 25W cadou', 'gift:cadou'],
    ['Laptop MSI Katana 15, RTX 4060, No OS + Mouse Gaming Cadou', 'gift:cadou'],
    ['Consola Xbox Series S cu joc inclus', 'game:joc inclus'],
    ['Consola PS5 Slim, include jocul Astro Bot', 'game:joc inclus'],
    ['Consola PS5 Slim si 2 jocuri', 'game:joc inclus'],
    ['Consola PS5 Slim cu 2 jocuri incluse', 'game:joc inclus'],
    ['Tableta Lenovo Tab M9 Kids, 32GB, Arctic Grey + Husa protectie', 'gift:plus:husa'],
    ['Laptop Lenovo IdeaPad, 16GB + Office 2024', 'other:plus:office'],
    // Live eMAG run, 2026-10-27
    [
      'Telefon mobil Xiaomi Redmi 15C, 4GB RAM, 128GB ROM, Black + Woven Strap Ring Stand',
      'gift:plus:woven',
    ],
    [
      'Telefon mobil iHunt Primo 4G, Dual SIM, Ecran 2.4-inch, Lanterna + Stativ cu statie de incarcare',
      'gift:plus:stativ',
    ],
    [
      'Telefon mobil Motorola edge 70 fusion FIFA edition, 256GB, 8GB RAM, 5G, PANTONE Silhouette (black) + moto buds bass',
      'gift:plus:moto',
    ],
    ['Consola PlayStation 5 (PS5) Slim, 1TB SSD, D-Chassis + Joc NBA 2K26', 'game:plus:joc'],
    ['Consola PlayStation 5 (PS5) Slim, 1TB SSD, E-Chassis, EA Sports FC 26 Bundle', 'game:bundle'],
    [
      'Consola PlayStation 5 (PS5) Slim, 1TB SSD, D-Chassis, Fortnite Cobalt Star Bundle',
      'game:bundle',
    ],
    [
      'Consola PlayStation 5 (PS5) Digital Edition - 30th Anniversary Limited Edition Bundle',
      'other:bundle',
    ],
    [
      'Consola PlayStation 5 (PS5) Slim, 1TB SSD, D-Chassis + Extra controller',
      'accessory:plus:extra',
    ],
    [
      'Consola Nintendo Switch 2 + Joc Sport Resort + 90 zile Abonament Nintendo Switch Online',
      'game:plus:joc',
    ],
    ['Consola Nintendo Switch Lite Yellow + Animal Crossing: New Horizons', 'game:plus:animal'],
    ['Consola Xbox Series S + 3 luni abonament Game Pass Ultimate', 'subscription:plus:3'],
  ])('%s → bundle (%s)', (title, reason) => {
    expect(detectBundle(title)).toEqual({
      isBundle: true,
      kind: reason.split(':')[0],
      reason,
    });
  });

  it.each([
    // Built-in games, game cards and package contents of retro handhelds and TV clones.
    'Consola retro portabila TRIMUI Smart Pro cu jocuri, quad core Cortex-A35 1.8GHz, 1GB LPDDR4, negru',
    'Consola retro portabila R36S Bluvista®, 64GB cu jocuri, 15000 jocuri, ArkOS 2.0, Emulator N64 PSP PS1 PlayStation Sega, Alb',
    'Consola portabila PRODYS, + 20.000 jocuri, God of War, GTA: Vice City Stories, PES, ecran HD 3.5 inch',
    'Consola de Jocuri Portabila LCX 4.3 Inch, card inclus de 64GB, Ecran LCD 480x272, 25.000 Jocuri Clasice',
    'Consola retro portabila RG40XX H cu jocuri - with 64GB Game Memory Card, 4 Inch IPS Screen',
    'Consola Jocuri Retro Portabila MOWO SF3500, 64GB cu Jocuri Preinstalate, Ecran 5.0 inch',
    'Consola Retro Portabila cu 400 Jocuri si Conexiune TV + Controller pentru Copii si Adulti',
    'Joc TV Consola Retro + Pistol 2x Pady + 9999 jocuri',
    'Pachet consola de jocuri (cu doua controllere), 5 PRO Enhanced Edition, Configuratie Plug and Play',
    'Console Hardware DONFANLIA® Consola portabila de jocuri M27, 64 GB + controler, Android 13',
    'Gameboy cu 400 de jocuri, multiplayer, 2v2, Retro FC, compatibil TV, portabil, retro, negru',
    // Compatibility phrases are not included games.
    'Controller Wireless Dual-Sense pentru PS5, compatibile doar cu jocuri din /PS4/PS4 PRO/PS4 SLIM, negru',
    'Controler de jocuri wireless 2.4G, compatibil cu televizoare/PC-uri inteligente, include jocuri clasice, controler de jocuri portabil',
  ])('%s → not a bundle (built in or package contents)', (title) => {
    expect(detectBundle(title, 'Gaming > Console, Jocuri & Accesorii > Console Hardware')).toEqual({
      isBundle: false,
      kind: null,
      reason: null,
    });
  });

  it.each([
    'Tableta APPLE iPad 11 (A16), 256GB, Wi-Fi + Cellular, Blue',
    'Smartwatch Apple Watch Ultra 3, GPS + Cellular, 49mm',
    'Card de memorie Samsung PRO Plus microSDXC 256GB + adaptor SD',
    'Telefon mobil realme 14 Pro+ 5G, 12GB RAM, 512GB',
    'Telefon Samsung 8GB + 256GB',
    'Smartphone Xiaomi 12 + 256 GB',
    'Uscator de rufe Electrolux, Clasa A+++',
    'Sursa Corsair RM850e, 850W, 80+ Gold',
    'Kit Philips Hue White Ambiance, 3 becuri E27 + Bridge',
    'Set tastatura + mouse Logitech MK270',
    'Set cutite Tefal Ice Force, 5 piese',
    'Set 2 becuri LED inteligente Xiaomi',
    'Pachet 4 baterii Duracell AA',
    'Card cadou eMAG 100 lei',
    'Aer conditionat Daikin, Kit instalare inclus',
    'Tableta Lenovo Tab M11, cu Lenovo Tab Pen',
    'Router Wi-Fi 6 + Bluetooth',
    'Imprimanta multifunctionala Print + Scan + Copy',
    'Joc EA SPORTS FC 26 pentru PlayStation 5',
  ])('%s → not a bundle', (title) => {
    expect(detectBundle(title).isBundle).toBe(false);
  });

  it('handles empty input', () => {
    expect(detectBundle(null)).toEqual({ isBundle: false, kind: null, reason: null });
  });
});

describe('detectAccessory', () => {
  it.each([
    ['Husa de protectie pentru iPhone 17 Pro, Silicon, Negru', 'noun:husa'],
    ['Folie sticla Spigen pentru Samsung Galaxy S25 Ultra', 'noun:folie'],
    ['Sticla de protectie iPhone 16', 'noun:sticla'],
    ['Cablu de date Ugreen USB-C la Lightning', 'noun:cablu'],
    ['Incarcator retea Samsung 25W', 'noun:incarcator'],
    ['Încărcător Apple 20W USB-C', 'noun:incarcator'],
    ['Adaptor Lenovo USB-C la HDMI', 'noun:adaptor'],
    ['Suport TV de perete Hama', 'noun:suport'],
    ['Geanta laptop Dell 15"', 'noun:geanta'],
    ['Rucsac laptop Samsonite 15.6"', 'noun:rucsac'],
    ['Carcasa telefon iPhone 15', 'noun:carcasa'],
    ['Stylus Apple Pencil Pro', 'noun:stylus'],
    ['Curea pentru Apple Watch 45mm', 'noun:curea'],
    ['Controller wireless Sony DualSense pentru PlayStation 5', 'noun:controller'],
    ['Docking station Dell WD19S', 'noun:docking'],
    ['Apple Husa silicon MagSafe iPhone 17', 'noun:husa'],
    ['Spigen Ultra Hybrid pentru iPhone 17 Pro', 'compat'],
    ['Tempered glass compatibil cu Samsung Galaxy A56', 'compat'],
  ])('%s → accessory (%s)', (title, reason) => {
    expect(detectAccessory(title)).toEqual({ isAccessory: true, reason });
  });

  it.each([
    'Telefon mobil Apple iPhone 17 Pro, 256GB',
    'Smartwatch Apple Watch Series 11, Carcasa Aluminiu 46mm, Curea Sport M/L',
    'Bratara fitness Xiaomi Smart Band 10',
    'Carcasa Lian Li O11 Dynamic EVO, Mid-Tower',
    'Baterie externa Anker PowerCore 20000mAh',
    'Mouse wireless Logitech MX Master 3S',
    'Laptop Lenovo IdeaPad, incarcator inclus',
    'Consola PS5 + Controller DualSense',
    'Tableta pentru copii Lenovo Tab M9',
    'Apple iPhone 16 128GB Black',
  ])('%s → not an accessory', (title) => {
    expect(detectAccessory(title).isAccessory).toBe(false);
  });

  it('uses the shop category when the title does not decide', () => {
    expect(detectAccessory('Spigen Ultra Hybrid Transparent', 'Accesorii GSM > Huse')).toEqual({
      isAccessory: true,
      reason: 'category',
    });
    expect(detectAccessory('Telefon mobil Samsung', 'Accesorii GSM')).toMatchObject({
      isAccessory: false,
    });
    expect(detectAccessory('')).toEqual({ isAccessory: false, reason: null });
  });

  // Live eMAG run, 2026-10-27: every listing breadcrumb has an "… & accesorii" parent.
  const LAPTOPS = 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook';
  const PHONES = 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile';
  const TVS = 'TV, Audio-Video & Foto > Televizoare & accesorii > Televizoare';
  const CONSOLES = 'Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware';

  it.each([
    [
      "Apple MacBook Air 13'' cu procesor Apple M5, 10 nuclee CPU, 24GB RAM, 1TB SSD, Sky Blue, Tastatura Internationala, Manual RO, Fara incarcator",
      LAPTOPS,
      'kind:laptop',
    ],
    [
      'Gaming Notebook 16 GB RAM 512 GB 1 TB SSD expansiune Core i3 Laptop Notebook 16 inch cu mouse si tastatura autocolante',
      LAPTOPS,
      'kind:laptop',
    ],
    [
      'Mini Laptop 8" 2-in-1, Laptop Computer Win 11, Intel N95, 12GB RAM 512GB SSD',
      LAPTOPS,
      'kind:laptop',
    ],
    ['Lenovo LOQ 15ARP9, 15.6", 16GB, GeForce RTX 4050, SSD512, 144Hz', LAPTOPS, 'kind:laptop'],
    ['Lenovo LOQ 15ARP9, 15.6", 16GB, GeForce RTX 4050, SSD512, 144Hz', null, 'kind:laptop'],
    [
      'SweetLink S2 Plus Telefon mobil pentru seniori, taste mari, buton SOS, Stand incarcare, negru',
      PHONES,
      'kind:phone',
    ],
    [
      'Kiano Slim TV Travel Televizor 19" pentru camion si rulote | LED HD TV | Incarcator auto | Negru |',
      TVS,
      'kind:tv',
    ],
    ['PlayStation Portal Remote Player, White', CONSOLES, 'kind:console'],
    ['PlayStation Portal Remote Player, White', null, 'kind:console'],
    ['Miyoo Mini Plus Consola de joc portabila, culoare mov transparent', CONSOLES, 'kind:console'],
    ['Mini consola Retro Portabila Nostalgic Jocuri 2 Jocatori', CONSOLES, 'kind:console'],
    [
      'Gameboy cu 400 de jocuri, multiplayer, 2v2, Retro FC, compatibil TV, negru',
      CONSOLES,
      'kind:console',
    ],
    ['Joc TV Consola Retro + Pistol 2x Pady + 9999 jocuri', CONSOLES, 'kind:console'],
  ])('%s (%s) → not an accessory', (title, category, reason) => {
    expect(detectAccessory(title, category)).toEqual({ isAccessory: false, reason });
  });

  it.each([
    ['Set 2 Controllers wireless, PS4, PS-TV si PS Now, negru, rosu HAPPY JOKER®', 'noun:set'],
    ['HAPPY JOKER Controller wireless pentru PS4, negru', 'noun:controller'],
    [
      'Controller Wireless Dual-Sense pentru PS5, compatibile doar cu jocuri din /PS4',
      'noun:controller',
    ],
  ])('%s → accessory even in a console listing (%s)', (title, reason) => {
    expect(detectAccessory(title, CONSOLES)).toEqual({ isAccessory: true, reason });
  });
});
