'use server';

import { auditLog, eq, outreach, type OutreachChannel, type OutreachPurpose, type OutreachStatus } from '@pretoscop/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { OUTREACH_CHANNELS, OUTREACH_PURPOSES, OUTREACH_STATUSES, OUTREACH_TEMPLATES } from '@/lib/outreach';

const PATH = '/admin/contactari';

function back(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params).toString()}`);
}

function pick<T extends string>(form: FormData, name: string, allowed: Record<T, string>): T | null {
  const v = String(form.get(name) ?? '');
  return v in allowed ? (v as T) : null;
}

function text(form: FormData, name: string, max: number): string | null {
  const v = String(form.get(name) ?? '').trim();
  return v === '' ? null : v.slice(0, max);
}

/** `YYYY-MM-DD` from a date input, as noon Bucharest-ish UTC so the day never shifts. */
function day(form: FormData, name: string): Date | null {
  const v = String(form.get(name) ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T10:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createOutreachAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const shopId = Number(form.get('shopId'));
  const purpose = pick<OutreachPurpose>(form, 'purpose', OUTREACH_PURPOSES);
  const channel = pick<OutreachChannel>(form, 'channel', OUTREACH_CHANNELS);
  const status = pick<OutreachStatus>(form, 'status', OUTREACH_STATUSES) ?? 'sent';
  if (!Number.isInteger(shopId) || shopId <= 0 || !purpose || !channel) back({ eroare: 'campuri' });
  const template = String(form.get('template') ?? '');
  const values = {
    shopId,
    purpose,
    channel,
    contact: text(form, 'contact', 200),
    template: template in OUTREACH_TEMPLATES ? template : null,
    sentAt: status === 'planned' ? null : (day(form, 'sentAt') ?? new Date()),
    status,
    answer: text(form, 'answer', 2000),
    nextStepAt: day(form, 'nextStepAt'),
    createdBy: admin.actor,
  };
  const [row] = await db().insert(outreach).values(values).returning({ id: outreach.id });
  await db().insert(auditLog).values({ actor: admin.actor, action: 'outreach.create', entity: 'outreach', entityId: String(row!.id), before: null, after: values });
  revalidatePath(PATH);
  back({ ok: 'adaugat' });
}

export async function updateOutreachAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = Number(form.get('outreachId'));
  const status = pick<OutreachStatus>(form, 'status', OUTREACH_STATUSES);
  if (!Number.isInteger(id) || id <= 0 || !status) back({ eroare: 'campuri' });
  const [before] = await db().select().from(outreach).where(eq(outreach.id, id));
  if (!before) back({ eroare: 'inexistent' });
  const after = {
    status,
    answer: text(form, 'answer', 2000) ?? before.answer,
    nextStepAt: day(form, 'nextStepAt') ?? (form.get('clearNext') ? null : before.nextStepAt),
    sentAt: before.sentAt ?? (status === 'planned' ? null : new Date()),
  };
  await db().update(outreach).set(after).where(eq(outreach.id, id));
  await db()
    .insert(auditLog)
    .values({ actor: admin.actor, action: 'outreach.update', entity: 'outreach', entityId: String(id), before: { status: before.status, answer: before.answer }, after });
  revalidatePath(PATH);
  back({ ok: 'actualizat' });
}
