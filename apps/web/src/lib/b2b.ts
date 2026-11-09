import 'server-only';
import { effectiveLimits, type B2bPlanLimits } from '@pretoscop/core';
import { acceptB2bInvites, b2bMembership, getB2bWorkspace, isFlagEnabled, type B2bMembership, type B2bWorkspace } from '@pretoscop/db';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { getSession } from './auth';
import { db, serverEnv } from './db';

/** B2B workspace pages (M28). Never indexed; every page and action checks access itself. */
export const B2B_PATH = '/b2b';
export const B2B_LOGIN_PATH = '/b2b/autentificare';

export interface B2bUser {
  id: string;
  email: string;
  /** An admin (role `admin` and the address in ADMIN_EMAILS): may open any workspace (support, preview). */
  isAdmin: boolean;
}

/** The signed-in user, or a redirect to the B2B login page. */
export const requireB2bUser = cache(async (): Promise<B2bUser> => {
  const s = await getSession();
  const email = s?.user.email?.toLowerCase();
  if (!s || !email) redirect(B2B_LOGIN_PATH);
  const role = (s.user as { role?: string }).role;
  return { id: s.user.id, email, isAdmin: role === 'admin' && serverEnv().ADMIN_EMAILS.includes(email) };
});

export function b2bOpen(): Promise<boolean> {
  return isFlagEnabled(db(), 'b2b.enabled');
}

/** Accepts the open invitations of the signed-in address (the magic link proved it). */
export async function acceptInvitesFor(user: B2bUser): Promise<number> {
  return acceptB2bInvites(db(), user.id, user.email);
}

export interface B2bContext {
  user: B2bUser;
  workspace: B2bWorkspace;
  /** Null for an admin who is not a member. */
  membership: B2bMembership | null;
  /** Owners and admins manage members, keys, billing data and SKUs. */
  canManage: boolean;
  limits: B2bPlanLimits;
  termsAccepted: boolean;
}

export function workspaceId(param: string): number | null {
  return /^\d{1,12}$/.test(param) ? Number(param) : null;
}

/**
 * The tenant gate of every workspace page, action and export: a member of this workspace (or an
 * admin), else "not found" (no hint that the workspace exists). Customers also need the service
 * open (`b2b.enabled`) and an active workspace.
 */
export const requireB2bWorkspace = cache(async (param: string): Promise<B2bContext> => {
  const user = await requireB2bUser();
  const id = workspaceId(param);
  if (id === null) notFound();
  const [workspace, membership] = await Promise.all([getB2bWorkspace(db(), id), b2bMembership(db(), id, user.id)]);
  if (!workspace || (!membership && !user.isAdmin)) notFound();
  if (!user.isAdmin) {
    if (!(await b2bOpen())) redirect(`${B2B_PATH}?eroare=inchis`);
    if (workspace.status !== 'active') redirect(`${B2B_PATH}?eroare=inactiv`);
  }
  return {
    user,
    workspace,
    membership,
    canManage: user.isAdmin || membership?.role === 'owner',
    limits: effectiveLimits(workspace.plan, { skuLimit: workspace.skuLimit, apiDailyQuota: workspace.apiDailyQuota }),
    termsAccepted: workspace.termsAcceptedAt !== null,
  };
});

/** Data pages: customers see data only after the owner accepted the data-usage terms. */
export async function requireB2bData(param: string): Promise<B2bContext> {
  const ctx = await requireB2bWorkspace(param);
  if (!ctx.termsAccepted && !ctx.user.isAdmin) redirect(`${B2B_PATH}/${ctx.workspace.id}`);
  return ctx;
}

export const actorOf = (ctx: B2bContext) => (ctx.membership ? `b2b:${ctx.user.id}` : `human:${ctx.user.id}`);

/** Romanian messages for `?ok=` / `?eroare=` codes after a server action. */
export const B2B_MESSAGES: Record<string, string> = {
  inchis: 'Serviciul pentru companii nu este încă deschis. Te anunțăm pe email când poți intra.',
  inactiv: 'Spațiul de lucru este suspendat. Scrie-ne la contact@pretoscop.ro.',
  termeni: 'Bifează acceptarea termenilor ca să continui.',
  doar_proprietar: 'Doar proprietarul spațiului de lucru poate face asta.',
  lista: 'Lista nu a putut fi citită.',
  fisier: 'Fișierul trebuie să fie CSV sau text, de cel mult 900 KB (aproximativ 10.000 de rânduri).',
  limita: 'Ai atins numărul de SKU-uri al planului.',
  negasit: 'Produsul nu a fost găsit.',
  nume: 'Dă un nume cheii (de exemplu, ERP sau Power BI).',
  fara_api: 'Planul tău nu include acces API.',
  email: 'Adresa de email nu este validă.',
  ultimul_proprietar: 'Spațiul de lucru trebuie să aibă cel puțin un proprietar.',
  pret: 'Prețul nu a putut fi citit (exemplu: 1.299,90).',
  cui: 'Codul fiscal nu este valid.',
  facturare: 'Plata online nu este încă disponibilă pentru acest plan.',
  date_facturare: 'Completează datele de facturare (firma, CUI, adresa) înainte de abonare.',
  import: 'Import terminat.',
  adaugat: 'Produsul a fost adăugat.',
  duplicat: 'Produsul este deja urmărit.',
  sters: 'SKU-ul a fost șters.',
  salvat: 'Salvat.',
  cheie_revocata: 'Cheia a fost revocată.',
  invitat: 'Invitația a fost trimisă.',
  termeni_ok: 'Termenii au fost acceptați.',
  abonament: 'Abonamentul a fost actualizat.',
};
