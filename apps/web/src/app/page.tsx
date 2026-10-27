import Link from 'next/link';
import { SearchBox } from '@/components/layout/search-box';
import { Container } from '@/components/ui/container';

export const revalidate = 600;

const promises = [
  ['Prețul total, nu doar prețul afișat', 'Clasăm ofertele după preț + livrare și arătăm mereu calculul.'],
  ['Istoric observat de noi', 'Fiecare preț are data la care l-am văzut. Nu completăm și nu ghicim golurile.'],
  ['Reduceri verificate', 'Arătăm „-X%” doar față de minimul nostru din ultimele 30 de zile.'],
] as const;

export default function HomePage() {
  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-brand-50 to-white">
        <Container className="py-12 sm:py-16">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Unde e cel mai ieftin, <span className="text-brand-700">de fapt</span>?
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">
            Compară prețul total din magazinele online din România și vezi cum a evoluat prețul înainte să cumperi.
          </p>
          <SearchBox className="mt-6 max-w-2xl" />
        </Container>
      </section>
      <Container className="grid gap-4 py-10 sm:grid-cols-3">
        {promises.map(([title, body]) => (
          <div key={title} className="rounded-[var(--radius-card)] bg-surface p-5 ring-1 ring-line">
            <h2 className="font-semibold text-ink">{title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{body}</p>
          </div>
        ))}
      </Container>
      <Container className="pb-4 text-sm text-muted">
        <Link href="/cum-functioneaza" className="text-brand-700 underline">
          Cum funcționează clasamentul și de unde vin prețurile
        </Link>
      </Container>
    </>
  );
}
