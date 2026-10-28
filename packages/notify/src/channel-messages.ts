import { reasonLine, type AlertItem } from './email';
import { deliveryLine, formatDateTime, formatLongDate, lei, shorten } from './format';
import type { PushPayload } from './push';
import { tgEscape, type InlineButton } from './telegram';

/**
 * Short forms of an alert for Telegram (HTML parse mode, inline buttons) and Web Push (title,
 * body, click URL), with the same facts as the email: total, shop, delivery, the reason with its
 * numbers, the time of Pretoscop's last check, a click-out through /out (M27).
 */

const TELEGRAM_MAX = 3800; // under Telegram's 4096-character limit, room for the footer

export function telegramAlertMessage(items: AlertItem[], opts: { manageUrl: string; simulated?: boolean }): { text: string; buttons: InlineButton[][] } {
  if (items.length === 0) throw new Error('telegramAlertMessage: no items');
  const blocks = items.slice(0, 10).map((x) =>
    [
      `<b>${tgEscape(shorten(x.productTitle, 90))}</b>`,
      `${tgEscape(lei(x.totalBani))} la ${tgEscape(x.shopName)} (${tgEscape(deliveryLine(x.priceBani, x.shippingBani, x.shippingEstimated))})`,
      tgEscape(reasonLine(x)),
      `Verificat pe ${tgEscape(formatDateTime(x.checkedAt))}. <a href="${tgEscape(x.outUrl)}">Vezi oferta</a> · <a href="${tgEscape(x.productUrl)}">Istoric</a>`,
    ].join('\n'),
  );
  const head = `${opts.simulated ? '[SIMULARE] ' : ''}${items.length === 1 ? 'Preț mai mic' : `${items.length} prețuri mai mici`}`;
  const affiliate = items.some((x) => x.affiliate) ? '\nUnele linkuri pot fi afiliate (comision fără cost pentru tine).' : '';
  let text = `<b>${head}</b>\n\n${blocks.join('\n\n')}\n\n<i>Prețul final este cel afișat de magazin.${affiliate}</i>\nOprești alertele cu /oprire.`;
  if (text.length > TELEGRAM_MAX) text = `${text.slice(0, TELEGRAM_MAX)}…`;
  const first = items[0]!;
  const buttons: InlineButton[][] =
    items.length === 1
      ? [[{ text: `Vezi oferta la ${shorten(first.shopName, 30)}`, url: first.outUrl }], [{ text: 'Oprește alerta', callback_data: `d:${first.alertId}` }]]
      : [[{ text: 'Alertele mele', url: opts.manageUrl }]];
  return { text, buttons };
}

export function pushAlertPayload(items: AlertItem[], opts: { manageUrl: string; simulated?: boolean }): PushPayload {
  if (items.length === 0) throw new Error('pushAlertPayload: no items');
  const prefix = opts.simulated ? '[SIMULARE] ' : '';
  if (items.length === 1) {
    const x = items[0]!;
    return {
      title: `${prefix}Preț mai mic: ${shorten(x.productTitle, 50)}`,
      body: `${lei(x.totalBani)} la ${x.shopName}. ${reasonLine(x)} Verificat pe ${formatDateTime(x.checkedAt)}.`,
      url: x.productUrl,
      tag: `alerta-${x.alertId}`,
    };
  }
  return {
    title: `${prefix}${items.length} alerte de preț`,
    body: items.map((x) => `${shorten(x.productTitle, 40)}: ${lei(x.totalBani)}`).join('\n'),
    url: opts.manageUrl,
    tag: 'alerte',
  };
}

/** A verified drop for the daily channel post: today's total under our own 30-day minimum. */
export interface VerifiedDrop {
  productTitle: string;
  productUrl: string;
  totalBani: number;
  shopName: string;
  /** Lowest daily total we observed in the 30 days before today. */
  min30Bani: number;
  /** Whole percent under `min30Bani`. */
  dropPct: number;
}

/** The daily "verified drops" post (Telegram channel). Links go to Pretoscop's own product pages. */
export function dealsPostText(drops: VerifiedDrop[], opts: { date: Date; dealsUrl: string }): string {
  const lines = drops
    .slice(0, 10)
    .map(
      (d, i) =>
        `${i + 1}. <a href="${tgEscape(d.productUrl)}">${tgEscape(shorten(d.productTitle, 80))}</a>\n   ${tgEscape(lei(d.totalBani))} la ${tgEscape(d.shopName)} · cu ${d.dropPct}% sub minimul din 30 de zile (${tgEscape(lei(d.min30Bani))})`,
    );
  return [
    `<b>Reduceri verificate de Pretoscop</b> · ${tgEscape(formatLongDate(opts.date))}`,
    'Prețuri totale (preț + livrare) mai mici decât cel mai mic preț observat de noi în ultimele 30 de zile:',
    '',
    lines.join('\n\n'),
    '',
    `<i>Prețurile se pot schimba oricând; prețul final este cel de pe site-ul magazinului.</i> <a href="${tgEscape(opts.dealsUrl)}">Toate reducerile</a>`,
  ].join('\n');
}
