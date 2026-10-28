import Link from 'next/link';
import { SearchBox } from '@/components/layout/search-box';
import { Container } from '@/components/ui/container';

/**
 * 404 for a product that does not exist or was removed (hidden by an admin). Merged products never
 * get here: they redirect (308) to the product they were merged into. Next.js marks this noindex.
 */
export default function ProductNotFound() {
  return (
    <Container className="py-16">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-bold">Produsul nu mai este disponibil pe Pretoscop</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        Poate a fost retras din magazine, înlocuit de un model nou sau unit cu altă pagină. Caută-l după nume, model sau cod EAN:
      </p>
      <SearchBox className="mt-5 max-w-xl" />
      <p className="mt-6 text-sm">
        <Link href="/categorii" className="font-semibold text-brand-700 underline">
          Vezi categoriile
        </Link>{' '}
        ·{' '}
        <Link href="/reduceri" className="font-semibold text-brand-700 underline">
          Reduceri verificate
        </Link>
      </p>
    </Container>
  );
}
