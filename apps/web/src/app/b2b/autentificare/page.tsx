import type { Metadata } from 'next';
import Link from 'next/link';
import { MerchantLoginForm } from '@/components/merchant/login-form';

export const metadata: Metadata = { title: 'Autentificare' };

export default function B2bLoginPage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="max-w-xl">
        <h1 className="mb-2 text-xl font-bold">Analize de preț pentru companii</h1>
        <p className="mb-5 text-[15px] text-ink-soft">
          Intră cu adresa de email la care ai primit invitația. Îți trimitem un link de autentificare; nu ai nevoie de parolă.
        </p>
        <MerchantLoginForm callbackURL="/b2b" hint="Folosește adresa de email la care ai fost invitat în spațiul de lucru al firmei." />
      </div>
      <aside className="space-y-3 rounded-[var(--radius-card)] bg-white p-4 text-sm text-ink-soft ring-1 ring-line sm:p-5" aria-label="Despre serviciu">
        <p>Poziția prețurilor tale față de concurență, istoricul observat de noi, un rezumat zilnic pe email, export CSV și API.</p>
        <p>
          Datele se folosesc doar intern, după <Link href="/pentru-companii/termeni" className="font-medium text-brand-700 underline">Termenii pentru clienții B2B</Link>.
        </p>
      </aside>
    </div>
  );
}
