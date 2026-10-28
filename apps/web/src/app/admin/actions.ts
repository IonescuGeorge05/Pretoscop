'use server';

import { auditLog, eq, featureFlags, releaseQuarantine, shopSources, shops, sql } from '@pretoscop/db';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { boss } from '@/lib/jobs';

async function audit(actor: string, action: string, entity: string, entityId: string | number | null, before: unknown, after: unknown) {
  await db().insert(auditLog).values({ actor, action, entity, entityId: entityId === null ? null : String(entityId), before: before ?? null, after: after ?? null });
}

function intField(form: FormData, key: string): number {
  const n = Number(form.get(key));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`invalid ${key}`);
  return n;
}

/** Kill switch on/off for one source (runtime switch; `shops:sync` never turns it off). */
export async function setKillSwitch(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = intField(form, 'sourceId');
  const on = form.get('on') === '1';
  const [before] = await db().select({ killSwitch: shopSources.killSwitch, key: shopSources.key }).from(shopSources).where(eq(shopSources.id, id));
  if (!before) return;
  await db().update(shopSources).set({ killSwitch: on, updatedAt: new Date() }).where(eq(shopSources.id, id));
  await audit(admin.actor, on ? 'source.kill' : 'source.unkill', 'shop_sources', id, before, { killSwitch: on });
  revalidatePath('/admin', 'layout');
}

/** Stops or resumes every source of a shop at once (all kill switches). */
export async function setShopKill(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const shopId = intField(form, 'shopId');
  const on = form.get('on') === '1';
  const res = await db().update(shopSources).set({ killSwitch: on, updatedAt: new Date() }).where(eq(shopSources.shopId, shopId)).returning({ id: shopSources.id });
  await audit(admin.actor, on ? 'shop.kill_all' : 'shop.unkill_all', 'shops', shopId, null, { killSwitch: on, sources: res.map((r) => r.id) });
  revalidatePath('/admin', 'layout');
}

/** "Run now": queues a manual run; all gates still apply in the worker. */
export async function runSourceNow(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = intField(form, 'sourceId');
  const [src] = await db()
    .select({ key: shopSources.key, slug: shops.slug })
    .from(shopSources)
    .innerJoin(shops, eq(shops.id, shopSources.shopId))
    .where(eq(shopSources.id, id));
  if (!src) return;
  const b = await boss();
  const jobId = await b.send('source.run', { sourceId: id, trigger: 'manual' }, { singletonKey: src.key, group: { id: src.slug } });
  await audit(admin.actor, 'source.run_now', 'shop_sources', id, null, { jobId });
  revalidatePath('/admin/surse');
}

export async function setFlagAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const key = String(form.get('key') ?? '');
  if (!/^[a-z0-9_.-]{3,80}$/.test(key)) throw new Error('invalid flag key');
  const enabled = form.get('enabled') === '1';
  const [before] = await db().select().from(featureFlags).where(eq(featureFlags.key, key));
  await db()
    .insert(featureFlags)
    .values({ key, enabled })
    .onConflictDoUpdate({ target: featureFlags.key, set: { enabled, updatedAt: new Date() } });
  await audit(admin.actor, 'flag.set', 'feature_flags', key, before ?? null, { enabled });
  // Every admin page that shows a flag (Flaguri, Acces asistat) is re-rendered.
  revalidatePath('/admin', 'layout');
}

export async function releaseQuarantineAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = intField(form, 'id');
  const r = await releaseQuarantine(db(), id, admin.actor);
  await audit(admin.actor, 'quarantine.release', 'price_events_quarantine', id, null, { recorded: r !== null });
  revalidatePath('/admin/carantina');
}

export async function rejectQuarantineAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = intField(form, 'id');
  await db().execute(sql`UPDATE price_events_quarantine SET status = 'rejected', resolved_at = now(), resolved_by = ${admin.actor} WHERE id = ${id} AND status = 'pending'`);
  await audit(admin.actor, 'quarantine.reject', 'price_events_quarantine', id, null, null);
  revalidatePath('/admin/carantina');
}
