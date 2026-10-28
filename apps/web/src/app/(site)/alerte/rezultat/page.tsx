import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice } from '@/components/alerts/notice';
import { Container } from '@/components/ui/container';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Alertă de preț', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

const STATES: Record<string, { tone: 'good' | 'warn'; title: string; text: string }> = {
  trimis: {
    tone: 'good',
    title: 'Verifică emailul',
    text: 'Dacă adresa poate primi emailuri de la noi, în câteva minute primești un email de confirmare. Alerta pornește doar după ce apeși butonul din el (linkul este valabil 7 zile).',
  },
  activ: { tone: 'good', title: 'Alerta este activă', text: 'Ești autentificat cu această adresă, așa că alerta a pornit direct. O găsești în pagina Alertele mele.' },
  eroare: { tone: 'warn', title: 'Nu am putut porni alerta', text: 'Unele câmpuri nu erau completate corect (adresa de email, pragul de preț sau bifa de acord). Întoarce-te la produs și încearcă din nou.' },
  limita: { tone: 'warn', title: 'Prea multe cereri', text: 'Ai cerut mai multe alerte în ultima oră. Încearcă din nou mai târziu.' },
  oprit: { tone: 'warn', title: 'Alertele nu sunt încă disponibile', text: 'Pornim alertele de preț în curând. Mulțumim pentru răbdare!' },
  respins: { tone: 'warn', title: 'Cererea a fost respinsă', text: 'Nu am putut înregistra cererea. Dacă problema persistă, scrie-ne din formularul de contact.' },
};

/** Outcome of the alert form for visitors without JavaScript (the enhanced form shows it in place). */
export default async function AlertResultPage({ searchParams }: Props) {
  const p = await searchParams;
  const s = STATES[one(p.stare)] ?? STATES.eroare!;
  const slug = one(p.p);
  return (
    <Container className="max-w-xl py-10 sm:py-14">
      <Notice tone={s.tone} title={s.title}>
        <p>{s.text}</p>
        <p>
          {/^[a-z0-9-]{1,200}$/.test(slug) && (
            <>
              <Link href={`/p/${slug}`} className="font-medium text-brand-700 underline">
                Înapoi la produs
              </Link>{' '}
              ·{' '}
            </>
          )}
          <Link href="/alerte" className="font-medium text-brand-700 underline">
            Alertele mele
          </Link>
        </p>
      </Notice>
    </Container>
  );
}
