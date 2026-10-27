'use server';

import { normalizeGtin } from '@pretoscop/core';
import {
  addGtin,
  auditLog,
  decideManually,
  markOffer,
  mergeProducts,
  removeGtin,
  searchProducts,
  setOfferBlacklisted,
  setProductStatus,
  splitProduct,
  sql,
  undoMerge,
  unlinkOffer,
  updateProduct,
  type ProductRow,
} from '@pretoscop/db';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { boss } from '@/lib/jobs';

// Catalogue actions of the admin (M09): review queue, products, offers. Every mutation is audited
// and refreshes what visitors see: rollups/stats through `rollup.touch`, cached pages by tag.

async function audit(actor: string, action: string, entity: string, entityId: string | number | null, before: unknown, after: unknown) {
  await db().insert(auditLog).values({ actor, action, entity, entityId: entityId === null ? null : String(entityId), before: before ?? null, after: after ?? null });
}

function int(form: FormData, key: string): number {
  const n = Number(form.get(key));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`invalid ${key}`);
  return n;
}

async function productOfOffer(offerId: number): Promise<number | null> {
  const r = await db().execute<{ p: string | null }>(sql`SELECT product_id::text AS p FROM offers WHERE id = ${offerId}`);
  return r.rows[0]?.p ? Number(r.rows[0].p) : null;
}

/** Recomputes rollups/stats for the products and expires their cached pages. */
async function touch(ids: Array<number | null | undefined>): Promise<void> {
  const productIds = [...new Set(ids.filter((x): x is number => typeof x === 'number' && x > 0))];
  if (productIds.length === 0) return;
  for (const id of productIds) revalidateTag(`product:${id}`, { expire: 0 });
  try {
    await (await boss()).send('rollup.touch', { productIds });
  } catch {
    // The nightly rollup catches up if the queue is unavailable.
  }
}

/** Review queue decision: accept a candidate, reject, new product, or mark the offer bundle/accessory. */
export async function reviewDecideAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const offerId = int(form, 'offerId');
  const kind = String(form.get('kind'));
  const before = await productOfOffer(offerId);
  let after: number | null = null;
  if (kind === 'accept') after = await decideManually(db(), offerId, { kind: 'accept', productId: int(form, 'productId') }, admin.actor);
  else if (kind === 'new_product') after = await decideManually(db(), offerId, { kind: 'new_product' }, admin.actor);
  else if (kind === 'reject') await decideManually(db(), offerId, { kind: 'reject' }, admin.actor);
  else if (kind === 'bundle' || kind === 'accessory') await markOffer(db(), offerId, kind, admin.actor);
  else throw new Error('invalid kind');
  await audit(admin.actor, `review.${kind}`, 'offers', offerId, { productId: before }, { productId: after });
  await touch([before, after]);
  revalidatePath('/admin/potriviri');
}

/** Weekly precision audit of automatic matches: "correct" locks the match as human-verified, "wrong" unlinks it. */
export async function auditMatchAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const offerId = int(form, 'offerId');
  const productId = int(form, 'productId');
  const correct = form.get('verdict') === 'correct';
  if (correct) await decideManually(db(), offerId, { kind: 'accept', productId }, admin.actor);
  else await unlinkOffer(db(), offerId, admin.actor);
  await audit(admin.actor, correct ? 'match.audit_correct' : 'match.audit_wrong', 'offers', offerId, { productId }, { productId: correct ? productId : null });
  if (!correct) await touch([productId]);
  revalidatePath('/admin/potriviri');
}

export async function searchProductsAction(q: string): Promise<ProductRow[]> {
  await requireAdmin();
  return searchProducts(db(), q.slice(0, 120), 12);
}

export async function updateProductAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = int(form, 'id');
  const category = String(form.get('category') ?? '');
  const res = await updateProduct(db(), id, {
    title: String(form.get('title') ?? ''),
    brand: String(form.get('brand') ?? ''),
    categorySlug: category || null,
    provisional: form.get('provisional') === 'on',
  });
  if (res) await audit(admin.actor, 'product.edit', 'products', id, res.before, res.after);
  await touch([id]);
  revalidatePath(`/admin/produse/${id}`);
}

export async function setProductStatusAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = int(form, 'id');
  const status = form.get('status') === 'hidden' ? 'hidden' : 'active';
  const before = await setProductStatus(db(), id, status);
  await audit(admin.actor, status === 'hidden' ? 'product.hide' : 'product.unhide', 'products', id, { status: before }, { status });
  await touch([id]);
  revalidatePath(`/admin/produse/${id}`);
}

export async function addGtinAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = int(form, 'id');
  const gtin = normalizeGtin(String(form.get('gtin') ?? ''));
  if (!gtin) throw new Error('GTIN invalid (cifră de control greșită sau interval rezervat)');
  const res = await addGtin(db(), id, gtin);
  if (res === 'taken') throw new Error('GTIN-ul aparține altui produs: folosește îmbinarea');
  await audit(admin.actor, 'product.gtin_add', 'products', id, null, { gtin14: gtin, result: res });
  revalidatePath(`/admin/produse/${id}`);
}

export async function removeGtinAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = int(form, 'id');
  const gtin = String(form.get('gtin14') ?? '');
  if (await removeGtin(db(), id, gtin)) await audit(admin.actor, 'product.gtin_remove', 'products', id, { gtin14: gtin }, null);
  revalidatePath(`/admin/produse/${id}`);
}

/** Merge `id` into `intoId`: offers move, history stays with the offers, the old URL redirects. */
export async function mergeProductAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = int(form, 'id');
  const intoId = int(form, 'intoId');
  if (id === intoId) throw new Error('un produs nu poate fi îmbinat cu el însuși');
  const target = await db().execute<{ status: string }>(sql`SELECT status FROM products WHERE id = ${intoId}`);
  if (target.rows[0]?.status !== 'active') throw new Error('produsul țintă nu există sau nu este activ');
  const moved = await mergeProducts(db(), id, intoId, admin.actor);
  await audit(admin.actor, 'product.merge', 'products', id, { status: 'active' }, { mergedInto: intoId, movedOffers: moved });
  await touch([id, intoId]);
  revalidatePath('/admin/produse', 'layout');
  redirect(`/admin/produse/${intoId}`);
}

export async function undoMergeAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = int(form, 'id');
  const r = await db().execute<{ into: string | null }>(sql`SELECT merged_into_id::text AS into FROM products WHERE id = ${id}`);
  await undoMerge(db(), id, admin.actor); // writes its own audit row (product.unmerge)
  await touch([id, r.rows[0]?.into ? Number(r.rows[0].into) : null]);
  revalidatePath('/admin/produse', 'layout');
  redirect(`/admin/produse/${id}`);
}

/** Split: the checked offers move to a new product (sticky aliases keep them there). */
export async function splitProductAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = int(form, 'id');
  const offerIds = form.getAll('offerIds').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const newId = await splitProduct(db(), id, offerIds, admin.actor, String(form.get('title') ?? '') || undefined);
  if (!newId) throw new Error('alege cel puțin o ofertă a produsului');
  await audit(admin.actor, 'product.split', 'products', id, null, { newProductId: newId, offerIds });
  await touch([id, newId]);
  revalidatePath('/admin/produse', 'layout');
  redirect(`/admin/produse/${newId}`);
}

export async function unlinkOfferAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const offerId = int(form, 'offerId');
  const before = await unlinkOffer(db(), offerId, admin.actor);
  await audit(admin.actor, 'offer.unlink', 'offers', offerId, { productId: before }, { productId: null });
  await touch([before]);
  revalidatePath('/admin/produse', 'layout');
}

export async function blacklistOfferAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const offerId = int(form, 'offerId');
  const on = form.get('on') === '1';
  const before = await setOfferBlacklisted(db(), offerId, on);
  await audit(admin.actor, on ? 'offer.blacklist' : 'offer.unblacklist', 'offers', offerId, { productId: before }, { blacklisted: on });
  await touch([before]);
  revalidatePath('/admin/produse', 'layout');
  revalidatePath('/admin/oferte');
}
