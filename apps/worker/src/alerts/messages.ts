import { lei, reasonLine, shorten, alertDigestEmail, type AlertItem, type AlertLinks, type AlertReason, type Operator, type ReferenceKind } from '@pretoscop/notify';
import type { QueuedSend } from '@pretoscop/db';
import type { NotifyMessage } from './notifier';

function referenceKind(s: QueuedSend): ReferenceKind {
  if (s.simulated) return 'current';
  if (s.reason === 'below_target') return 'target';
  if (s.reason === 'lower_below_target') return 'last_notified';
  return s.firstNotification ? 'baseline' : 'last_notified';
}

export function alertItem(s: QueuedSend, links: AlertLinks): AlertItem {
  const reason: AlertReason = s.reason === 'below_target' || s.reason === 'lower_below_target' ? s.reason : 'drop';
  return {
    alertId: s.alertId,
    productTitle: s.productTitle,
    productUrl: links.product(s.productSlug),
    outUrl: links.out(s.offerId),
    shopName: s.shopName,
    totalBani: s.totalBani,
    priceBani: s.priceBani,
    shippingBani: s.shippingBani,
    shippingEstimated: s.shippingEstimated,
    checkedAt: s.checkedAt,
    reason,
    referenceBani: s.referenceBani,
    referenceKind: referenceKind(s),
    anyVariant: s.anyVariant,
    unsubscribeUrl: links.unsubscribeAlert(s.alertId),
    affiliate: s.affiliate,
  };
}

/** One message for a user's batch of sends on one channel: the full email and the short form. */
export function buildAlertMessage(sends: QueuedSend[], links: AlertLinks, operator: Operator): NotifyMessage {
  const userId = sends[0]!.userId;
  const items = sends.map((s) => alertItem(s, links));
  const simulated = sends.some((s) => s.simulated);
  const email = alertDigestEmail({
    items,
    manageUrl: links.manage(),
    unsubscribeAllUrl: links.unsubscribeAll(userId),
    oneClickUrl: links.oneClick(userId),
    operator,
    simulated,
  });
  const first = items[0]!;
  const prefix = simulated ? '[SIMULARE] ' : '';
  if (items.length === 1) {
    return {
      email,
      title: `${prefix}Preț mai mic: ${shorten(first.productTitle, 60)}`,
      body: `${lei(first.totalBani)} la ${first.shopName}. ${reasonLine(first)}`,
      url: first.productUrl,
    };
  }
  return {
    email,
    title: `${prefix}${items.length} alerte de preț`,
    body: items.map((x) => `${shorten(x.productTitle, 40)}: ${lei(x.totalBani)}`).join('\n'),
    url: links.manage(),
  };
}
