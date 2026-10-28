import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/legal/legal-page';
import { MerchantLoginForm } from '@/components/merchant/login-form';
import { Container } from '@/components/ui/container';

export const metadata: Metadata = {
  title: 'Autentificare pentru magazine',
  description: 'Intră în contul magazinului tău pe Pretoscop cu un link primit pe email.',
  robots: { index: false, follow: false },
};

export default function MerchantLoginPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pentru magazine"
        title="Contul magazinului"
        lead="Primești un link de autentificare pe email; nu ai nevoie de parolă. Dacă nu ai încă un cont, îl creăm la prima autentificare."
      />
      <Container className="grid gap-10 py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="max-w-xl">
          <MerchantLoginForm />
        </div>
        <aside className="space-y-3 rounded-[var(--radius-card)] bg-surface p-4 text-sm text-ink-soft ring-1 ring-line sm:p-5" aria-label="Despre listare">
          <p>Listarea este gratuită. Ai nevoie de feed-ul de produse pe care îl folosești deja (Google Merchant, compari.ro sau CSV).</p>
          <p>
            Citește <Link href="/pentru-magazine/termeni" className="font-medium text-brand-700 underline">Termenii pentru magazine</Link> și{' '}
            <Link href="/cum-functioneaza" className="font-medium text-brand-700 underline">cum ordonăm ofertele</Link>.
          </p>
        </aside>
      </Container>
    </>
  );
}
