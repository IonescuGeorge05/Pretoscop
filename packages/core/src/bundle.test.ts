import { describe, expect, it } from 'vitest';
import { detectAccessory } from './accessory';
import { detectBundle } from './bundle';

describe('detectBundle', () => {
  it.each([
    ['Consola PlayStation 5 Slim Digital Edition, 1TB + joc EA FC 26', 'plus:joc'],
    ['Consola Nintendo Switch 2 + Mario Kart World (cod descarcare)', 'plus:mario'],
    ['Pachet Consola Sony PlayStation 5 Slim, 1TB + 2 controllere', 'pachet'],
    ['Set PS5 Slim + 2 jocuri', 'plus:2'],
    ['Set Consola PlayStation 5 Slim Digital + 2 jocuri (Gran Turismo 7)', 'plus:2'],
    ['Bundle Xbox Series X + Forza Horizon 5', 'bundle'],
    ['Telefon mobil Samsung Galaxy S24 FE, 128GB, Blue + Incarcator 25W cadou', 'cadou'],
    ['Laptop MSI Katana 15, RTX 4060, No OS + Mouse Gaming Cadou', 'cadou'],
    ['Consola Xbox Series S cu joc inclus', 'joc inclus'],
    ['Consola PS5 Slim, include jocul Astro Bot', 'joc inclus'],
    ['Consola PS5 Slim si 2 jocuri', 'joc inclus'],
    ['Tableta Lenovo Tab M9 Kids, 32GB, Arctic Grey + Husa protectie', 'plus:husa'],
    ['Laptop Lenovo IdeaPad, 16GB + Office 2024', 'plus:office'],
  ])('%s → bundle (%s)', (title, reason) => {
    expect(detectBundle(title)).toEqual({ isBundle: true, reason });
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
    expect(detectBundle(null)).toEqual({ isBundle: false, reason: null });
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
    ['Apple Husa silicon MagSafe iPhone 17', 'noun'],
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
});
