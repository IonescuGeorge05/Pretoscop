import { describe, expect, it } from 'vitest';
import { affiliateAllowed, buildAffiliateUrl, comparatorPolicyFrom2P, type AffiliateProgramRef } from '../src/affiliate';

const offer = { url: 'https://www.itgalaxy.ro/laptop/lenovo-ideapad-5?ref=x&y=ă', shopSlug: 'itgalaxy', shopDomain: 'itgalaxy.ro' };
const prog = (extra: Partial<AffiliateProgramRef> = {}): AffiliateProgramRef => ({
  network: '2performant',
  status: 'approved',
  comparatorPolicy: 'allowed',
  programExternalId: 'a1b2c3d4e',
  linkTemplate: null,
  ...extra,
});
const account = { twoPerformantAffCode: 'f9e8d7c6b', awinPublisherId: '123456', cjPublisherId: '7654321', tradedoublerAffiliateId: '999' };

describe('buildAffiliateUrl', () => {
  it('builds the documented 2Performant quicklink with the click id as stats tag', () => {
    expect(buildAffiliateUrl(offer, prog(), account, { sub: 'c42' })).toBe(
      'https://event.2performant.com/events/click?ad_type=quicklink&aff_code=f9e8d7c6b&unique=a1b2c3d4e&redirect_to=https%3A%2F%2Fwww.itgalaxy.ro%2Flaptop%2Flenovo-ideapad-5%3Fref%3Dx%26y%3D%C4%83&st=c42',
    );
  });

  it('builds Awin, CJ and Tradedoubler deep links', () => {
    const u = encodeURIComponent(offer.url);
    expect(buildAffiliateUrl(offer, prog({ network: 'awin', programExternalId: '16122' }), account, { sub: 'c1' })).toBe(`https://www.awin1.com/cread.php?awinmid=16122&awinaffid=123456&ued=${u}&clickref=c1`);
    expect(buildAffiliateUrl(offer, prog({ network: 'cj', programExternalId: '1234' }), account)).toBe(`https://www.anrdoezrs.net/click-7654321-1234?url=${u}`);
    expect(buildAffiliateUrl(offer, prog({ network: 'tradedoubler', programExternalId: '55' }), account, { sub: 'c2' })).toBe(`https://clk.tradedoubler.com/click?p=55&a=999&url=${u}&epi=c2`);
  });

  it('uses a program template when present (https only)', () => {
    expect(buildAffiliateUrl(offer, prog({ linkTemplate: 'https://go.example/r?u={url}&s={sub}' }), account, { sub: 'c3' })).toBe(`https://go.example/r?u=${encodeURIComponent(offer.url)}&s=c3`);
    expect(buildAffiliateUrl(offer, prog({ linkTemplate: 'javascript:alert(1)//{url}' }), account)).toBeNull();
  });

  it('plain link unless approved and allowed; never for eMAG; never off the shop domain', () => {
    expect(buildAffiliateUrl(offer, prog({ comparatorPolicy: 'forbidden' }), account)).toBeNull();
    expect(buildAffiliateUrl(offer, prog({ comparatorPolicy: 'unknown' }), account)).toBeNull();
    expect(buildAffiliateUrl(offer, prog({ status: 'pending' }), account)).toBeNull();
    expect(buildAffiliateUrl(offer, prog({ comparatorPolicy: 'written_ok' }), account)).not.toBeNull();
    expect(affiliateAllowed(prog(), 'emag')).toBe(false);
    expect(buildAffiliateUrl({ ...offer, url: 'https://evil.example/itgalaxy.ro' }, prog(), account)).toBeNull();
    expect(buildAffiliateUrl({ ...offer, url: 'https://shop.itgalaxy.ro/p/1' }, prog(), account)).not.toBeNull();
    expect(buildAffiliateUrl(offer, prog({ network: 'profitshare' }), account)).toBeNull();
    expect(buildAffiliateUrl(offer, prog(), {})).toBeNull();
  });

  it('cleans the sub-id', () => {
    expect(buildAffiliateUrl(offer, prog(), account, { sub: 'c4"><script>' })).toMatch(/&st=c4script$/);
  });
});

describe('comparatorPolicyFrom2P', () => {
  const today = '2026-10-28';
  it('maps the Price Comparison Services permission', () => {
    expect(comparatorPolicyFrom2P([{ name: 'Price Comparison Services', usage: 'yes' }], today)).toEqual({ policy: 'allowed', endsOn: null });
    expect(comparatorPolicyFrom2P([{ name: 'Price Comparison Services', usage: 'no' }], today).policy).toBe('forbidden');
    expect(comparatorPolicyFrom2P([{ name: 'Price Comparison Services', usage: 'maybe' }], today).policy).toBe('unknown');
    expect(comparatorPolicyFrom2P([{ name: 'Cashbacks', usage: 'yes' }], today).policy).toBe('unknown');
  });
  it('falls back to Product Aggregators and honours the 180-day notice', () => {
    expect(comparatorPolicyFrom2P([{ name: 'Product Aggregators', usage: 'yes' }], today).policy).toBe('allowed');
    expect(comparatorPolicyFrom2P([{ name: 'Price Comparison Services', usage: 'yes', end_at: '2027-04-26T00:00:00Z' }], today)).toEqual({ policy: 'allowed', endsOn: '2027-04-26' });
    expect(comparatorPolicyFrom2P([{ name: 'Price Comparison Services', usage: 'yes', end_at: '2026-10-01' }], today).policy).toBe('forbidden');
    expect(comparatorPolicyFrom2P([{ name: 'Price Comparison Services', usage: 'yes', status: 'deleted' }], today).policy).toBe('unknown');
  });
});
