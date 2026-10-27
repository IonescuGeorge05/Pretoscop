import type { Logger } from '@pretoscop/config/logger';
import { decideAlert, type AlertQuietReason } from '@pretoscop/core';
import { alertCandidates, claimAlertNotification, isFlagEnabled, rearmAlert, setAlertBaseline, type AlertChannel, type Db } from '@pretoscop/db';

/** Feature flag that must be on for alerts on a channel to be evaluated and delivered. */
export const CHANNEL_FLAGS: Record<AlertChannel, string> = {
  email: 'alerts.email.enabled',
  push: 'alerts.push.enabled',
  telegram: 'alerts.telegram.enabled',
};

export async function enabledChannels(db: Db, available: AlertChannel[] = ['email', 'push', 'telegram']): Promise<AlertChannel[]> {
  const out: AlertChannel[] = [];
  for (const ch of available) if (await isFlagEnabled(db, CHANNEL_FLAGS[ch])) out.push(ch);
  return out;
}

export interface EvaluateResult {
  candidates: number;
  queued: number;
  rearmed: number;
  baselines: number;
  /** Lost the compare-and-set to a concurrent evaluation (or a job delivered twice). */
  raced: number;
  quiet: Partial<Record<AlertQuietReason, number>>;
}

/**
 * `evaluateAlerts(productIds?)` (docs/05 M19 contract): decides every active alert watching the
 * products (all when omitted) against the best eligible offer right now, and queues one
 * notification per alert that fires. Idempotent: the claim is a compare-and-set on the state the
 * decision was made from.
 */
export async function evaluateAlerts(
  db: Db,
  opts: { productIds?: number[] | null; channels: AlertChannel[]; now?: Date; log?: Logger },
): Promise<EvaluateResult> {
  const now = opts.now ?? new Date();
  const out: EvaluateResult = { candidates: 0, queued: 0, rearmed: 0, baselines: 0, raced: 0, quiet: {} };
  if (opts.channels.length === 0) return out;
  const candidates = await alertCandidates(db, { productIds: opts.productIds ?? null, channels: opts.channels });
  out.candidates = candidates.length;
  for (const c of candidates) {
    const decision = decideAlert(
      { kind: c.kind, targetBani: c.targetBani, baselineBani: c.baselineBani, armed: c.armed, lastNotifiedAt: c.lastNotifiedAt, lastNotifiedBani: c.lastNotifiedBani },
      c.best ? { offerId: c.best.offerId, totalBani: c.best.totalBani, crossShopMedianBani: c.best.crossShopMedianBani } : null,
      now,
    );
    switch (decision.action) {
      case 'notify': {
        const id = await claimAlertNotification(db, c, decision.reason, decision.referenceBani);
        if (id === null) out.raced++;
        else out.queued++;
        break;
      }
      case 'rearm':
        if (await rearmAlert(db, c)) out.rearmed++;
        else out.raced++;
        break;
      case 'set_baseline':
        if (await setAlertBaseline(db, c, decision.baselineBani)) out.baselines++;
        break;
      case 'none':
        out.quiet[decision.why] = (out.quiet[decision.why] ?? 0) + 1;
        if (decision.why === 'suspicious') opts.log?.warn({ alert_id: c.alertId, offer_id: c.best?.offerId }, 'alert skipped: price under 30% of the cross-shop median');
        break;
    }
  }
  return out;
}
