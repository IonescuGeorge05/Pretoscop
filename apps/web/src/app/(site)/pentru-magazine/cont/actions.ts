'use server';

import { currentVersion, legalDocuments } from '@pretoscop/config/legal-texts';
import { normalizeShopDomain, validateCui } from '@pretoscop/core';
import { auditLog, eq, merchants, MERCHANT_FEED_PARSERS, shopSources, shops, sql, type MerchantFeedFormat } from '@pretoscop/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import {
  CHECK_COOLDOWN_SECONDS,
  emailVerifies,
  enqueueCheck,
  ensureMerchant,
  merchantOf,
  portalOpen,
  PORTAL_PATH,
  requirePortalUser,
  runSourceNow,
  secondsSince,
} from '@/lib/merchant';
import { mailSubmitted } from '@/lib/merchant-mail';

const EDITABLE = new Set(['draft', 'rejected']);
const FORMATS = new Set<MerchantFeedFormat>(['google', 'compari', 'csv']);

function back(params: Record<string, string>, anchor: string): never {
  redirect(`${PORTAL_PATH}?${new URLSearchParams(params).toString()}#${anchor}`);
}

function field(form: FormData, key: string, max: number): string {
  return String(form.get(key) ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

async function audit(actor: string, action: string, id: number, after: Record<string, unknown>) {
  await db().insert(auditLog).values({ actor, action, entity: 'merchants', entityId: String(id), before: null, after });
}

/** Step 1: company and shop identity. The domain comes from the website address. */
export async function saveCompany(form: FormData): Promise<void> {
  const user = await requirePortalUser();
  const existing = await merchantOf(user.id);
  if (!existing && !(await portalOpen())) back({ eroare: 'portal_inchis' }, 'pas-1');
  if (existing && !EDITABLE.has(existing.status)) back({ eroare: 'stare' }, 'pas-1');

  const shopName = field(form, 'shopName', 80);
  const companyName = field(form, 'companyName', 120);
  const contactName = field(form, 'contactName', 80);
  const contactPhone = field(form, 'contactPhone', 30);
  const cui = validateCui(field(form, 'cui', 20));
  const website = field(form, 'websiteUrl', 300);
  const domain = normalizeShopDomain(website);
  if (shopName.length < 2) back({ eroare: 'nume' }, 'pas-1');
  if (companyName.length < 2) back({ eroare: 'firma' }, 'pas-1');
  if (!cui.ok) back({ eroare: 'cui' }, 'pas-1');
  if (!domain) back({ eroare: 'site' }, 'pas-1');
  if (contactPhone && !/^[+()\d\s.-]{6,30}$/.test(contactPhone)) back({ eroare: 'telefon' }, 'pas-1');

  const m = existing ?? (await ensureMerchant(user));
  const domainChanged = m.domain !== domain;
  const byEmail = emailVerifies(user.email, domain);
  await db()
    .update(merchants)
    .set({
      shopName,
      companyName,
      cui: cui.cui,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      websiteUrl: /^https?:\/\//i.test(website) ? website : `https://${website}`,
      domain,
      ...(domainChanged
        ? byEmail
          ? { domainVerifiedAt: new Date(), verificationMethod: 'email' as const, domainCheck: null }
          : { domainVerifiedAt: null, verificationMethod: null, domainCheck: null }
        : !m.domainVerifiedAt && byEmail
          ? { domainVerifiedAt: new Date(), verificationMethod: 'email' as const }
          : {}),
    })
    .where(eq(merchants.id, m.id));
  await audit(`merchant:${user.id}`, 'merchant.company', m.id, { domain, cui: cui.cui });
  revalidatePath(PORTAL_PATH);
  back({ ok: 'firma' }, 'pas-2');
}

/** Step 2: ask the worker to look for the DNS TXT record or the verification file. */
export async function checkDomain(): Promise<void> {
  const user = await requirePortalUser();
  const m = await merchantOf(user.id);
  if (!m?.domain) back({ eroare: 'site' }, 'pas-1');
  if (secondsSince(m.domainCheck?.requestedAt) < CHECK_COOLDOWN_SECONDS.verifyDomain) back({ eroare: 'asteapta' }, 'pas-2');
  await enqueueCheck('verifyDomain', m.id);
  revalidatePath(PORTAL_PATH);
  back({ ok: 'domeniu' }, 'pas-2');
}

/** Step 3: the feed address (an uploaded file goes through POST /api/merchant/feed-upload). */
export async function saveFeedUrl(form: FormData): Promise<void> {
  const user = await requirePortalUser();
  const m = await merchantOf(user.id);
  if (!m) back({ eroare: 'site' }, 'pas-1');
  if (m.status === 'pending') back({ eroare: 'stare' }, 'pas-3');
  const raw = field(form, 'feedUrl', 2000);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    back({ eroare: 'url' }, 'pas-3');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !normalizeShopDomain(url.hostname) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) {
    back({ eroare: 'url' }, 'pas-3');
  }
  const formatRaw = String(form.get('feedFormat') ?? 'auto');
  const feedFormat = FORMATS.has(formatRaw as MerchantFeedFormat) ? (formatRaw as MerchantFeedFormat) : null;
  if (secondsSince(m.validation?.requestedAt) < CHECK_COOLDOWN_SECONDS.validate && m.feedUrl === url.toString()) back({ eroare: 'asteapta' }, 'pas-3');
  await db().update(merchants).set({ feedUrl: url.toString(), feedUploadKey: null, feedUploadedAt: null, feedFormat }).where(eq(merchants.id, m.id));
  if (m.status === 'approved' || m.status === 'suspended') {
    // Offers must still link to the verified domain (requireDomain), so a new address needs no new approval.
    await db().execute(sql`
      UPDATE shop_sources SET url = ${url.toString()}, ${feedFormat ? sql`parser_key = ${MERCHANT_FEED_PARSERS[feedFormat]}, format = ${feedFormat},` : sql``}
        schedule = ${`${m.id % 60} */4 * * *`}, updated_at = now()
      WHERE config->>'origin' = 'merchant' AND (config->>'merchantId')::bigint = ${m.id}`);
  }
  await audit(`merchant:${user.id}`, 'merchant.feed_url', m.id, { feedUrl: url.toString(), feedFormat });
  await enqueueCheck('validate', m.id);
  revalidatePath(PORTAL_PATH);
  back({ ok: 'feed' }, 'pas-3');
}

/** Step 3: check the same feed again (after the merchant fixed it). */
export async function recheckFeed(): Promise<void> {
  const user = await requirePortalUser();
  const m = await merchantOf(user.id);
  if (!m || (!m.feedUrl && !m.feedUploadKey)) back({ eroare: 'fara_feed' }, 'pas-3');
  if (secondsSince(m.validation?.requestedAt) < CHECK_COOLDOWN_SECONDS.validate) back({ eroare: 'asteapta' }, 'pas-3');
  await enqueueCheck('validate', m.id);
  revalidatePath(PORTAL_PATH);
  back({ ok: 'feed' }, 'pas-3');
}

function lei(form: FormData, key: string): number | null | 'invalid' {
  const v = field(form, key, 20).replace(/\s|lei/gi, '').replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 10_000 ? Math.round(n * 100) / 100 : 'invalid';
}

/** Step 4: how prices are written and the shop's delivery rules. */
export async function saveSettings(form: FormData): Promise<void> {
  const user = await requirePortalUser();
  const m = await merchantOf(user.id);
  if (!m) back({ eroare: 'site' }, 'pas-1');
  if (m.status === 'pending') back({ eroare: 'stare' }, 'pas-4');
  const pf = String(form.get('priceFormat') ?? '');
  const priceFormat = pf === 'decimal' || pf === 'ro' ? pf : null;
  const freeOver = lei(form, 'freeOver');
  const flat = lei(form, 'flat');
  const lockerFlat = lei(form, 'lockerFlat');
  if (freeOver === 'invalid' || flat === 'invalid' || lockerFlat === 'invalid') back({ eroare: 'livrare' }, 'pas-4');
  const shippingRules = { free_over: freeOver, flat, locker_flat: lockerFlat };
  await db().update(merchants).set({ priceFormat, shippingRules }).where(eq(merchants.id, m.id));
  if (m.status === 'approved' || m.status === 'suspended') {
    await db().execute(sql`
      UPDATE shop_sources SET config = jsonb_set(config, '{priceFormat}', ${priceFormat ? sql`to_jsonb(${priceFormat}::text)` : sql`'null'::jsonb`}), updated_at = now()
      WHERE config->>'origin' = 'merchant' AND (config->>'merchantId')::bigint = ${m.id}`);
    // Delivery rules of shops created by the portal belong to the merchant; registry shops keep their YAML.
    if (m.shopId) {
      await db()
        .update(shops)
        .set({ shippingRules, shippingVerified: [freeOver, flat, lockerFlat].some((v) => typeof v === 'number') })
        .where(sql`${shops.id} = ${m.shopId} AND ${shops.legalBasisRef} = ${`merchant:${m.id}`}`);
    }
  }
  await audit(`merchant:${user.id}`, 'merchant.settings', m.id, { priceFormat, shippingRules });
  if (m.feedUrl || m.feedUploadKey) await enqueueCheck('validate', m.id);
  revalidatePath(PORTAL_PATH);
  back({ ok: 'setari' }, 'pas-4');
}

/** Step 5: accept the merchant terms and send the listing for approval. */
export async function submitForReview(form: FormData): Promise<void> {
  const user = await requirePortalUser();
  const m = await merchantOf(user.id);
  if (!m) back({ eroare: 'site' }, 'pas-1');
  if (!(await portalOpen())) back({ eroare: 'portal_inchis' }, 'pas-5');
  if (!EDITABLE.has(m.status)) back({ eroare: 'stare' }, 'pas-5');
  if (form.get('accept') !== 'on') back({ eroare: 'termeni' }, 'pas-5');
  const report = m.validation?.status === 'done' ? m.validation.report : undefined;
  const ready =
    m.shopName && m.companyName && m.cui && m.domain && m.domainVerifiedAt && (m.feedUrl || m.feedUploadKey) && report && report.normalization.accepted > 0;
  if (!ready) back({ eroare: 'incomplet' }, 'pas-5');
  if (report.priceFormat.needsChoice && !m.priceFormat) back({ eroare: 'pret' }, 'pas-4');
  await db()
    .update(merchants)
    .set({
      status: 'pending',
      submittedAt: new Date(),
      termsVersion: `${currentVersion.merchantTerms}@${legalDocuments.merchantTerms.version}`,
      termsAcceptedAt: new Date(),
      statusReason: null,
    })
    .where(eq(merchants.id, m.id));
  await audit(`merchant:${user.id}`, 'merchant.submit', m.id, { terms: currentVersion.merchantTerms });
  await mailSubmitted(m);
  revalidatePath(PORTAL_PATH);
  back({ ok: 'trimis' }, 'stare');
}

/** Approved merchants: read the feed now instead of waiting for the next scheduled pull (at most hourly). */
export async function pullNow(): Promise<void> {
  const user = await requirePortalUser();
  const m = await merchantOf(user.id);
  if (!m || m.status !== 'approved' || !m.shopId) back({ eroare: 'stare' }, 'panou');
  const [src] = await db()
    .select({ id: shopSources.id, key: shopSources.key, lastRunAt: shopSources.lastRunAt, slug: shops.slug })
    .from(shopSources)
    .innerJoin(shops, eq(shops.id, shopSources.shopId))
    .where(sql`${shopSources.config}->>'origin' = 'merchant' AND (${shopSources.config}->>'merchantId')::bigint = ${m.id}`);
  if (!src) back({ eroare: 'fara_feed' }, 'panou');
  if (src.lastRunAt && Date.now() - src.lastRunAt.getTime() < 3600_000) back({ eroare: 'asteapta_ora' }, 'panou');
  await runSourceNow(src.id, src.key, src.slug);
  await audit(`merchant:${user.id}`, 'merchant.pull_now', m.id, { sourceId: src.id });
  back({ ok: 'citire' }, 'panou');
}
