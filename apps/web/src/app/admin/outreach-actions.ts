'use server';

import { auditLog, eq, outreach, shops, type OutreachChannel, type OutreachPurpose, type OutreachStatus } from '@pretoscop/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkContact, isOwnKey, OUTREACH_CHANNELS, OUTREACH_PURPOSES, OUTREACH_STATUSES, OUTREACH_TEMPLATES } from '@/lib/outreach';

/**
 * Outreach tracker actions (M21, setup C3). Admin only (`requireAdmin` in every action; Next.js
 * checks the Origin of server actions). Every change is audited without the free text: the audit
 * row records which fields were set, never the contact or the answer, so deleting a row erases
 * them for good (docs/legal/ropa.md P12).
 */

const PATH = '/admin/contactari';

function back(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params).toString()}`);
}

function pick<T extends string>(form: FormData, name: string, allowed: Record<T, string>): T | null {
  const v = String(form.get(name) ?? '');
  return isOwnKey(allowed, v) ? v : null;
}

function text(form: FormData, name: string, max: number): string | null {
  const v = String(form.get(name) ?? '').trim();
  return v === '' ? null : v.slice(0, max);
}

function positiveId(form: FormData, name: string): number | null {
  const n = Number(form.get(name));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** `YYYY-MM-DD` from a date input, stored at 10:00 UTC (midday in Bucharest) so the day never shifts. */
function day(form: FormData, name: string): Date | null {
  const v = String(form.get(name) ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T10:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
}

export async function createOutreachAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const shopId = positiveId(form, 'shopId');
  const purpose = pick<OutreachPurpose>(form, 'purpose', OUTREACH_PURPOSES);
  const channel = pick<OutreachChannel>(form, 'channel', OUTREACH_CHANNELS);
  const status = pick<OutreachStatus>(form, 'status', OUTREACH_STATUSES) ?? 'sent';
  if (!shopId || !purpose || !channel) back({ eroare: 'campuri' });
  const contact = checkContact(String(form.get('contact') ?? ''));
  if (!contact.ok) back({ eroare: contact.reason === 'personal' ? 'contact_personal' : 'contact' });
  const [shop] = await db().select({ id: shops.id }).from(shops).where(eq(shops.id, shopId));
  if (!shop) back({ eroare: 'campuri' });
  const template = String(form.get('template') ?? '');
  const values = {
    shopId,
    purpose,
    channel,
    contact: contact.value,
    template: isOwnKey(OUTREACH_TEMPLATES, template) ? template : null,
    sentAt: status === 'planned' ? null : (day(form, 'sentAt') ?? new Date()),
    status,
    answer: text(form, 'answer', 2000),
    nextStepAt: day(form, 'nextStepAt'),
    createdBy: admin.actor,
  };
  const [row] = await db().insert(outreach).values(values).returning({ id: outreach.id });
  await db()
    .insert(auditLog)
    .values({
      actor: admin.actor,
      action: 'outreach.create',
      entity: 'outreach',
      entityId: String(row!.id),
      before: null,
      after: {
        shopId,
        purpose,
        channel,
        template: values.template,
        status,
        sentAt: values.sentAt,
        nextStepAt: values.nextStepAt,
        contactSet: values.contact !== null,
        answerSet: values.answer !== null,
      },
    });
  revalidatePath(PATH);
  back({ ok: 'adaugat' });
}

export async function updateOutreachAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = positiveId(form, 'outreachId');
  const status = pick<OutreachStatus>(form, 'status', OUTREACH_STATUSES);
  if (!id || !status) back({ eroare: 'campuri' });
  const [before] = await db().select().from(outreach).where(eq(outreach.id, id));
  if (!before) back({ eroare: 'inexistent' });
  const answer = text(form, 'answer', 2000);
  const after = {
    status,
    answer: answer ?? before.answer,
    nextStepAt: day(form, 'nextStepAt') ?? (form.get('clearNext') ? null : before.nextStepAt),
    sentAt: before.sentAt ?? (status === 'planned' ? null : new Date()),
  };
  await db().update(outreach).set(after).where(eq(outreach.id, id));
  await db()
    .insert(auditLog)
    .values({
      actor: admin.actor,
      action: 'outreach.update',
      entity: 'outreach',
      entityId: String(id),
      before: { status: before.status, nextStepAt: before.nextStepAt, sentAt: before.sentAt },
      after: { status, nextStepAt: after.nextStepAt, sentAt: after.sentAt, answerChanged: answer !== null && answer !== before.answer },
    });
  revalidatePath(PATH);
  back({ ok: 'actualizat' });
}

/** Erases one entry (e.g. a personal address typed by mistake); the audit row keeps no contact data. */
export async function deleteOutreachAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = positiveId(form, 'outreachId');
  if (!id || form.get('confirm') !== 'da') back({ eroare: 'confirmare' });
  const [before] = await db().delete(outreach).where(eq(outreach.id, id)).returning();
  if (!before) back({ eroare: 'inexistent' });
  await db()
    .insert(auditLog)
    .values({
      actor: admin.actor,
      action: 'outreach.delete',
      entity: 'outreach',
      entityId: String(id),
      before: { shopId: before.shopId, purpose: before.purpose, channel: before.channel, status: before.status, sentAt: before.sentAt },
      after: null,
    });
  revalidatePath(PATH);
  back({ ok: 'sters' });
}
