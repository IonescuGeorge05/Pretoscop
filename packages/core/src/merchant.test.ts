import { describe, expect, it } from 'vitest';
import { emailProvesDomain, normalizeShopDomain, shopSlugFromDomain } from './merchant';

describe('normalizeShopDomain', () => {
  it.each([
    ['https://www.Magazin.ro/categorie?x=1', 'magazin.ro'],
    ['magazin.ro', 'magazin.ro'],
    ['www.magazinul-meu.ro/', 'magazinul-meu.ro'],
    ['http://shop.exemplu.com.ro:8080/p', 'shop.exemplu.com.ro'],
    ['MAGAZIN.RO.', 'magazin.ro'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeShopDomain(input)).toBe(expected);
  });

  it.each(['', '   ', 'localhost', 'http://127.0.0.1/', '192.168.1.1', 'magazin', 'nu este un domeniu', 'ftp//x'])('refuses %j', (input) => {
    expect(normalizeShopDomain(input)).toBeNull();
  });
});

describe('emailProvesDomain', () => {
  it('accepts the same domain, a mail subdomain or a parent domain', () => {
    expect(emailProvesDomain('ion@magazin.ro', 'magazin.ro')).toBe(true);
    expect(emailProvesDomain('ion@mail.magazin.ro', 'magazin.ro')).toBe(true);
    expect(emailProvesDomain('ion@magazin.ro', 'shop.magazin.ro')).toBe(true);
    expect(emailProvesDomain('ION@MAGAZIN.RO', 'magazin.ro')).toBe(true);
  });

  it('refuses other domains, look-alikes and free webmail', () => {
    expect(emailProvesDomain('ion@altmagazin.ro', 'magazin.ro')).toBe(false);
    expect(emailProvesDomain('ion@magazin.ro.evil.com', 'magazin.ro')).toBe(false);
    expect(emailProvesDomain('ion@gmail.com', 'magazin.ro')).toBe(false);
    expect(emailProvesDomain('ion@gmail.com', 'gmail.com')).toBe(false);
    expect(emailProvesDomain('fara-arond', 'magazin.ro')).toBe(false);
  });
});

describe('shopSlugFromDomain', () => {
  it('drops the TLD (and com/net/org/co second levels) and slugifies', () => {
    expect(shopSlugFromDomain('magazinul-meu.ro')).toBe('magazinul-meu');
    expect(shopSlugFromDomain('shop.exemplu.com.ro')).toBe('shop-exemplu');
    expect(shopSlugFromDomain('pcgarage.ro')).toBe('pcgarage');
    expect(shopSlugFromDomain('a.ro')).toBe('a');
  });
});
