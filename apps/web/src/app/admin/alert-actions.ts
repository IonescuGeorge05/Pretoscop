'use server';

import { auditLog, deleteUserData, sql } from '@pretoscop/db';
import { redirect } from 'next/navigation';
import { hashEmail } from '@/lib/alerts';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * Data-subject request handled by an admin (GDPR art. 17, e.g. a request sent by email): deletes
 * the account like the self-service button. The audit row keeps ids and counts, never the address.
 */
export async function deleteUserAsAdmin(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(form.get('userId') ?? '');
  if (form.get('confirm') !== 'on' || !userId) redirect('/admin/alerte?eroare=confirmare');
  const r = await db().execute<{ email: string; role: string; n: string }>(sql`
    SELECT email, role, (SELECT count(*) FROM alerts a WHERE a.user_id = u.id)::text AS n FROM users u WHERE id = ${userId}`);
  const u = r.rows[0];
  if (!u) redirect('/admin/alerte?eroare=negasit');
  if (u.role === 'admin') redirect('/admin/alerte?eroare=admin');
  await deleteUserData(db(), userId, { method: 'admin', emailHash: hashEmail(u.email) });
  await db()
    .insert(auditLog)
    .values({ actor: admin.actor, action: 'user.delete', entity: 'users', entityId: userId, before: { alerts: Number(u.n), role: u.role }, after: null });
  redirect('/admin/alerte?sters=1');
}
