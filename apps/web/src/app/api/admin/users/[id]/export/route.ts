import { auditLog, exportUserData, sql } from '@pretoscop/db';
import { hashEmail } from '@/lib/alerts';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/users/{id}/export — a data-subject access request answered by an admin (audited). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const r = await db().execute<{ email: string }>(sql`SELECT email FROM users WHERE id = ${id}`);
  const email = r.rows[0]?.email;
  if (!email) return new Response('not found', { status: 404 });
  const data = await exportUserData(db(), id, hashEmail(email));
  await db().insert(auditLog).values({ actor: admin.actor, action: 'user.export', entity: 'users', entityId: id, before: null, after: null });
  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), ...data }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="pretoscop-export-${id}.json"`,
      'cache-control': 'no-store',
    },
  });
}
