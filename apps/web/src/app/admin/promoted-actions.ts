'use server';

import { floorProblem, isPriceBandKey, parseLeiInput } from '@pretoscop/core';
import { adjustWallet, deleteFloor, PromotedError, refundPromotedClick, setPlacementHold, upsertFloor } from '@pretoscop/db';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { refreshPromoted, refreshPromotedForMerchant } from '@/lib/promoted';

/**
 * Admin controls of promoted placements (M25): hold or release a campaign, refund a billed click,
 * credit or debit a wallet (a bank transfer, a goodwill credit, a refund paid outside Stripe), and
 * the floors and caps per category and price band. Every one is audited by the query layer.
 */

const PAGE = '/admin/promovare';

function back(params: Record<string, string>, anchor = ''): never {
  redirect(`${PAGE}?${new URLSearchParams(params).toString()}${anchor ? `#${anchor}` : ''}`);
}

function id(form: FormData, key: string): number {
  const v = String(form.get(key) ?? '');
  if (!/^\d{1,15}$/.test(v) || Number(v) <= 0) back({ eroare: 'date' });
  return Number(v);
}

function text(form: FormData, key: string, min: number, max: number): string | null {
  const v = String(form.get(key) ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
  return v.length >= min ? v : null;
}

export async function holdPlacementAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const placementId = id(form, 'placementId');
  const hold = form.get('hold') === '1';
  const reason = hold ? text(form, 'reason', 5, 300) : null;
  if (hold && !reason) back({ eroare: 'motiv' }, 'campanii');
  try {
    const r = await setPlacementHold(db(), { placementId, hold, reason, actor: admin.actor });
    await refreshPromotedForMerchant(r.merchantId);
  } catch (err) {
    if (err instanceof PromotedError) back({ eroare: err.code }, 'campanii');
    throw err;
  }
  back({ ok: hold ? 'oprita' : 'reluata' }, 'campanii');
}

export async function refundClickAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const promotedClickId = id(form, 'clickId');
  const reason = text(form, 'reason', 5, 300);
  if (!reason) back({ eroare: 'motiv' }, 'clicuri');
  try {
    const r = await refundPromotedClick(db(), { promotedClickId, actor: admin.actor, reason });
    // The refund gives budget back: the campaign may show again today.
    await refreshPromotedForMerchant(r.merchantId);
  } catch (err) {
    if (err instanceof PromotedError) back({ eroare: err.code }, 'clicuri');
    throw err;
  }
  back({ ok: 'returnat' }, 'clicuri');
}

export async function adjustWalletAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const merchantId = id(form, 'merchantId');
  const raw = String(form.get('amount') ?? '').trim();
  const negative = raw.startsWith('-') || raw.startsWith('−');
  const bani = parseLeiInput(raw.replace(/^[-−+]/, ''));
  const note = text(form, 'note', 5, 300);
  const token = String(form.get('token') ?? '');
  if (bani === null || bani <= 0 || bani > 1_000_000) back({ eroare: 'suma' }, 'solduri');
  if (!note) back({ eroare: 'motiv' }, 'solduri');
  if (!/^[0-9a-f-]{36}$/.test(token)) back({ eroare: 'date' }, 'solduri');
  try {
    const r = await adjustWallet(db(), { merchantId, amountBani: negative ? -bani : bani, actor: admin.actor, note, token });
    if (r.applied) await refreshPromotedForMerchant(merchantId);
  } catch (err) {
    if (err instanceof PromotedError) back({ eroare: err.code }, 'solduri');
    throw err;
  }
  back({ ok: 'ajustat' }, 'solduri');
}

export async function upsertFloorAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const rawCategory = String(form.get('categoryId') ?? '');
  const categoryId = rawCategory === '' ? null : id(form, 'categoryId');
  const band = String(form.get('band') ?? '');
  const floorBani = parseLeiInput(String(form.get('floor') ?? ''));
  const capBani = parseLeiInput(String(form.get('cap') ?? ''));
  if (!isPriceBandKey(band) || floorBani === null || capBani === null || floorProblem({ floorBani, capBani }) !== null) back({ eroare: 'prag' }, 'praguri');
  await upsertFloor(db(), { categoryId, band, floorBani, capBani, actor: admin.actor });
  await refreshPromoted(['promoted']);
  back({ ok: 'prag' }, 'praguri');
}

export async function deleteFloorAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  await deleteFloor(db(), { id: id(form, 'floorId'), actor: admin.actor });
  await refreshPromoted(['promoted']);
  back({ ok: 'prag_sters' }, 'praguri');
}
