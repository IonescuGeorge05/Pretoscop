import { describe, expect, it } from 'vitest';
import { alertDigestEmail, confirmationEmail, reasonLine, retentionNoticeEmail, type AlertItem } from '../src/email';
import { deliveryLine, dropPercent } from '../src/format';

const operator = { name: 'Pretoscop (în curs de înființare)', address: 'România', website: 'https://pretoscop.ro' };
const CEDILLA = /[şţŞŢ]/;

function item(over: Partial<AlertItem> = {}): AlertItem {
  return {
    alertId: 1,
    productTitle: 'Telefon mobil Testoscop X1, 128GB, Negru',
    productUrl: 'https://pretoscop.ro/p/telefon-mobil-testoscop-x1-1',
    outUrl: 'https://pretoscop.ro/out/55?p=alert',
    shopName: 'forIT',
    totalBani: 199_900,
    priceBani: 197_400,
    shippingBani: 2_500,
    shippingEstimated: false,
    checkedAt: new Date('2026-11-06T10:05:00Z'),
    reason: 'below_target',
    referenceBani: 200_000,
    referenceKind: 'target',
    anyVariant: false,
    unsubscribeUrl: 'https://pretoscop.ro/alerte/dezabonare?a=1&t=x',
    affiliate: false,
    ...over,
  };
}

describe('confirmation email', () => {
  const mail = confirmationEmail({
    productTitle: 'Telefon <b>X1</b> & co',
    kind: 'below',
    targetBani: 199_999,
    anyVariant: true,
    confirmUrl: 'https://pretoscop.ro/alerte/confirmare?a=1&t=abc',
    consent: { text: 'Vreau să primesc pe email alerte de preț.', key: 'alertConsent.v1' },
    requestedAt: new Date('2026-11-06T10:00:00Z'),
    expiresDays: 7,
    operator,
  });

  it('names the product, the condition, the link, the consent text and version, and the sender', () => {
    expect(mail.subject).toBe('Confirmă alerta de preț pentru Telefon <b>X1</b> & co');
    expect(mail.text).toContain('1.999,99 lei sau mai jos');
    expect(mail.text).toContain('toate variantele modelului');
    expect(mail.text).toContain('https://pretoscop.ro/alerte/confirmare?a=1&t=abc');
    expect(mail.text).toContain('(alertConsent.v1)');
    expect(mail.text).toContain('6 nov. 2026, 12:00');
    expect(mail.text).toContain('ignoră emailul');
    expect(mail.text).toContain('Pretoscop (în curs de înființare), România');
  });

  it('escapes everything in HTML and carries no images or remote resources', () => {
    expect(mail.html).toContain('Telefon &lt;b&gt;X1&lt;/b&gt; &amp; co');
    expect(mail.html).not.toContain('<b>X1</b>');
    expect(mail.html).toContain('href="https://pretoscop.ro/alerte/confirmare?a=1&amp;t=abc"');
    expect(mail.html).not.toMatch(/<img|<script|src=/i);
    expect(mail.text + mail.html).not.toMatch(CEDILLA);
  });
});

describe('alert digest email', () => {
  it('a single alert: honest content, one-click unsubscribe headers, stop links', () => {
    const mail = alertDigestEmail({
      items: [item()],
      manageUrl: 'https://pretoscop.ro/alerte',
      unsubscribeAllUrl: 'https://pretoscop.ro/alerte/dezabonare?u=u1&t=y',
      oneClickUrl: 'https://pretoscop.ro/api/alerts/unsubscribe?u=u1&t=y',
      operator,
    });
    expect(mail.subject).toBe('Preț mai mic: Telefon mobil Testoscop X1, 128GB, Negru – 1.999,00 lei');
    expect(mail.headers).toEqual({
      'List-Unsubscribe': '<https://pretoscop.ro/api/alerts/unsubscribe?u=u1&t=y>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(mail.text).toContain('Preț total acum: 1.999,00 lei la forIT (1.974,00 lei + 25,00 lei livrare)');
    expect(mail.text).toContain('Sub pragul tău de 2.000,00 lei.');
    expect(mail.text).toContain('Verificat de Pretoscop pe 6 nov. 2026, 12:05 (ora României).');
    expect(mail.text).toContain('Vezi oferta: https://pretoscop.ro/out/55?p=alert');
    expect(mail.text).toContain('Oprește această alertă: https://pretoscop.ro/alerte/dezabonare?a=1&t=x');
    expect(mail.text).toContain('Dezabonare de la toate alertele: https://pretoscop.ro/alerte/dezabonare?u=u1&t=y');
    expect(mail.text).toContain('prețul final este cel afișat de magazin');
    expect(mail.text).not.toContain('afiliate');
    expect(mail.html).not.toMatch(/<img|<script|src=/i);
    expect(mail.text + mail.html).not.toMatch(CEDILLA);
  });

  it('several alerts in one email; affiliate note when any link may be affiliate; simulation marked', () => {
    const mail = alertDigestEmail({
      items: [item(), item({ alertId: 2, productTitle: 'Laptop Y', reason: 'drop', referenceBani: 400_000, referenceKind: 'baseline', totalBani: 360_000, priceBani: 360_000, shippingBani: 0, affiliate: true })],
      manageUrl: 'm',
      unsubscribeAllUrl: 'u',
      oneClickUrl: 'o',
      operator,
      simulated: true,
    });
    expect(mail.subject).toBe('[SIMULARE] 2 alerte de preț: prețuri mai mici la produsele urmărite');
    expect(mail.text.startsWith('SIMULARE:')).toBe(true);
    expect(mail.text).toContain('Cu 10% sub 4.000,00 lei, prețul de la pornirea alertei.');
    expect(mail.text).toContain('3.600,00 lei, livrare gratuită');
    expect(mail.text).toContain('linkuri afiliate');
    expect(mail.html).toContain('SIMULARE');
  });

  it('refuses an empty digest', () => {
    expect(() => alertDigestEmail({ items: [], manageUrl: '', unsubscribeAllUrl: '', oneClickUrl: '', operator })).toThrow();
  });
});

describe('reason lines and formatting', () => {
  it('says why, with the numbers', () => {
    expect(reasonLine({ reason: 'lower_below_target', referenceBani: 199_000, referenceKind: 'last_notified', totalBani: 189_000 })).toBe(
      'A scăzut din nou: cu 5% sub 1.990,00 lei, prețul din alerta anterioară.',
    );
    expect(reasonLine({ reason: 'drop', referenceBani: 100_000, referenceKind: 'last_notified', totalBani: 99_000 })).toBe('Cu 1% sub 1.000,00 lei, prețul din alerta anterioară.');
  });

  it('delivery wording matches the product page', () => {
    expect(deliveryLine(100_000, null)).toBe('1.000,00 lei + livrare de verificat pe site-ul magazinului');
    expect(deliveryLine(100_000, 0)).toBe('1.000,00 lei, livrare gratuită');
    expect(deliveryLine(100_000, 1_999, true)).toBe('1.000,00 lei + 19,99 lei livrare (estimată)');
  });

  it('drop percentages are whole and never round a drop to zero', () => {
    expect(dropPercent(99_500, 100_000)).toBe(1);
    expect(dropPercent(80_000, 100_000)).toBe(20);
    expect(dropPercent(100_000, 100_000)).toBe(0);
  });
});

describe('retention notice', () => {
  it('names the date, the alerts and how to keep the account', () => {
    const mail = retentionNoticeEmail({ keepUrl: 'https://pretoscop.ro/alerte/pastreaza?u=1&t=k', manageUrl: 'https://pretoscop.ro/alerte', deleteOn: new Date('2028-12-06T10:00:00Z'), alertCount: 3, operator });
    expect(mail.subject).toBe('Contul tău Pretoscop va fi șters pe 6 decembrie 2028');
    expect(mail.text).toContain('cele 3 alerte de preț');
    expect(mail.text).toContain('https://pretoscop.ro/alerte/pastreaza?u=1&t=k');
    expect(mail.text + mail.html).not.toMatch(CEDILLA);
  });
});
