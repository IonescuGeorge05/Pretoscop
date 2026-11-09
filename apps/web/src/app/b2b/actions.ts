'use server';

import { currentVersion, legalDocuments } from '@pretoscop/config/legal-texts';
import { B2B_IMPORT_MAX_LINES, B2B_PLANS, isB2bPlan, parseB2bImport, parsePriceRon, validateCui } from '@pretoscop/core';
import {
  acceptB2bTerms,
  addB2bCatalogueSku,
  auditLog,
  B2bError,
  createB2bApiKey,
  importB2bSkus,
  inviteB2bMember,
  removeB2bMember,
  removeB2bSku,
  revokeB2bApiKey,
  setB2bDigest,
  updateB2bSku,
  updateB2bWorkspace,
  type B2bImportResult,
} from '@pretoscop/db';
import { PaymentProviderError } from '@pretoscop/payments';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { billingProvider, selfServePrices } from '@/lib/b2b-billing-server';
import { db, serverEnv } from '@/lib/db';
import { actorOf, B2B_PATH, requireB2bData, requireB2bWorkspace, type B2bContext } from '@/lib/b2b';

/**
 * Server actions of the B2B workspace (M28). Each one runs the tenant gate itself (the workspace
 * id comes from the form and is checked against the session's memberships), changes only that
 * workspace's rows, and writes an audit row.
 */

// Server actions accept bodies up to 1 MB (Next.js default, kept for every action).
const IMPORT_MAX_BYTES = 900 * 1024;

function back(ws: number, page: string, params: Record<string, string>): never {
  const q = new URLSearchParams(params).toString();
  redirect(`${B2B_PATH}/${ws}${page}${q ? `?${q}` : ''}`);
}

function field(form: FormData, key: string, max: number): string {
  return String(form.get(key) ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

async function audit(ctx: B2bContext, action: string, after: Record<string, unknown>): Promise<void> {
  await db().insert(auditLog).values({ actor: actorOf(ctx), action, entity: 'b2b_workspaces', entityId: String(ctx.workspace.id), before: null, after });
}

function owner(ctx: B2bContext, page: string): void {
  if (!ctx.canManage) back(ctx.workspace.id, page, { eroare: 'doar_proprietar' });
}

/** The owner accepts the data-usage terms (versioned) for the workspace. */
export async function acceptTermsAction(form: FormData): Promise<void> {
  const ctx = await requireB2bWorkspace(field(form, 'ws', 12));
  owner(ctx, '');
  if (form.get('accept') !== 'on') back(ctx.workspace.id, '', { eroare: 'termeni' });
  const version = `${currentVersion.b2bTerms}@${legalDocuments.b2bTerms.version}`;
  await acceptB2bTerms(db(), ctx.workspace.id, ctx.user.id, version);
  await audit(ctx, 'b2b.terms_accept', { version });
  revalidatePath(`${B2B_PATH}/${ctx.workspace.id}`);
  back(ctx.workspace.id, '', { ok: 'termeni_ok' });
}

function summary(r: B2bImportResult): Record<string, string> {
  return {
    ok: 'import',
    adaugate: String(r.added),
    gasite: String(r.matched),
    negasite: String(r.unmatched),
    ambigue: String(r.ambiguous),
    duplicate: String(r.duplicates),
    invalide: String(r.invalid),
    peste_limita: String(r.overLimit),
  };
}

/** Pasted list or uploaded CSV/text file → SKUs (up to the plan's limit). */
export async function importSkusAction(form: FormData): Promise<void> {
  const ctx = await requireB2bData(field(form, 'ws', 12));
  owner(ctx, '/import');
  let text = String(form.get('list') ?? '');
  const file = form.get('file');
  if (file instanceof File && file.size > 0) {
    if (file.size > IMPORT_MAX_BYTES || !/\.(csv|txt|tsv)$/i.test(file.name)) back(ctx.workspace.id, '/import', { eroare: 'fisier' });
    text = await file.text();
  }
  if (text.length > IMPORT_MAX_BYTES) back(ctx.workspace.id, '/import', { eroare: 'fisier' });
  const parsed = parseB2bImport(text);
  if (parsed.errors.length > 0) back(ctx.workspace.id, '/import', { eroare: 'lista', detaliu: parsed.errors[0]!.slice(0, 200) });
  const r = await importB2bSkus(db(), ctx.workspace.id, parsed.lines, ctx.limits.skuLimit);
  // The first problems, so the customer can fix the list (line numbers of the pasted text).
  const problems = parsed.lines
    .filter((l) => l.errors.length > 0)
    .slice(0, 5)
    .map((l) => `rândul ${l.line}: ${l.errors[0]}`)
    .join('; ');
  await audit(ctx, 'b2b.import', { ...r, lines: parsed.lines.length, max: B2B_IMPORT_MAX_LINES });
  revalidatePath(`${B2B_PATH}/${ctx.workspace.id}`);
  back(ctx.workspace.id, '/import', { ...summary(r), ...(problems ? { probleme: problems.slice(0, 600) } : {}) });
}

export async function addCatalogueSkuAction(form: FormData): Promise<void> {
  const ctx = await requireB2bData(field(form, 'ws', 12));
  owner(ctx, '/import');
  const productId = Number(field(form, 'productId', 12));
  if (!Number.isInteger(productId) || productId <= 0) back(ctx.workspace.id, '/import', { eroare: 'negasit' });
  const r = await addB2bCatalogueSku(db(), ctx.workspace.id, productId, ctx.limits.skuLimit);
  if (r === 'added') await audit(ctx, 'b2b.sku_add', { productId });
  const q = field(form, 'q', 120);
  const [kind, code] = ({ added: ['ok', 'adaugat'], duplicate: ['ok', 'duplicat'], limit: ['eroare', 'limita'], not_found: ['eroare', 'negasit'] } as const)[r];
  back(ctx.workspace.id, '/import', { [kind]: code, ...(q ? { q } : {}) });
}

export async function removeSkuAction(form: FormData): Promise<void> {
  const ctx = await requireB2bData(field(form, 'ws', 12));
  owner(ctx, '');
  const skuId = Number(field(form, 'sku', 12));
  if (Number.isInteger(skuId) && (await removeB2bSku(db(), ctx.workspace.id, skuId))) await audit(ctx, 'b2b.sku_remove', { skuId });
  revalidatePath(`${B2B_PATH}/${ctx.workspace.id}`);
  back(ctx.workspace.id, '', { ok: 'sters' });
}

export async function updateSkuAction(form: FormData): Promise<void> {
  const ctx = await requireB2bData(field(form, 'ws', 12));
  const skuId = Number(field(form, 'sku', 12));
  owner(ctx, `/sku/${skuId}`);
  const priceText = field(form, 'referencePrice', 30);
  let referencePriceBani: number | null = null;
  if (priceText) {
    const p = parsePriceRon(priceText);
    if (!p.ok) back(ctx.workspace.id, `/sku/${skuId}`, { eroare: 'pret' });
    referencePriceBani = p.bani;
  }
  const ok = await updateB2bSku(db(), ctx.workspace.id, skuId, { ref: field(form, 'ref', 200) || null, label: field(form, 'label', 200) || null, referencePriceBani });
  if (ok) await audit(ctx, 'b2b.sku_update', { skuId });
  back(ctx.workspace.id, `/sku/${skuId}`, { ok: 'salvat' });
}

export interface CreateKeyState {
  key?: string;
  name?: string;
  error?: string;
}

/** Creates an API key and returns it once (to the client component; never stored in clear). */
export async function createApiKeyAction(_prev: CreateKeyState, form: FormData): Promise<CreateKeyState> {
  const ctx = await requireB2bData(field(form, 'ws', 12));
  if (!ctx.canManage) return { error: 'doar_proprietar' };
  if (ctx.limits.apiDailyQuota <= 0) return { error: 'fara_api' };
  const name = field(form, 'name', 60);
  if (name.length < 2) return { error: 'nume' };
  const k = await createB2bApiKey(db(), ctx.workspace.id, name, actorOf(ctx));
  await audit(ctx, 'b2b.key_create', { keyId: k.id, prefix: k.publicId, name });
  revalidatePath(`${B2B_PATH}/${ctx.workspace.id}/api`);
  return { key: k.key, name };
}

export async function revokeApiKeyAction(form: FormData): Promise<void> {
  const ctx = await requireB2bWorkspace(field(form, 'ws', 12));
  owner(ctx, '/api');
  const keyId = Number(field(form, 'key', 12));
  if (Number.isInteger(keyId) && (await revokeB2bApiKey(db(), ctx.workspace.id, keyId, actorOf(ctx)))) await audit(ctx, 'b2b.key_revoke', { keyId });
  back(ctx.workspace.id, '/api', { ok: 'cheie_revocata' });
}

export async function setDigestAction(form: FormData): Promise<void> {
  const ctx = await requireB2bWorkspace(field(form, 'ws', 12));
  if (!ctx.membership) back(ctx.workspace.id, '/setari', { eroare: 'doar_proprietar' });
  const on = form.get('digest') === 'on';
  await setB2bDigest(db(), ctx.workspace.id, ctx.user.id, on);
  await audit(ctx, 'b2b.digest', { on });
  back(ctx.workspace.id, '/setari', { ok: 'salvat' });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function inviteMemberAction(form: FormData): Promise<void> {
  const ctx = await requireB2bWorkspace(field(form, 'ws', 12));
  owner(ctx, '/setari');
  const email = field(form, 'email', 200).toLowerCase();
  const role = form.get('role') === 'owner' ? 'owner' : 'member';
  if (!EMAIL.test(email)) back(ctx.workspace.id, '/setari', { eroare: 'email' });
  await inviteB2bMember(db(), ctx.workspace.id, email, role, actorOf(ctx));
  await audit(ctx, 'b2b.invite', { role });
  back(ctx.workspace.id, '/setari', { ok: 'invitat' });
}

export async function removeMemberAction(form: FormData): Promise<void> {
  const ctx = await requireB2bWorkspace(field(form, 'ws', 12));
  const userId = field(form, 'user', 64);
  // Anyone may leave; only owners remove others.
  if (userId !== ctx.user.id) owner(ctx, '/setari');
  try {
    if (await removeB2bMember(db(), ctx.workspace.id, userId)) await audit(ctx, 'b2b.member_remove', { userId });
  } catch (e) {
    if (e instanceof B2bError && e.code === 'last_owner') back(ctx.workspace.id, '/setari', { eroare: 'ultimul_proprietar' });
    throw e;
  }
  if (userId === ctx.user.id && !ctx.user.isAdmin) redirect(B2B_PATH);
  back(ctx.workspace.id, '/setari', { ok: 'salvat' });
}

/** Buyer data for invoices (e-Factura needs the CUI and the registered address). */
export async function saveBillingAction(form: FormData): Promise<void> {
  const ctx = await requireB2bWorkspace(field(form, 'ws', 12));
  owner(ctx, '/setari');
  const cuiText = field(form, 'cui', 20);
  const cui = cuiText ? validateCui(cuiText) : null;
  if (cui && !cui.ok) back(ctx.workspace.id, '/setari', { eroare: 'cui' });
  const email = field(form, 'billingEmail', 200).toLowerCase();
  if (email && !EMAIL.test(email)) back(ctx.workspace.id, '/setari', { eroare: 'email' });
  await updateB2bWorkspace(db(), ctx.workspace.id, {
    companyName: field(form, 'companyName', 160) || null,
    cui: cui?.cui ?? null,
    regCom: field(form, 'regCom', 40) || null,
    billingAddress: field(form, 'billingAddress', 400) || null,
    billingEmail: email || null,
  });
  await audit(ctx, 'b2b.billing_data', { cui: cui?.cui ?? null });
  back(ctx.workspace.id, '/setari', { ok: 'salvat' });
}

const LIVE_SUBSCRIPTION = new Set(['active', 'past_due', 'unpaid', 'checkout']);

/**
 * Self-serve subscription (Starter, Pro): the owner goes to the provider's hosted checkout. The
 * plan changes only when the provider's signed webhook confirms the payment (never on the way back).
 */
export async function startSubscriptionAction(form: FormData): Promise<void> {
  const ctx = await requireB2bWorkspace(field(form, 'ws', 12));
  owner(ctx, '/setari');
  const w = ctx.workspace;
  const plan = field(form, 'plan', 20);
  const prices = selfServePrices();
  const provider = await billingProvider();
  if (!provider || !isB2bPlan(plan) || !B2B_PLANS[plan].selfServe || !prices[plan]) back(w.id, '/setari', { eroare: 'facturare' });
  if (!w.companyName || !w.cui || !w.billingAddress) back(w.id, '/setari', { eroare: 'date_facturare' });
  if (w.billingSubscriptionId && LIVE_SUBSCRIPTION.has(w.billingStatus)) back(w.id, '/setari', { eroare: 'facturare' });
  const base = serverEnv().PUBLIC_BASE_URL;
  let url: string;
  try {
    const s = await provider.createSubscriptionCheckout({
      reference: `b2b:${w.id}`,
      metadata: { workspace_id: String(w.id), plan },
      priceId: prices[plan]!,
      customerId: w.billingCustomerId,
      customerEmail: w.billingEmail ?? ctx.user.email,
      successUrl: `${base}/b2b/${w.id}/setari?plata=ok`,
      cancelUrl: `${base}/b2b/${w.id}/setari?plata=anulat`,
      automaticTax: serverEnv().B2B_STRIPE_AUTOMATIC_TAX,
    });
    url = s.url;
    await audit(ctx, 'b2b.checkout', { plan, session: s.id });
  } catch (e) {
    if (e instanceof PaymentProviderError) back(w.id, '/setari', { eroare: 'facturare' });
    throw e;
  }
  redirect(url);
}

/** The provider's customer portal: card, invoices, cancellation. */
export async function openBillingPortalAction(form: FormData): Promise<void> {
  const ctx = await requireB2bWorkspace(field(form, 'ws', 12));
  owner(ctx, '/setari');
  const w = ctx.workspace;
  const provider = await billingProvider();
  if (!provider || !w.billingCustomerId) back(w.id, '/setari', { eroare: 'facturare' });
  let url: string;
  try {
    url = (await provider.createPortalSession(w.billingCustomerId, `${serverEnv().PUBLIC_BASE_URL}/b2b/${w.id}/setari`)).url;
  } catch (e) {
    if (e instanceof PaymentProviderError) back(w.id, '/setari', { eroare: 'facturare' });
    throw e;
  }
  redirect(url);
}
