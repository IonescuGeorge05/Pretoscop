'use server';

import { currentVersion, legalDocuments } from '@pretoscop/config/legal-texts';
import { CAMPAIGN_LIMITS, isPriceBandKey, parseLeiInput, TOPUP_LIMITS, topUpAmounts, type PriceBandKey } from '@pretoscop/core';
import {
  acceptPromotedTerms,
  createPlacement,
  createTopUp,
  failTopUp,
  getWallet,
  PromotedError,
  promotedActionsLastDay,
  setPlacementStatus,
  setTopUpCheckout,
  sql,
  topUpsLastDay,
  updatePlacement,
  type PlacementStatus,
} from '@pretoscop/db';
import { redirect } from 'next/navigation';
import { db, serverEnv } from '@/lib/db';
import { merchantOf, requirePortalUser, type Merchant } from '@/lib/merchant';
import { logPromoted, paymentProvider, PROMOTED_PATH, promotedEnabled, refreshPromoted, refreshPromotedForMerchant } from '@/lib/promoted';

/** Caps per merchant account and rolling 24 hours (each change also refreshes cached pages). */
const DAILY = { changes: 60, topups: 10 } as const;

function back(params: Record<string, string>, anchor = ''): never {
  redirect(`${PROMOTED_PATH}?${new URLSearchParams(params).toString()}${anchor ? `#${anchor}` : ''}`);
}

/** The signed-in merchant, approved, with the feature open; otherwise back with the reason. */
async function approvedMerchant(): Promise<{ m: Merchant & { status: 'approved' }; actor: string }> {
  const user = await requirePortalUser();
  const m = await merchantOf(user.id);
  if (!m || m.status !== 'approved') back({ eroare: 'neaprobat' });
  if (!(await promotedEnabled())) back({ eroare: 'inchis' });
  const actor = `merchant:${user.id}`;
  if ((await promotedActionsLastDay(db(), actor)) >= DAILY.changes) back({ eroare: 'limita' });
  return { m: m as Merchant & { status: 'approved' }, actor };
}

function lei(form: FormData, key: string): number | null {
  return parseLeiInput(String(form.get(key) ?? ''));
}

function positiveId(form: FormData, key: string): number | null {
  const v = String(form.get(key) ?? '');
  return /^\d{1,15}$/.test(v) && Number(v) > 0 ? Number(v) : null;
}

/** Opens the prepaid wallet once the unticked box is ticked (versioned text + terms page version). */
export async function acceptTermsAction(form: FormData): Promise<void> {
  const { m, actor } = await approvedMerchant();
  if (form.get('terms') !== 'on') back({ eroare: 'termeni' }, 'termeni');
  await acceptPromotedTerms(db(), m.id, `${currentVersion.promotedTerms}@${legalDocuments.merchantTerms.version}`, actor);
  back({ ok: 'termeni' }, 'sold');
}

/**
 * Starts a card top-up: the amount the merchant typed is the credit (net); VAT is added on top at
 * TOPUP_VAT_PERCENT. The wallet is credited later, only by Stripe's signed webhook.
 */
export async function startTopUpAction(form: FormData): Promise<void> {
  const { m, actor } = await approvedMerchant();
  const provider = paymentProvider();
  if (!provider) back({ eroare: 'fara_plata' }, 'sold');
  if (!(await getWallet(db(), m.id))) back({ eroare: 'termeni' }, 'termeni');
  const net = lei(form, 'amount');
  if (net === null || net < TOPUP_LIMITS.minBani || net > TOPUP_LIMITS.maxBani) back({ eroare: 'suma' }, 'sold');
  if ((await topUpsLastDay(db(), m.id)) >= DAILY.topups) back({ eroare: 'limita' }, 'sold');
  const env = serverEnv();
  const amounts = topUpAmounts(net, env.TOPUP_VAT_PERCENT);
  const topup = await createTopUp(db(), { merchantId: m.id, provider: provider.name, netBani: amounts.netBani, vatBani: amounts.vatBani, vatPercent: env.TOPUP_VAT_PERCENT, actor });
  let url: string;
  try {
    const base = env.PUBLIC_BASE_URL.replace(/\/+$/, '');
    const session = await provider.createCheckout({
      reference: `topup:${topup.id}`,
      amountBani: amounts.grossBani,
      currency: 'RON',
      description: 'Credit pentru oferte promovate pe Pretoscop',
      customerEmail: m.contactEmail,
      successUrl: `${base}${PROMOTED_PATH}?plata=ok`,
      cancelUrl: `${base}${PROMOTED_PATH}?plata=anulata`,
      expiresInMinutes: 60,
      metadata: { merchant_id: String(m.id) },
    });
    await setTopUpCheckout(db(), topup.id, session.id);
    url = session.url;
  } catch (err) {
    await failTopUp(db(), topup.id);
    logPromoted('topup.checkout_failed', { merchantId: m.id, topupId: topup.id }, err);
    back({ eroare: 'plata' }, 'sold');
  }
  redirect(url);
}

interface CampaignInput {
  categoryId: number;
  band: PriceBandKey | null;
  bidBani: number;
  capBani: number;
}

function campaignInput(form: FormData): CampaignInput | 'categorie' | 'interval' | 'oferta' | 'plafon' {
  const categoryId = positiveId(form, 'categoryId');
  if (categoryId === null) return 'categorie';
  const rawBand = String(form.get('band') ?? '');
  if (rawBand !== '' && !isPriceBandKey(rawBand)) return 'interval';
  const bidBani = lei(form, 'bid');
  if (bidBani === null || bidBani < 1 || bidBani > CAMPAIGN_LIMITS.maxBidBani) return 'oferta';
  const capBani = lei(form, 'dailyCap');
  if (capBani === null || capBani < bidBani || capBani > CAMPAIGN_LIMITS.maxDailyCapBani) return 'plafon';
  return { categoryId, band: rawBand === '' ? null : (rawBand as PriceBandKey), bidBani, capBani };
}

export async function createCampaignAction(form: FormData): Promise<void> {
  const { m, actor } = await approvedMerchant();
  const input = campaignInput(form);
  if (typeof input === 'string') back({ eroare: input }, 'campanie-noua');
  const exists = await db().execute<{ ok: boolean }>(sql`SELECT EXISTS (SELECT 1 FROM categories WHERE id = ${input.categoryId}) AS ok`);
  if (!exists.rows[0]?.ok) back({ eroare: 'categorie' }, 'campanie-noua');
  try {
    await createPlacement(db(), { merchantId: m.id, categoryId: input.categoryId, priceBand: input.band, bidBani: input.bidBani, dailyCapBani: input.capBani, actor });
  } catch (err) {
    if (err instanceof PromotedError && err.code === 'exists') back({ eroare: 'exista' }, 'campanie-noua');
    throw err;
  }
  await refreshPromotedForMerchant(m.id);
  back({ ok: 'campanie' }, 'campanii');
}

export async function updateCampaignAction(form: FormData): Promise<void> {
  const { m, actor } = await approvedMerchant();
  const placementId = positiveId(form, 'placementId');
  const bidBani = lei(form, 'bid');
  const capBani = lei(form, 'dailyCap');
  if (placementId === null) back({ eroare: 'campanie' }, 'campanii');
  if (bidBani === null || bidBani < 1 || bidBani > CAMPAIGN_LIMITS.maxBidBani) back({ eroare: 'oferta' }, 'campanii');
  if (capBani === null || capBani < bidBani || capBani > CAMPAIGN_LIMITS.maxDailyCapBani) back({ eroare: 'plafon' }, 'campanii');
  try {
    const categoryId = await updatePlacement(db(), { placementId, merchantId: m.id, bidBani, dailyCapBani: capBani, actor });
    await refreshPromoted([`promoted:c${categoryId}`, 'promoted:categorii']);
  } catch (err) {
    if (err instanceof PromotedError && err.code === 'not_found') back({ eroare: 'campanie' }, 'campanii');
    throw err;
  }
  back({ ok: 'modificat' }, 'campanii');
}

const STATUSES = new Set<PlacementStatus>(['active', 'paused', 'archived']);

export async function setCampaignStatusAction(form: FormData): Promise<void> {
  const { m, actor } = await approvedMerchant();
  const placementId = positiveId(form, 'placementId');
  const status = String(form.get('status') ?? '') as PlacementStatus;
  if (placementId === null || !STATUSES.has(status)) back({ eroare: 'campanie' }, 'campanii');
  try {
    const categoryId = await setPlacementStatus(db(), { placementId, merchantId: m.id, status, actor });
    await refreshPromoted([`promoted:c${categoryId}`, 'promoted:categorii']);
  } catch (err) {
    if (err instanceof PromotedError) back({ eroare: 'campanie' }, 'campanii');
    throw err;
  }
  back({ ok: status === 'archived' ? 'arhivat' : status === 'paused' ? 'oprit' : 'pornit' }, 'campanii');
}
