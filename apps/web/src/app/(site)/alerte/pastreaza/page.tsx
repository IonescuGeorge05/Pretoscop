import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql, touchUserActivity } from '@pretoscop/db';
import { verifyLink } from '@pretoscop/notify';
import { Notice } from '@/components/alerts/notice';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { secret } from '@/lib/alerts';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Păstrează contul', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** "Păstrează contul" from the 24-month retention notice: resets the inactivity clock. */
async function keepAccount(form: FormData): Promise<void> {
  'use server';
  const u = String(form.get('u') ?? '');
  const t = String(form.get('t') ?? '');
  if (!verifyLink(secret(), 'keep', u, t)) redirect(`/alerte/pastreaza?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}&stare=invalid`);
  await touchUserActivity(db(), u);
  redirect(`/alerte/pastreaza?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}&stare=pastrat`);
}

export default async function KeepAccountPage({ searchParams }: Props) {
  const p = await searchParams;
  const u = one(p.u);
  const t = one(p.t);
  const valid = u !== '' && verifyLink(secret(), 'keep', u, t);
  const exists = valid ? (await db().execute(sql`SELECT 1 FROM users WHERE id = ${u}`)).rows.length > 0 : false;
  let body;
  if (!valid) {
    body = (
      <Notice tone="warn" title="Linkul nu este valid">
        <p>Verifică dacă ai copiat linkul întreg din email.</p>
      </Notice>
    );
  } else if (!exists) {
    body = (
      <Notice tone="warn" title="Contul nu mai există">
        <p>A fost șters după perioada de inactivitate. Poți porni oricând alerte noi de pe pagina unui produs.</p>
      </Notice>
    );
  } else if (one(p.stare) === 'pastrat') {
    body = (
      <Notice tone="good" title="Gata, contul rămâne activ">
        <p>
          Am anulat ștergerea. Alertele tale continuă.{' '}
          <Link href="/alerte" className="font-medium text-brand-700 underline">
            Vezi alertele
          </Link>
        </p>
      </Notice>
    );
  } else {
    body = (
      <div className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-line sm:p-6">
        <h1 className="text-xl font-bold text-ink">Păstrezi contul Pretoscop?</h1>
        <p className="mt-3 text-[15px] text-ink-soft">Apasă butonul și nu mai ștergem contul și alertele tale. Te anunțăm din nou doar după alte 24 de luni fără activitate.</p>
        <form action={keepAccount} className="mt-5">
          <input type="hidden" name="u" value={u} />
          <input type="hidden" name="t" value={t} />
          <Button type="submit" size="lg">
            Păstrează contul
          </Button>
        </form>
      </div>
    );
  }
  return <Container className="max-w-xl py-10 sm:py-14">{body}</Container>;
}
