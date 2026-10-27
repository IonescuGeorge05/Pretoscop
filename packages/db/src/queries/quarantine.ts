import { agrees, checkAgainstMedian } from '@pretoscop/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { baniToNumeric, numericToBani } from '../money';
import { recordObservation, type OfferObservation, type RecordResult } from './offers';

export interface OfferBaseline {
  offerId: number;
  currentBani: number;
  median14dBani: number | null;
}

/**
 * Current price and 14-day median price (from change events, weighted by event, not by time) of
 * the shop's offers with these external ids, in one query (per page / per batch).
 */
export async function offerBaselines(db: Db, shopId: number, externalIds: string[]): Promise<Map<string, OfferBaseline>> {
  if (externalIds.length === 0) return new Map();
  const res = await db.execute<{ external_id: string; id: string; price: string; median: string | null }>(sql`
    SELECT o.external_id, o.id::text, o.price::text,
      (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY pe.price)::numeric(12,2)::text
       FROM price_events pe WHERE pe.offer_id = o.id AND pe.observed_at > now() - interval '14 days') AS median
    FROM offers o
    WHERE o.shop_id = ${shopId} AND o.external_id = ANY(${sql.param(externalIds)}::text[])
  `);
  const out = new Map<string, OfferBaseline>();
  for (const r of res.rows) {
    out.set(r.external_id, {
      offerId: Number(r.id),
      currentBani: numericToBani(r.price)!,
      // An offer with a single event still has a baseline: its current price.
      median14dBani: numericToBani(r.median) ?? numericToBani(r.price),
    });
  }
  return out;
}

function serialize(o: OfferObservation): string {
  return JSON.stringify(o);
}

function deserialize(text: string): OfferObservation {
  const o = JSON.parse(text) as OfferObservation & { observedAt: string };
  return { ...o, observedAt: new Date(o.observedAt) };
}

export type GuardOutcome =
  | { action: 'recorded'; result: RecordResult; confirmedQuarantine?: number }
  | { action: 'quarantined'; quarantineId: number; reason: string };

/**
 * Records an observation through the anomaly guard (docs/03 §6.4): a price beyond ×3 / ÷3 of the
 * offer's 14-day median is held in `price_events_quarantine`; it is published only when a later
 * observation agrees with it (within 2%), in which case both are recorded in time order. A later
 * observation back at the usual level rejects the held one (it was a glitch).
 */
export async function recordWithGuard(db: Db, o: OfferObservation, baseline: OfferBaseline | undefined): Promise<GuardOutcome> {
  if (!baseline) return { action: 'recorded', result: await recordObservation(db, o) };

  const pending = await db.execute<{ id: string; price: string; observation: string }>(sql`
    SELECT id::text, price::text, observation FROM price_events_quarantine
    WHERE offer_id = ${baseline.offerId} AND status = 'pending' ORDER BY observed_at
  `);
  for (const q of pending.rows) {
    const heldBani = numericToBani(q.price)!;
    if (agrees(heldBani, o.priceBani)) {
      // Two consecutive agreeing observations: publish the held one, then this one.
      await recordObservation(db, deserialize(q.observation));
      await db.execute(sql`UPDATE price_events_quarantine SET status = 'confirmed', resolved_at = now(), resolved_by = 'guard' WHERE id = ${Number(q.id)}`);
      return { action: 'recorded', result: await recordObservation(db, o), confirmedQuarantine: Number(q.id) };
    }
    await db.execute(sql`UPDATE price_events_quarantine SET status = 'rejected', resolved_at = now(), resolved_by = 'guard' WHERE id = ${Number(q.id)}`);
  }

  const check = checkAgainstMedian(o.priceBani, baseline.median14dBani);
  if (check.action === 'accept') return { action: 'recorded', result: await recordObservation(db, o) };

  const ins = await db.execute<{ id: string }>(sql`
    INSERT INTO price_events_quarantine (offer_id, observed_at, price, median_price, ratio, reason, observation, run_id)
    VALUES (${baseline.offerId}, ${o.observedAt}, ${baniToNumeric(o.priceBani)},
      ${baseline.median14dBani === null ? null : baniToNumeric(baseline.median14dBani)}, ${check.ratio}, ${check.reason},
      ${serialize(o)}, ${o.runId})
    RETURNING id::text
  `);
  return { action: 'quarantined', quarantineId: Number(ins.rows[0]!.id), reason: check.reason };
}

/** Admin release (M09): publishes a held observation as observed. */
export async function releaseQuarantine(db: Db, quarantineId: number, actor: string): Promise<RecordResult | null> {
  const q = await db.execute<{ observation: string; status: string }>(sql`
    SELECT observation, status FROM price_events_quarantine WHERE id = ${quarantineId}
  `);
  const row = q.rows[0];
  if (!row || row.status !== 'pending') return null;
  const result = await recordObservation(db, deserialize(row.observation));
  await db.execute(sql`UPDATE price_events_quarantine SET status = 'released', resolved_at = now(), resolved_by = ${actor} WHERE id = ${quarantineId}`);
  return result;
}
