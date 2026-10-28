'use server';

import { approveMerchant, auditLog, eq, MerchantActionError, merchants, reinstateMerchant, rejectMerchant, shopSources, shops, sql, suspendMerchant } from '@pretoscop/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { enqueueCheck, runSourceNow } from '@/lib/merchant';
import { REASON_CATEGORIES } from '@/lib/merchant-hints';
import { mailApproved, mailReinstated, mailRejected, mailSuspended } from '@/lib/merchant-mail';


function id(form: FormData): number {
  const n = Number(form.get('merchantId'));
  if (!Number.isInteger(n) || n <= 0) throw new Error('invalid merchantId');
  return n;
}

function back(merchantId: number, params: Record<string, string>): never {
  redirect(`/admin/comercianti/${merchantId}?${new URLSearchParams(params).toString()}`);
}

async function load(merchantId: number) {
  const [m] = await db().select().from(merchants).where(eq(merchants.id, merchantId));
  if (!m) throw new Error(`merchant ${merchantId} not found`);
  return m;
}

function statement(form: FormData): string | null {
  const cat = String(form.get('category') ?? '') as keyof typeof REASON_CATEGORIES;
  const facts = String(form.get('facts') ?? '').trim().slice(0, 2000);
  if (!(cat in REASON_CATEGORIES) || facts.length < 15) return null;
  return `${REASON_CATEGORIES[cat]} ${facts}`;
}

async function runMerchantSource(merchantId: number): Promise<void> {
  const [src] = await db()
    .select({ id: shopSources.id, key: shopSources.key, slug: shops.slug })
    .from(shopSources)
    .innerJoin(shops, eq(shops.id, shopSources.shopId))
    .where(sql`${shopSources.config}->>'origin' = 'merchant' AND (${shopSources.config}->>'merchantId')::bigint = ${merchantId}`);
  if (src) await runSourceNow(src.id, src.key, src.slug);
}

export async function approveMerchantAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const merchantId = id(form);
  try {
    await approveMerchant(db(), merchantId, admin.actor);
  } catch (err) {
    if (err instanceof MerchantActionError) back(merchantId, { eroare: err.code, mesaj: err.message });
    throw err;
  }
  await runMerchantSource(merchantId);
  await mailApproved(await load(merchantId));
  revalidatePath('/admin/comercianti');
  back(merchantId, { ok: 'aprobat' });
}

export async function rejectMerchantAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const merchantId = id(form);
  const reason = statement(form);
  if (!reason) back(merchantId, { eroare: 'motiv' });
  try {
    await rejectMerchant(db(), merchantId, reason, admin.actor);
  } catch (err) {
    if (err instanceof MerchantActionError) back(merchantId, { eroare: err.code, mesaj: err.message });
    throw err;
  }
  await mailRejected(await load(merchantId), reason);
  revalidatePath('/admin/comercianti');
  back(merchantId, { ok: 'respins' });
}

export async function suspendMerchantAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const merchantId = id(form);
  const reason = statement(form);
  if (!reason) back(merchantId, { eroare: 'motiv' });
  try {
    await suspendMerchant(db(), merchantId, reason, admin.actor);
  } catch (err) {
    if (err instanceof MerchantActionError) back(merchantId, { eroare: err.code, mesaj: err.message });
    throw err;
  }
  await mailSuspended(await load(merchantId), reason);
  revalidatePath('/admin/comercianti');
  back(merchantId, { ok: 'suspendat' });
}

export async function reinstateMerchantAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const merchantId = id(form);
  try {
    await reinstateMerchant(db(), merchantId, admin.actor);
  } catch (err) {
    if (err instanceof MerchantActionError) back(merchantId, { eroare: err.code, mesaj: err.message });
    throw err;
  }
  await runMerchantSource(merchantId);
  await mailReinstated(await load(merchantId));
  revalidatePath('/admin/comercianti');
  back(merchantId, { ok: 'reluat' });
}

/** Domain proven out of band (phone call, signed letter, email from a known address): recorded with a note. */
export async function verifyDomainManually(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const merchantId = id(form);
  const note = String(form.get('note') ?? '').trim().slice(0, 500);
  if (note.length < 10) back(merchantId, { eroare: 'nota' });
  const m = await load(merchantId);
  await db().update(merchants).set({ domainVerifiedAt: new Date(), verificationMethod: 'admin' }).where(eq(merchants.id, merchantId));
  await db().insert(auditLog).values({ actor: admin.actor, action: 'merchant.domain_manual', entity: 'merchants', entityId: String(merchantId), before: { domainVerifiedAt: m.domainVerifiedAt }, after: { domain: m.domain, note } });
  back(merchantId, { ok: 'domeniu' });
}

export async function recheckMerchantFeed(form: FormData): Promise<void> {
  await requireAdmin();
  const merchantId = id(form);
  await enqueueCheck('validate', merchantId);
  back(merchantId, { ok: 'verificare' });
}

export async function runMerchantFeedNow(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const merchantId = id(form);
  await runMerchantSource(merchantId);
  await db().insert(auditLog).values({ actor: admin.actor, action: 'merchant.run_now', entity: 'merchants', entityId: String(merchantId), before: null, after: null });
  back(merchantId, { ok: 'rulare' });
}
