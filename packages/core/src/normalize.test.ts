import { describe, expect, it } from 'vitest';
import { contentHash } from './hash';
import { isAcceptedOffer, type NormalizeContext, normalizeOffer } from './normalize';
import type { RawOffer } from './raw-offer';

const observedAt = new Date('2026-10-27T10:00:00Z');
const ctx: NormalizeContext = {
  shop: { slug: 'emag', shippingRules: { free_over: 250, flat: 19.99 } },
  observedAt,
  eurRonRate: 5.3487,
  hash: contentHash,
};

function raw(overrides: Partial<RawOffer> = {}): RawOffer {
  return {
    shopSlug: 'emag',
    externalId: 'DF1MLR2BM',
    url: 'https://www.emag.ro/telefon-mobil-samsung-galaxy-s25/pd/DF1MLR2BM/',
    title: 'Telefon mobil Samsung Galaxy S25 Ultra, Dual SIM, 12GB RAM, 256GB, 5G, Titanium Black',
    price: '5.999,99 lei',
    observedAt: observedAt.toISOString(),
    raw: {},
    ...overrides,
  };
}

function accepted(r: RawOffer, c: NormalizeContext = ctx) {
  const n = normalizeOffer(r, c);
  if (!isAcceptedOffer(n)) throw new Error(`rejected: ${n.rejects.join(', ')}`);
  return n;
}

describe('normalizeOffer: a typical product-page offer', () => {
  const n = accepted(
    raw({
      price: '5999.99',
      priceFormat: 'decimal',
      oldPrice: '6999.99',
      shopLowest30d: '5899.99',
      currency: 'RON',
      availability: 'https://schema.org/InStock',
      condition: 'https://schema.org/NewCondition',
      gtin: '8806095467290',
      mpn: 'SM-S938BZKDEUE',
      brand: 'Samsung',
      category: 'Telefoane mobile > Smartphone',
      sellerName: 'TelefonulTau',
      isMarketplaceSeller: true,
      title:
        'Telefon mobil Samsung Galaxy S25 Ultra, Dual SIM, 12GB RAM, 256GB, 5G, Titanium Black - eMAG.ro',
    }),
  );

  it('parses money into integer bani and computes the total', () => {
    expect(n.priceBani).toBe(599999);
    expect(n.oldPriceBani).toBe(699999);
    expect(n.shopLowest30dBani).toBe(589999);
    expect(n.shippingBani).toBeNull();
    expect(n.totalShippingBani).toBe(0);
    expect(n.totalBani).toBe(599999);
    expect(n.shippingBasis).toBe('free_over');
    expect(n.shippingEstimated).toBe(true);
    expect(n.currency).toBe('RON');
    expect(n.fxRate).toBeNull();
    expect(n.vatGrossedUp).toBe(false);
  });

  it('identifies the product', () => {
    expect(n.brandName).toBe('Samsung');
    expect(n.brandSlug).toBe('samsung');
    expect(n.brandVia).toBe('field');
    expect(n.mpnNorm).toBe('SMS938BZKDEUE');
    expect(n.mpnRaw).toBe('SM-S938BZKDEUE');
    expect(n.mpnSource).toBe('field');
    expect(n.productKind).toBe('phone');
    expect(n.attributes).toMatchObject({
      storageGb: 256,
      ramGb: 12,
      color: 'black',
      edition: ['ultra'],
    });
    expect(n.attributes.connectivity).toEqual(['5g', 'dual_sim']);
  });

  it('cleans titles and keeps the flags', () => {
    expect(n.titleClean).toBe(
      'Telefon mobil Samsung Galaxy S25 Ultra, Dual SIM, 12GB RAM, 256GB, 5G, Titanium Black',
    );
    expect(n.titleMatch).toBe(
      'telefon mobil samsung galaxy s25 ultra dual sim 12gb ram 256gb 5g titanium black',
    );
    expect(n.condition).toBe('new');
    expect(n.isBundle).toBe(false);
    expect(n.isAccessory).toBe(false);
    expect(n.availability).toBe('in_stock');
    expect(n.sellerName).toBe('TelefonulTau');
    expect(n.isMarketplaceSeller).toBe(true);
    expect(n.categoryRaw).toBe('Telefoane mobile > Smartphone');
  });

  it('hashes the observed price state', () => {
    expect(n.contentHash).toBe(
      contentHash({
        priceBani: 599999,
        oldPriceBani: 699999,
        shippingBani: null,
        availability: 'in_stock',
      }),
    );
    expect(n.rejects).toEqual([]);
    expect(n.ok).toBe(true);
  });
});

describe('normalizeOffer: prices', () => {
  it('drops an old price that is not above the price, and implausible ones', () => {
    const same = accepted(raw({ oldPrice: '5.999,99 lei' }));
    expect(same.oldPriceBani).toBeNull();
    expect(same.warnings).toContain('old_price_not_higher');
    const lower = accepted(raw({ oldPrice: '4.999 lei' }));
    expect(lower.oldPriceBani).toBeNull();
    const absurd = accepted(raw({ price: '100 lei', oldPrice: '1.000.000 lei' }));
    expect(absurd.oldPriceBani).toBeNull();
    expect(absurd.warnings).toContain('old_price_implausible');
    const bad = accepted(raw({ oldPrice: 'PRP' }));
    expect(bad.oldPriceBani).toBeNull();
    expect(bad.warnings).toContain('old_price_unparseable');
  });

  it('converts EUR with the BNR rate and rejects EUR without one', () => {
    const eur = accepted(raw({ price: '99.90', priceFormat: 'decimal', currency: 'EUR' }));
    expect(eur.currency).toBe('EUR');
    expect(eur.fxRate).toBe(5.3487);
    expect(eur.priceBani).toBe(53434);
    const missing = normalizeOffer(raw({ price: '99,90 €' }), { ...ctx, eurRonRate: null });
    expect(missing.ok).toBe(false);
    expect(missing.rejects).toEqual(['fx_rate_missing']);
    const other = normalizeOffer(raw({ price: '99 USD' }), ctx);
    expect(other.rejects).toEqual(['price_currency']);
  });

  it('grosses up prices stated without VAT, with the rate of the observation date', () => {
    const flagged = accepted(raw({ price: '1000', vatIncluded: false, oldPrice: '1200' }));
    expect(flagged.priceBani).toBe(121000);
    expect(flagged.oldPriceBani).toBe(145200);
    expect(flagged.vatGrossedUp).toBe(true);
    const text = accepted(raw({ price: '1.000 lei fără TVA' }));
    expect(text.priceBani).toBe(121000);
    const shopDefault = accepted(raw({ price: '1000' }), {
      ...ctx,
      shop: { ...ctx.shop, vatIncludedDefault: false },
    });
    expect(shopDefault.priceBani).toBe(121000);
    const old = accepted(raw({ price: '1000', vatIncluded: false }), {
      ...ctx,
      observedAt: new Date('2025-07-01T10:00:00Z'),
    });
    expect(old.priceBani).toBe(119000);
    const conflict = accepted(raw({ price: '1.000 lei fără TVA', vatIncluded: true }));
    expect(conflict.priceBani).toBe(100000);
    expect(conflict.warnings).toContain('vat_conflict');
  });

  it.each([
    ['', 'price_missing'],
    ['la cerere', 'price_missing'],
    ['1.000 - 2.000 lei', 'price_range'],
    ['99 lei/lună', 'price_instalment'],
    ['12,99 lei/kg', 'price_unit'],
    ['0 lei', 'price_zero'],
    ['-5 lei', 'price_negative'],
    ['9.999.999 lei', 'price_placeholder'],
    ['0,99 lei', 'price_too_low'],
    ['1 leu', 'price_too_low'],
    ['1.23499', 'price_unparseable'],
  ])('rejects price %j with %s', (price, reason) => {
    const n = normalizeOffer(raw({ price }), ctx);
    expect(n.ok).toBe(false);
    expect(n.rejects).toContain(reason);
    expect(n.contentHash).toBeNull();
  });

  it('marks "de la" prices', () => {
    const n = accepted(raw({ price: 'de la 1.299 lei' }));
    expect(n.priceIsFrom).toBe(true);
    expect(n.warnings).toContain('price_from');
  });
});

describe('normalizeOffer: delivery', () => {
  it('uses the offer cost, a free note, then the shop rules', () => {
    const cost = accepted(raw({ price: '100 lei', shippingCost: '15,99 lei' }));
    expect(cost).toMatchObject({
      shippingBani: 1599,
      totalBani: 11599,
      shippingBasis: 'offer',
      shippingEstimated: false,
    });
    const free = accepted(raw({ price: '100 lei', shippingNote: 'Livrare gratuită' }));
    expect(free).toMatchObject({ shippingBani: 0, totalBani: 10000, shippingBasis: 'offer' });
    const rule = accepted(raw({ price: '100 lei' }));
    expect(rule).toMatchObject({
      shippingBani: null,
      totalShippingBani: 1999,
      totalBani: 11999,
      shippingBasis: 'flat',
    });
    const noRules = accepted(raw({ price: '100 lei' }), { ...ctx, shop: { slug: 'x' } });
    expect(noRules).toMatchObject({
      totalShippingBani: null,
      totalBani: 10000,
      shippingBasis: 'unknown',
    });
    const conditional = accepted(raw({ price: '100 lei', shippingNote: 'Gratuit peste 200 lei' }));
    expect(conditional.shippingBani).toBeNull();
    const bad = accepted(raw({ price: '100 lei', shippingCost: 'curier rapid' }));
    expect(bad.warnings).toContain('shipping_unparseable');
  });
});

describe('normalizeOffer: identifiers', () => {
  it('keeps only valid GTINs and reports placeholders', () => {
    const placeholder = accepted(raw({ gtin: '0000000000000' }));
    expect(placeholder).toMatchObject({
      gtin14: null,
      gtinQuality: 'placeholder',
      gtinReason: 'all_zeros',
    });
    expect(placeholder.warnings).toContain('gtin_placeholder');
    const restricted = accepted(raw({ gtin: '2073519482603' }));
    expect(restricted).toMatchObject({ gtin14: null, gtinQuality: 'restricted' });
    const many = accepted(raw({ gtin: '0000000000000, 4006381333931, 0711719577034' }));
    expect(many).toMatchObject({
      gtin14: '04006381333931',
      gtinQuality: 'valid',
      gtinAlternates: ['00711719577034'],
    });
    const none = accepted(raw());
    expect(none).toMatchObject({ gtin14: null, gtinQuality: 'missing', gtinRaw: null });
    const shopFake = accepted(raw({ gtin: '4006381333931' }), {
      ...ctx,
      shop: { ...ctx.shop, fakeGtins: ['4006381333931'] },
    });
    expect(shopFake.gtinQuality).toBe('placeholder');
  });

  it('falls back to a title MPN and ignores an MPN field that is a GTIN', () => {
    const fromTitle = accepted(raw({ title: 'Televizor Samsung UE55DU7172UXXH, 138 cm, Smart' }));
    expect(fromTitle).toMatchObject({
      mpnNorm: 'UE55DU7172UXXH',
      mpnSource: 'title',
      mpnRaw: null,
    });
    const gtinAsMpn = accepted(raw({ mpn: '4006381333931' }));
    expect(gtinAsMpn.mpnSource).toBeNull();
    expect(gtinAsMpn.warnings).toContain('mpn_looks_like_gtin');
  });

  it('ignores an MPN field that is a spec or a chip (URL-slug leftovers)', () => {
    const oukitel = accepted(
      raw({
        title: 'Telefon mobil Oukitel WP200 Pro, Dual SIM, 5G, 6.7-inch AMOLED 120Hz',
        mpn: '67INCH',
      }),
    );
    expect(oukitel).toMatchObject({ mpnNorm: 'WP200', mpnSource: 'title', mpnRaw: '67INCH' });
    expect(oukitel.warnings).toContain('mpn_looks_like_spec');
    const r36s = accepted(
      raw({ title: 'Consola retro portabila R36S 64GB, CPU RK3326', mpn: 'CORTEXA53' }),
    );
    expect(r36s).toMatchObject({ mpnNorm: null, mpnSource: null });
    const real = accepted(raw({ title: 'Televizor SAMSUNG LED 43U8072H', mpn: 'UE43U8072HUXXH' }));
    expect(real).toMatchObject({ mpnNorm: 'UE43U8072HUXXH', mpnSource: 'field' });
  });

  it('reports unknown and conflicting brand fields', () => {
    const unknown = accepted(raw({ title: 'Husa silicon pentru iPhone 17', brand: 'Lemonttix' }));
    expect(unknown).toMatchObject({ brandName: 'Lemonttix', brandKnown: false });
    expect(unknown.warnings).toContain('brand_unknown');
    const conflict = accepted(raw({ brand: 'Apple' }));
    expect(conflict.brandName).toBe('Apple');
    expect(conflict.warnings).toContain('brand_conflict');
  });
});

describe('normalizeOffer: titles and flags', () => {
  it('normalizes the plan example (PS5 bundle)', () => {
    const n = accepted(
      raw({
        title: 'Consola PlayStation 5 Slim Digital Edition, 1TB + joc EA FC 26',
        price: '2.499 lei',
      }),
    );
    expect(n).toMatchObject({
      brandName: 'Sony',
      brandVia: 'product_line',
      isBundle: true,
      bundleKind: 'game',
      bundleReason: 'game:plus:joc',
      condition: 'new',
      productKind: 'console',
    });
    expect(n.attributes).toMatchObject({ storageGb: 1024, edition: ['slim', 'digital'] });
  });

  it('keeps eMAG device listings out of accessories and gifts visible (live run 2026-10-27)', () => {
    const macbook = accepted(
      raw({
        title:
          "Apple MacBook Air 13'' cu procesor Apple M5, 10 nuclee CPU, 16GB RAM, 512GB SSD, Midnight, Tastatura Internationala, Manual RO, Fara incarcator",
        category: 'Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook',
        price: '5.999,99 lei',
      }),
    );
    expect(macbook).toMatchObject({
      productKind: 'laptop',
      isAccessory: false,
      accessoryReason: 'kind:laptop',
      isBundle: false,
      bundleKind: null,
    });
    const redmi = accepted(
      raw({
        title: 'Telefon mobil Xiaomi Redmi 15C, 4GB RAM, 128GB ROM, Black + Woven Strap Ring Stand',
        category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
        price: '599,99 lei',
      }),
    );
    expect(redmi).toMatchObject({
      isBundle: true,
      bundleKind: 'gift',
      bundleReason: 'gift:plus:woven',
    });
  });

  it('flags accessories, refurbished and used offers', () => {
    const husa = accepted(
      raw({ title: 'Husa de protectie pentru iPhone 17 Pro, Silicon, Negru', price: '49,99 lei' }),
    );
    expect(husa).toMatchObject({
      isAccessory: true,
      brandName: null,
      attributes: { color: 'black' },
    });
    const resigilat = accepted(
      raw({ title: 'Telefon mobil Apple iPhone 15, 128GB, Pink, Resigilat' }),
    );
    expect(resigilat).toMatchObject({ condition: 'refurbished', conditionDetail: 'open_box' });
    const used = accepted(raw({ condition: 'UsedCondition' }));
    expect(used).toMatchObject({ condition: 'used', conditionReason: 'field:UsedCondition' });
  });

  it('rejects cel.ro decoy titles and missing identity', () => {
    expect(normalizeOffer(raw({ title: 'Husa Pro b6fc26eb', price: '945' }), ctx).rejects).toEqual([
      'title_junk_hex',
    ]);
    expect(normalizeOffer(raw({ title: '  ' }), ctx).rejects).toEqual(['title_missing']);
    expect(normalizeOffer(raw({ externalId: '' }), ctx).rejects).toEqual(['external_id_missing']);
  });

  it('normalizes Romanian text', () => {
    const n = accepted(
      raw({
        title: 'Mașină de spălat rufe Arctic APL81222XLAB4, 8 kg, Clasa A, Alb',
        price: '1.499 lei',
      }),
    );
    expect(n.titleClean).toBe('Mașină de spălat rufe Arctic APL81222XLAB4, 8 kg, Clasa A, Alb');
    expect(n.titleAscii).toBe('Masina de spalat rufe Arctic APL81222XLAB4, 8 kg, Clasa A, Alb');
    expect(n.attributes).toMatchObject({ capacityKg: 8, energyClass: 'A', color: 'white' });
    const cedilla = accepted(
      raw({ title: 'Ma\u{15F}in\u{103} de sp\u{103}lat rufe Beko', price: '999 lei' }),
    );
    expect(cedilla.titleClean).toBe('Mașină de spălat rufe Beko');
  });
});

describe('normalizeOffer: determinism and context', () => {
  it('returns the same result for the same input', () => {
    const input = raw({ oldPrice: '6.499 lei', gtin: '4006381333931', availability: 'in stoc' });
    expect(normalizeOffer(input, ctx)).toEqual(normalizeOffer(input, ctx));
  });

  it('changes the content hash only when price state changes', () => {
    const a = accepted(raw({ price: '100 lei', availability: 'in stoc' }));
    const b = accepted(
      raw({ price: '100 lei', availability: 'in stoc', title: 'Alt titlu Samsung' }),
    );
    const c = accepted(raw({ price: '101 lei', availability: 'in stoc' }));
    const d = accepted(raw({ price: '100 lei', availability: 'stoc epuizat' }));
    expect(b.contentHash).toBe(a.contentHash);
    expect(c.contentHash).not.toBe(a.contentHash);
    expect(d.contentHash).not.toBe(a.contentHash);
  });

  it('accepts any injected hash function', () => {
    const n = accepted(raw({ price: '100 lei' }), { ...ctx, hash: (f) => `p${f.priceBani}` });
    expect(n.contentHash).toBe('p10000');
  });

  it('throws on an invalid context', () => {
    expect(() => normalizeOffer(raw(), { ...ctx, observedAt: new Date('x') })).toThrow(
      /observedAt/,
    );
    expect(() =>
      normalizeOffer(raw(), { ...ctx, hash: undefined as unknown as NormalizeContext['hash'] }),
    ).toThrow(/hash/);
  });
});
