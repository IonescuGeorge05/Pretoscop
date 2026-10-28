import { describe, expect, it } from 'vitest';
import { emailProvesDomain, hostOnShopDomain, isPublicSuffix, normalizeShopDomain, shopSlugFromDomain } from './merchant';

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

  it.each(['', '   ', 'localhost', 'http://127.0.0.1/', '192.168.1.1', 'magazin', 'nu este un domeniu', 'ftp//x', 'com.ro', 'https://www.org.ro/', 'myshopify.com', 'co.uk'])('refuses %j', (input) => {
    expect(normalizeShopDomain(input)).toBeNull();
  });
});

describe('emailProvesDomain', () => {
  it('accepts the same domain, or a shop on a subdomain of the address domain', () => {
    expect(emailProvesDomain('ion@magazin.ro', 'magazin.ro')).toBe(true);
    expect(emailProvesDomain('ion@magazin.ro', 'shop.magazin.ro')).toBe(true);
    expect(emailProvesDomain('ion@firma.com.ro', 'firma.com.ro')).toBe(true);
    expect(emailProvesDomain('ION@MAGAZIN.RO', 'magazin.ro')).toBe(true);
  });

  it('refuses other domains, look-alikes and free webmail', () => {
    expect(emailProvesDomain('ion@altmagazin.ro', 'magazin.ro')).toBe(false);
    expect(emailProvesDomain('ion@magazin.ro.evil.com', 'magazin.ro')).toBe(false);
    expect(emailProvesDomain('ion@gmail.com', 'magazin.ro')).toBe(false);
    expect(emailProvesDomain('ion@gmail.com', 'gmail.com')).toBe(false);
    expect(emailProvesDomain('fara-arond', 'magazin.ro')).toBe(false);
  });

  it('never lets a mailbox on a subdomain prove its parent, nor anything prove a public suffix', () => {
    expect(emailProvesDomain('ion@mail.magazin.ro', 'magazin.ro')).toBe(false);
    expect(emailProvesDomain('student@stud.uni.ro', 'uni.ro')).toBe(false);
    expect(emailProvesDomain('ion@firma.com.ro', 'com.ro')).toBe(false);
    expect(emailProvesDomain('ion@com.ro', 'firma.com.ro')).toBe(false);
    expect(emailProvesDomain('ion@myshopify.com', 'magazin.myshopify.com')).toBe(false);
  });
});

describe('isPublicSuffix and hostOnShopDomain', () => {
  it('knows the .ro second levels and platform suffixes, and matches subdomains only on label boundaries', () => {
    expect(['com.ro', 'org.ro', 'tm.ro', 'ro', 'github.io', 'CO.UK.'].map(isPublicSuffix)).toEqual([true, true, true, true, true, true]);
    expect(['magazin.ro', 'firma.com.ro', 'magazin.myshopify.com'].map(isPublicSuffix)).toEqual([false, false, false]);
    expect(hostOnShopDomain('www.magazin.ro', 'magazin.ro')).toBe(true);
    expect(hostOnShopDomain('MAGAZIN.RO.', 'magazin.ro')).toBe(true);
    expect(hostOnShopDomain('altmagazin.ro', 'magazin.ro')).toBe(false);
    expect(hostOnShopDomain('magazin.ro.evil.com', 'magazin.ro')).toBe(false);
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
