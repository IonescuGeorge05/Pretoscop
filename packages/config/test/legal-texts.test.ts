import { describe, expect, it } from 'vitest';
import * as root from '../src/index';
import {
  allConsentTexts,
  consentTextByKey,
  currentConsentText,
  currentVersion,
  legalContacts,
  legalDocuments,
  legalTexts,
  supervisoryAuthority,
} from '../src/legal-texts';

/** Every string reachable from a value (deep). */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

const CEDILLA = /[şţŞŢ]/;

describe('consent texts', () => {
  it('publishes alertConsent.v1 and analyticsConsent.v1, and currentVersion points at them', () => {
    expect(legalTexts.alertConsent.v1.key).toBe('alertConsent.v1');
    expect(legalTexts.analyticsConsent.v1.key).toBe('analyticsConsent.v1');
    expect(currentVersion).toEqual({ alertConsent: 'alertConsent.v1', analyticsConsent: 'analyticsConsent.v1', merchantTerms: 'merchantTerms.v1' });
    expect(currentConsentText('alertConsent')).toBe(legalTexts.alertConsent.v1);
    expect(currentConsentText('analyticsConsent')).toBe(legalTexts.analyticsConsent.v1);
  });

  it('keys match their name and version, and are unique', () => {
    for (const [name, versions] of Object.entries(legalTexts)) {
      for (const [v, text] of Object.entries(versions)) {
        expect(v).toBe(`v${text.version}`);
        expect(text.key).toBe(`${name}.${v}`);
        expect(text.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
    const keys = allConsentTexts().map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('resolves stored version keys and rejects unknown ones', () => {
    expect(consentTextByKey('alertConsent.v1')?.title).toMatch(/alerte de preț/);
    expect(consentTextByKey('alertConsent.v99')).toBeUndefined();
    expect(consentTextByKey('analytics.v1')).toBeUndefined();
  });

  it('the alert consent covers the product, double opt-in, unsubscribe and the privacy policy', () => {
    const t = legalTexts.alertConsent.v1;
    expect(t.text).toMatch(/pe email/);
    expect(t.text).toMatch(/produsul ales/);
    expect(t.text).toMatch(/dublă confirmare/);
    expect(t.text).toMatch(/dezabona oricând/);
    expect(t.text).toMatch(/fiecare email/);
    expect(t.link.href.startsWith('/confidentialitate')).toBe(true);
  });

  it('the merchant terms checkbox covers the right to represent the shop and feed accuracy', () => {
    const t = legalTexts.merchantTerms.v1;
    expect(t.text).toMatch(/dreptul să reprezint/);
    expect(t.text).toMatch(/corecte și actualizate/);
    expect(t.link.href).toBe('/pentru-magazine/termeni');
  });

  it('the analytics banner offers Accept and Reject and links to the cookie page', () => {
    const t = legalTexts.analyticsConsent.v1;
    expect(t.acceptLabel).toBe('Accept');
    expect(t.rejectLabel).toBe('Refuz');
    expect(t.text).toMatch(/Plausible/);
    expect(t.link.href).toBe('/cookies');
  });

  it('contains no cedilla diacritics and no empty strings', () => {
    const all = strings({ legalTexts, legalDocuments, legalContacts, supervisoryAuthority });
    expect(all.length).toBeGreaterThan(20);
    for (const s of all) {
      expect(s, s).not.toMatch(CEDILLA);
      expect(s.trim().length, 'empty string').toBeGreaterThan(0);
    }
  });
});

describe('legal documents', () => {
  it('every page has a path, a semantic version and an ISO date', () => {
    for (const doc of Object.values(legalDocuments)) {
      expect(doc.path).toMatch(/^(\/[a-z-]+)+$/);
      expect(doc.version).toMatch(/^\d+\.\d+$/);
      expect(doc.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const legal = Object.values(legalDocuments)
      .filter((d) => d.kind === 'legal')
      .map((d) => d.path);
    expect(legal).toEqual(['/termeni', '/confidentialitate', '/cookies', '/accesibilitate', '/pentru-magazine/termeni']);
  });

  it('is exported from the package root as well', () => {
    expect(root.legalTexts).toBe(legalTexts);
    expect(root.currentVersion).toBe(currentVersion);
    expect(root.legalDocuments).toBe(legalDocuments);
  });
});
