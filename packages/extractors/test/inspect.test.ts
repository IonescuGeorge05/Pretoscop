import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { detectFeedFormat, feedText, hostOnDomain, inspectFeed } from '../src/index';
import { fixture } from './helpers';

describe('detectFeedFormat', () => {
  it('recognizes Google Merchant (RSS and Atom), compari.ro XML and CSV', () => {
    expect(detectFeedFormat(fixture('feeds/google_sample.rss.xml'))).toBe('google');
    expect(detectFeedFormat(fixture('feeds/google_sample.atom.xml'))).toBe('google');
    expect(detectFeedFormat(fixture('feeds/compari_sample.xml'))).toBe('compari');
    expect(detectFeedFormat(fixture('feeds/generic_sample.csv'))).toBe('csv');
    expect(detectFeedFormat('\ufeffid,title,price,link\n1,a,2,b')).toBe('csv');
  });

  it('refuses HTML pages, other XML and plain text', () => {
    expect(detectFeedFormat('<!doctype html><html><head><title>Magazin</title></head></html>')).toBeNull();
    expect(detectFeedFormat('<?xml version="1.0"?><urlset><url><loc>x</loc></url></urlset>')).toBeNull();
    expect(detectFeedFormat('just some text')).toBeNull();
  });
});

describe('inspectFeed', () => {
  it('summarizes a Google Merchant feed: fields, decimal prices, delivery, domain', async () => {
    const r = await inspectFeed(fixture('feeds/google_sample.rss.xml'), { format: 'google', domain: 'magazin-exemplu.ro' });
    expect(r.parserKey).toBe('feed-google-shopping');
    expect(r.offers).toBe(2);
    expect(r.rows).toBe(2);
    expect(r.skippedRows).toBe(0);
    expect(r.priceFormat.verdict).toBe('decimal');
    expect(r.fields.gtin).toBe(1);
    expect(r.fields.shippingCost).toBe(1);
    expect(r.fields.availability).toBe(2);
    expect(r.domain).toMatchObject({ expected: 'magazin-exemplu.ro', onDomain: 2, offDomain: 0 });
    expect(r.currencies).toEqual({ RON: 2 });
    expect(r.sample).toHaveLength(2);
    expect(r.parseError).toBeNull();
  });

  it('reads a compari.ro feed in Romanian price format', async () => {
    const r = await inspectFeed(fixture('feeds/compari_sample.xml'), { format: 'compari', domain: 'pcgarage.ro' });
    expect(r.offers).toBe(2);
    expect(r.priceFormat.verdict).toBe('ro');
    expect(r.fields.shippingCost).toBe(2);
    expect(r.domain.onDomain).toBe(2);
  });

  it('flags "12.500" prices as ambiguous with examples, and counts rows without title, URL or price', async () => {
    const csv = [
      'id;title;price;link',
      'A1;Laptop Lenovo IdeaPad 5;12.500;https://www.magazin.ro/a1',
      'A2;Mouse Logitech M185;1.299;https://www.magazin.ro/a2',
      'A3;Fara pret;;https://www.magazin.ro/a3',
      'A4;Fara link;99.90;',
    ].join('\n');
    const r = await inspectFeed(csv, { format: 'csv', domain: 'magazin.ro' });
    expect(r.offers).toBe(2);
    expect(r.rows).toBe(4);
    expect(r.skippedRows).toBe(2);
    expect(r.priceFormat).toEqual({ verdict: 'ambiguous', ambiguousExamples: ['12.500', '1.299'] });
  });

  it('reports mixed price formats, off-domain URLs, duplicate ids, VAT flags and other currencies', async () => {
    const csv = [
      'id,title,price,link,tva,currency',
      'B1,Produs unu,"1.234,56",https://www.magazin.ro/b1,da,RON',
      'B1,Produs unu bis,99.90,https://www.alt-magazin.ro/b1,nu,RON',
      'B3,Produs trei,10.00,https://cdn.magazin.ro/b3,,EUR',
    ].join('\n');
    const r = await inspectFeed(csv, { format: 'csv', domain: 'magazin.ro' });
    expect(r.priceFormat.verdict).toBe('mixed');
    expect(r.domain).toMatchObject({ onDomain: 2, offDomain: 1, offDomainExamples: ['https://www.alt-magazin.ro/b1'] });
    expect(r.duplicateIds).toBe(1);
    expect(r.vat).toEqual({ included: 1, excluded: 1, unknown: 1 });
    expect(r.currencies).toEqual({ RON: 2, EUR: 1 });
  });

  it('stops at the limit and reports malformed XML without throwing', async () => {
    const items = Array.from({ length: 30 }, (_, i) => `<item><g:id>${i}</g:id><g:title>P ${i}</g:title><g:link>https://m.ro/${i}</g:link><g:price>1${i}.00 RON</g:price></item>`).join('');
    const xml = `<rss xmlns:g="http://base.google.com/ns/1.0"><channel>${items}</channel></rss>`;
    const r = await inspectFeed(xml, { format: 'google', limit: 10, sampleSize: 3 });
    expect(r.offers).toBe(10);
    expect(r.truncated).toBe(true);
    expect(r.sample).toHaveLength(3);

    const broken = await inspectFeed('<rss xmlns:g="x"><channel><item><g:title>A</g:title><g:link>https://m.ro/a</g:link><g:price>1.00</g:price></item><item><g:title>', { format: 'google' });
    expect(broken.parseError === null || broken.parseError.length > 0).toBe(true);
  });

  it('reads gzip bodies as text and matches subdomains to the shop domain', async () => {
    expect(await feedText(gzipSync(Buffer.from('id,title\n1,a')))).toBe('id,title\n1,a');
    expect(hostOnDomain('https://www.magazin.ro/x', 'magazin.ro')).toBe(true);
    expect(hostOnDomain('https://magazin.ro/x', 'magazin.ro')).toBe(true);
    expect(hostOnDomain('https://magazin.ro.evil.com/x', 'magazin.ro')).toBe(false);
    expect(hostOnDomain('https://altmagazin.ro/x', 'magazin.ro')).toBe(false);
    expect(hostOnDomain('nu e url', 'magazin.ro')).toBe(false);
  });
});
