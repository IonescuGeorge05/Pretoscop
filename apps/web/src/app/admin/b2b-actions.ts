'use server';

import { isB2bPlan, validateCui } from '@pretoscop/core';
import {
  auditLog,
  B2bError,
  cancelB2bInvite,
  createB2bWorkspace,
  getB2bWorkspace,
  inviteB2bMember,
  reresolveB2bSkus,
  revokeB2bApiKey,
  setB2bInvoiceFiscal,
  sql,
  updateB2bWorkspace,
  type B2bEfacturaStatus,
  type B2bWorkspaceStatus,
} from '@pretoscop/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Admin provisioning of B2B workspaces (M28). Every action checks the admin session itself and
 * writes an audit row with before/after.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUSES = new Set<B2bWorkspaceStatus>(['active', 'suspended', 'cancelled']);

function field(form: FormData, key: string, max: number): string {
  return String(form.get(key) ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function wsId(form: FormData): number {
  const n = Number(form.get('ws'));
  if (!Number.isInteger(n) || n <= 0) throw new Error('invalid workspace id');
  return n;
}

function back(path: string, params: { ok: string } | { eroare: string }): never {
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

async function audit(actor: string, action: string, id: number, before: unknown, after: unknown): Promise<void> {
  await db().insert(auditLog).values({ actor, action, entity: 'b2b_workspaces', entityId: String(id), before: before ?? null, after: after ?? null });
}

/** Optional non-negative integer override; empty = the plan's value. */
function limit(form: FormData, key: string): number | null | 'invalid' {
  const v = field(form, key, 12);
  if (v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 10_000_000 ? n : 'invalid';
}

async function shopIdBySlug(slug: string): Promise<number | null> {
  if (!slug) return null;
  const r = await db().execute<{ id: string }>(sql`SELECT id::text FROM shops WHERE slug = ${slug}`);
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

export async function createWorkspaceAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const name = field(form, 'name', 120);
  const kind = form.get('kind') === 'brand' ? 'brand' : 'merchant';
  const plan = field(form, 'plan', 20);
  const owner = field(form, 'ownerEmail', 200).toLowerCase();
  const shopSlug = field(form, 'shop', 80);
  if (name.length < 2) back('/admin/b2b', { eroare: 'nume' });
  if (!isB2bPlan(plan)) back('/admin/b2b', { eroare: 'plan' });
  if (owner && !EMAIL.test(owner)) back('/admin/b2b', { eroare: 'email' });
  const shopId = await shopIdBySlug(shopSlug);
  if (kind === 'merchant' && !shopId) back('/admin/b2b', { eroare: 'magazin' });
  const cuiText = field(form, 'cui', 20);
  const cui = cuiText ? validateCui(cuiText) : null;
  if (cui && !cui.ok) back('/admin/b2b', { eroare: 'cui' });
  let id: number;
  try {
    id = await createB2bWorkspace(db(), { name, kind, shopId, plan, companyName: field(form, 'companyName', 160) || null, cui: cui?.cui ?? null, createdBy: admin.actor });
  } catch (e) {
    if (e instanceof B2bError) back('/admin/b2b', { eroare: 'magazin' });
    throw e;
  }
  if (owner) await inviteB2bMember(db(), id, owner, 'owner', admin.actor);
  await audit(admin.actor, 'b2b.workspace_create', id, null, { name, kind, plan, shopId, ownerInvited: Boolean(owner) });
  revalidatePath('/admin/b2b');
  back(`/admin/b2b/${id}`, { ok: 'creat' });
}

export async function updateWorkspaceAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = wsId(form);
  const before = await getB2bWorkspace(db(), id);
  if (!before) back('/admin/b2b', { eroare: 'negasit' });
  const path = `/admin/b2b/${id}`;
  const plan = field(form, 'plan', 20);
  const status = field(form, 'status', 20) as B2bWorkspaceStatus;
  if (!isB2bPlan(plan) || !STATUSES.has(status)) back(path, { eroare: 'plan' });
  const skuLimit = limit(form, 'skuLimit');
  const apiDailyQuota = limit(form, 'apiDailyQuota');
  if (skuLimit === 'invalid' || apiDailyQuota === 'invalid') back(path, { eroare: 'limita' });
  const reason = field(form, 'statusReason', 500) || null;
  if (status !== 'active' && status !== before.status && !reason) back(path, { eroare: 'motiv' });
  let shopId = before.shopId;
  if (before.kind === 'merchant') {
    const slug = field(form, 'shop', 80);
    if (slug) {
      shopId = await shopIdBySlug(slug);
      if (!shopId) back(path, { eroare: 'magazin' });
    }
  }
  const patch = { name: field(form, 'name', 120) || before.name, plan, status, skuLimit, apiDailyQuota, shopId, statusReason: status === 'active' ? null : reason };
  await updateB2bWorkspace(db(), id, patch);
  await audit(admin.actor, 'b2b.workspace_update', id, { plan: before.plan, status: before.status, skuLimit: before.skuLimit, apiDailyQuota: before.apiDailyQuota, shopId: before.shopId }, patch);
  revalidatePath(path);
  back(path, { ok: 'salvat' });
}

export async function adminInviteAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = wsId(form);
  const email = field(form, 'email', 200).toLowerCase();
  const role = form.get('role') === 'owner' ? 'owner' : 'member';
  if (!EMAIL.test(email)) back(`/admin/b2b/${id}`, { eroare: 'email' });
  await inviteB2bMember(db(), id, email, role, admin.actor);
  await audit(admin.actor, 'b2b.invite', id, null, { role });
  back(`/admin/b2b/${id}`, { ok: 'invitat' });
}

export async function adminCancelInviteAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = wsId(form);
  const inviteId = Number(form.get('invite'));
  if (Number.isInteger(inviteId) && (await cancelB2bInvite(db(), id, inviteId))) await audit(admin.actor, 'b2b.invite_cancel', id, { inviteId }, null);
  back(`/admin/b2b/${id}`, { ok: 'salvat' });
}

export async function adminRevokeKeyAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = wsId(form);
  const keyId = Number(form.get('key'));
  if (Number.isInteger(keyId) && (await revokeB2bApiKey(db(), id, keyId, admin.actor))) await audit(admin.actor, 'b2b.key_revoke', id, { keyId }, null);
  back(`/admin/b2b/${id}`, { ok: 'salvat' });
}

export async function adminResolveAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = wsId(form);
  const r = await reresolveB2bSkus(db(), id);
  await audit(admin.actor, 'b2b.resolve', id, null, r);
  back(`/admin/b2b/${id}`, { ok: 'rezolvat' });
}

const EFACTURA = new Set<B2bEfacturaStatus>(['to_issue', 'issued', 'sent', 'accepted', 'rejected']);

/** The accountant issued the fiscal invoice for a paid period: its number and e-Factura state. */
export async function setInvoiceFiscalAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const invoiceId = Number(form.get('invoice'));
  const status = field(form, 'efactura', 20) as B2bEfacturaStatus;
  const fiscal = field(form, 'fiscalNumber', 40) || null;
  const month = field(form, 'luna', 7);
  const path = `/admin/b2b/facturi${/^\d{4}-\d{2}$/.test(month) ? `?luna=${month}` : ''}`;
  if (!Number.isInteger(invoiceId) || !EFACTURA.has(status) || (status !== 'to_issue' && !fiscal)) redirect(`${path}${path.includes('?') ? '&' : '?'}eroare=fiscal`);
  if (await setB2bInvoiceFiscal(db(), invoiceId, fiscal, status)) {
    await db().insert(auditLog).values({ actor: admin.actor, action: 'b2b.invoice_fiscal', entity: 'b2b_invoices', entityId: String(invoiceId), before: null, after: { fiscal, status } });
  }
  redirect(path);
}
