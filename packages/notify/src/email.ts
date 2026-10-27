import type { AlertKind } from '@pretoscop/core';
import { deliveryLine, dropPercent, esc, formatDateTime, formatLongDate, lei, shorten } from './format';

/**
 * Romanian email templates for alerts (M19). Every message has a plain-text part and a simple
 * HTML part with inline styles: no images, no remote resources, no open or click tracking
 * (EDPB 2/2023). Sender identity and postal address close every message (Law 506/2004 art. 12).
 */

export interface Operator {
  /** COMPANY_LEGAL_NAME */
  name: string;
  /** COMPANY_POSTAL_ADDRESS */
  address: string;
  /** PUBLIC_BASE_URL */
  website: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

const BRAND = '#1d7a73';
const INK_SOFT = '#334155';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

function button(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">${esc(label)}</a>`;
}

function link(href: string, label: string, color = BRAND): string {
  return `<a href="${esc(href)}" style="color:${color}">${esc(label)}</a>`;
}

function layout(title: string, body: string, footer: string): string {
  return [
    '<!doctype html>',
    '<html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${esc(title)}</title></head>`,
    `<body style="margin:0;padding:0;background:#f8fafc">`,
    `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;font-size:15px;line-height:1.5">`,
    `<p style="margin:0 0 16px;font-weight:700;font-size:18px;color:${BRAND}">Pretoscop</p>`,
    `<div style="background:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:20px">${body}</div>`,
    `<div style="color:${MUTED};font-size:12px;line-height:1.5;margin-top:16px">${footer}</div>`,
    '</div></body></html>',
  ].join('');
}

function signature(o: Operator): { text: string; html: string } {
  return {
    text: `— ${o.name}, ${o.address}\n${o.website}`,
    html: `<p style="margin:12px 0 0">${esc(o.name)}, ${esc(o.address)} · ${link(o.website, o.website.replace(/^https?:\/\//, ''), MUTED)}</p>`,
  };
}

function watchLine(kind: AlertKind, targetBani: number | null, anyVariant: boolean): string {
  const what =
    kind === 'below' && targetBani !== null
      ? `Te anunțăm când prețul total (preț + livrare) ajunge la ${lei(targetBani)} sau mai jos.`
      : 'Te anunțăm când prețul total (preț + livrare) scade cu cel puțin 1% față de prețul de acum.';
  return anyVariant ? `${what} Urmărim toate variantele modelului (culoare, memorie).` : what;
}

export interface ConfirmationEmailInput {
  productTitle: string;
  kind: AlertKind;
  targetBani: number | null;
  anyVariant: boolean;
  confirmUrl: string;
  /** The exact consent text the person ticked and its stored key (e.g. `alertConsent.v1`). */
  consent: { text: string; key: string };
  requestedAt: Date;
  expiresDays: number;
  operator: Operator;
}

/** Double opt-in: the link that turns a pending alert on. */
export function confirmationEmail(i: ConfirmationEmailInput): RenderedEmail {
  const subject = `Confirmă alerta de preț pentru ${shorten(i.productTitle, 70)}`;
  const watch = watchLine(i.kind, i.targetBani, i.anyVariant);
  const when = formatDateTime(i.requestedAt);
  const sig = signature(i.operator);
  const text = [
    'Bună,',
    '',
    'Ai cerut pe Pretoscop o alertă de preț pentru:',
    i.productTitle,
    watch,
    '',
    `Ca să pornim alerta, confirmă abonarea (linkul este valabil ${i.expiresDays} zile):`,
    i.confirmUrl,
    '',
    `Pe ${when} (ora României) ai bifat acest text (${i.consent.key}):`,
    `„${i.consent.text}”`,
    '',
    `Dacă nu ai cerut tu această alertă, ignoră emailul: nu pornim nimic, nu îți mai scriem despre ea și ștergem cererea în ${i.expiresDays} zile.`,
    '',
    sig.text,
  ].join('\n');
  const html = layout(
    subject,
    [
      '<p style="margin:0">Bună,</p>',
      `<p style="margin:12px 0 0">Ai cerut pe Pretoscop o alertă de preț pentru:</p>`,
      `<p style="margin:8px 0 0;font-weight:600">${esc(i.productTitle)}</p>`,
      `<p style="margin:8px 0 0;color:${INK_SOFT}">${esc(watch)}</p>`,
      `<p style="margin:20px 0 0">${button(i.confirmUrl, 'Confirm alerta')}</p>`,
      `<p style="margin:12px 0 0;font-size:13px;color:${INK_SOFT}">Linkul este valabil ${i.expiresDays} zile. Dacă butonul nu merge, copiază adresa în browser:<br>${link(i.confirmUrl, i.confirmUrl)}</p>`,
      `<p style="margin:16px 0 0;font-size:13px;color:${INK_SOFT}">Pe ${esc(when)} (ora României) ai bifat acest text (${esc(i.consent.key)}):<br>„${esc(i.consent.text)}”</p>`,
    ].join(''),
    `<p style="margin:0">Dacă nu ai cerut tu această alertă, ignoră emailul: nu pornim nimic, nu îți mai scriem despre ea și ștergem cererea în ${i.expiresDays} zile.</p>${sig.html}`,
  );
  return { subject, text, html };
}

export type AlertReason = 'below_target' | 'lower_below_target' | 'drop';
export type ReferenceKind = 'target' | 'baseline' | 'last_notified';

export interface AlertItem {
  alertId: number;
  productTitle: string;
  productUrl: string;
  outUrl: string;
  shopName: string;
  totalBani: number;
  priceBani: number;
  shippingBani: number | null;
  shippingEstimated: boolean;
  /** When Pretoscop last checked the offer (shown, never hidden). */
  checkedAt: Date;
  reason: AlertReason;
  referenceBani: number | null;
  referenceKind: ReferenceKind;
  anyVariant: boolean;
  unsubscribeUrl: string;
  /** The click-out may use an affiliate link: say so. */
  affiliate: boolean;
}

/** One sentence that says why this message exists, with the numbers it rests on. */
export function reasonLine(item: Pick<AlertItem, 'reason' | 'referenceBani' | 'referenceKind' | 'totalBani'>): string {
  const ref = item.referenceBani;
  if (ref === null) return 'Preț mai mic decât la ultima verificare.';
  if (item.reason === 'below_target') return `Sub pragul tău de ${lei(ref)}.`;
  const pct = dropPercent(item.totalBani, ref);
  if (item.reason === 'lower_below_target') return `A scăzut din nou: cu ${pct}% sub ${lei(ref)}, prețul din alerta anterioară.`;
  return item.referenceKind === 'baseline'
    ? `Cu ${pct}% sub ${lei(ref)}, prețul de la pornirea alertei.`
    : `Cu ${pct}% sub ${lei(ref)}, prețul din alerta anterioară.`;
}

export interface AlertDigestInput {
  items: AlertItem[];
  manageUrl: string;
  unsubscribeAllUrl: string;
  /** RFC 8058 one-click URL (List-Unsubscribe + List-Unsubscribe-Post). */
  oneClickUrl: string;
  operator: Operator;
  /** `pnpm alerts:simulate`: clearly marked, never a real offer. */
  simulated?: boolean;
}

const DISCLAIMER = 'Prețurile și disponibilitatea sunt preluate automat de pe site-urile magazinelor și se pot schimba oricând; prețul final este cel afișat de magazin la plasarea comenzii.';
const AFFILIATE_NOTE = 'Unele linkuri sunt linkuri afiliate: Pretoscop poate primi un comision, fără cost pentru tine. Comisionul nu influențează alertele.';
const SIMULATION_NOTE = 'SIMULARE: email de test trimis de echipa Pretoscop. Prețul de mai jos este simulat, nu o ofertă reală. Linkurile de dezabonare funcționează normal.';

/** One email per user per evaluation: every alert that fired, each with its own stop link. */
export function alertDigestEmail(i: AlertDigestInput): RenderedEmail {
  if (i.items.length === 0) throw new Error('alertDigestEmail: no items');
  const first = i.items[0]!;
  const base = i.items.length === 1 ? `Preț mai mic: ${shorten(first.productTitle, 60)} – ${lei(first.totalBani)}` : `${i.items.length} alerte de preț: prețuri mai mici la produsele urmărite`;
  const subject = i.simulated ? `[SIMULARE] ${base}` : base;
  const affiliate = i.items.some((x) => x.affiliate);
  const sig = signature(i.operator);

  const textItems = i.items.map((x) =>
    [
      x.productTitle,
      `Preț total acum: ${lei(x.totalBani)} la ${x.shopName} (${deliveryLine(x.priceBani, x.shippingBani, x.shippingEstimated)})`,
      reasonLine(x),
      `Verificat de Pretoscop pe ${formatDateTime(x.checkedAt)} (ora României).`,
      ...(x.anyVariant ? ['Alertă pentru orice variantă a modelului.'] : []),
      `Vezi oferta: ${x.outUrl}`,
      `Istoricul prețului: ${x.productUrl}`,
      `Oprește această alertă: ${x.unsubscribeUrl}`,
    ].join('\n'),
  );
  const text = [
    ...(i.simulated ? [SIMULATION_NOTE, ''] : []),
    i.items.length === 1 ? 'Prețul unui produs pe care îl urmărești a scăzut:' : 'Prețurile unor produse pe care le urmărești au scăzut:',
    '',
    textItems.join('\n\n'),
    '',
    DISCLAIMER,
    ...(affiliate ? [AFFILIATE_NOTE] : []),
    '',
    'Primești acest email pentru că ai cerut și ai confirmat o alertă de preț pe Pretoscop.',
    `Gestionează alertele: ${i.manageUrl}`,
    `Dezabonare de la toate alertele: ${i.unsubscribeAllUrl}`,
    '',
    sig.text,
  ].join('\n');

  const htmlItems = i.items
    .map((x) =>
      [
        `<div style="border-top:1px solid ${LINE};padding:16px 0 4px">`,
        `<p style="margin:0;font-weight:600">${esc(x.productTitle)}</p>`,
        `<p style="margin:6px 0 0;font-size:22px;font-weight:700">${esc(lei(x.totalBani))} <span style="font-size:14px;font-weight:400;color:${INK_SOFT}">la ${esc(x.shopName)}</span></p>`,
        `<p style="margin:2px 0 0;font-size:13px;color:${INK_SOFT}">${esc(deliveryLine(x.priceBani, x.shippingBani, x.shippingEstimated))}</p>`,
        `<p style="margin:8px 0 0;font-size:14px;color:#15803d">${esc(reasonLine(x))}</p>`,
        `<p style="margin:4px 0 0;font-size:12px;color:${MUTED}">Verificat de Pretoscop pe ${esc(formatDateTime(x.checkedAt))} (ora României).${x.anyVariant ? ' Alertă pentru orice variantă a modelului.' : ''}</p>`,
        `<p style="margin:12px 0 0">${button(x.outUrl, `Vezi oferta la ${x.shopName}`)} &nbsp; ${link(x.productUrl, 'Istoricul prețului')}</p>`,
        `<p style="margin:10px 0 0;font-size:12px">${link(x.unsubscribeUrl, 'Oprește această alertă', MUTED)}</p>`,
        '</div>',
      ].join(''),
    )
    .join('');
  const html = layout(
    subject,
    [
      ...(i.simulated ? [`<p style="margin:0 0 12px;padding:8px 12px;background:#fffbeb;border-radius:8px;color:#92400e;font-size:13px">${esc(SIMULATION_NOTE)}</p>`] : []),
      `<p style="margin:0 0 12px">${i.items.length === 1 ? 'Prețul unui produs pe care îl urmărești a scăzut:' : 'Prețurile unor produse pe care le urmărești au scăzut:'}</p>`,
      htmlItems,
      `<p style="margin:12px 0 0;font-size:12px;color:${MUTED}">${esc(DISCLAIMER)}${affiliate ? ` ${esc(AFFILIATE_NOTE)}` : ''}</p>`,
    ].join(''),
    [
      '<p style="margin:0">Primești acest email pentru că ai cerut și ai confirmat o alertă de preț pe Pretoscop.</p>',
      `<p style="margin:6px 0 0">${link(i.manageUrl, 'Gestionează alertele', MUTED)} · ${link(i.unsubscribeAllUrl, 'Dezabonare de la toate alertele', MUTED)}</p>`,
      sig.html,
    ].join(''),
  );
  return {
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${i.oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

export interface RetentionNoticeInput {
  keepUrl: string;
  manageUrl: string;
  deleteOn: Date;
  alertCount: number;
  operator: Operator;
}

/** 24 months without activity: a notice 30 days before the account and its alerts are deleted. */
export function retentionNoticeEmail(i: RetentionNoticeInput): RenderedEmail {
  const date = formatLongDate(i.deleteOn);
  const subject = `Contul tău Pretoscop va fi șters pe ${date}`;
  const alertsText = i.alertCount === 1 ? 'alerta de preț' : i.alertCount > 1 ? `cele ${i.alertCount} alerte de preț` : 'datele asociate';
  const sig = signature(i.operator);
  const text = [
    'Bună,',
    '',
    `Nu ai mai folosit contul Pretoscop în ultimele 24 de luni. Cum am promis în politica de confidențialitate, ștergem contul și ${alertsText} pe ${date}.`,
    '',
    `Dacă vrei să le păstrezi, apasă linkul: ${i.keepUrl}`,
    `Le poți vedea și gestiona aici: ${i.manageUrl}`,
    '',
    'Dacă nu faci nimic, ștergem contul. Nu trebuie să ne răspunzi.',
    '',
    sig.text,
  ].join('\n');
  const html = layout(
    subject,
    [
      '<p style="margin:0">Bună,</p>',
      `<p style="margin:12px 0 0">Nu ai mai folosit contul Pretoscop în ultimele 24 de luni. Cum am promis în politica de confidențialitate, ștergem contul și ${esc(alertsText)} pe <strong>${esc(date)}</strong>.</p>`,
      `<p style="margin:20px 0 0">${button(i.keepUrl, 'Păstrează contul')}</p>`,
      `<p style="margin:12px 0 0;font-size:13px;color:${INK_SOFT}">${link(i.manageUrl, 'Vezi alertele')} · Dacă nu faci nimic, ștergem contul. Nu trebuie să ne răspunzi.</p>`,
    ].join(''),
    sig.html,
  );
  return { subject, text, html };
}
