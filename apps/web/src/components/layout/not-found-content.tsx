import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { t } from '@/lib/i18n';

/**
 * The body of the generic 404 page: the root not-found page (unknown URLs), the (site) not-found
 * boundary, and the server-rendered 404s of the browse pages (`NotFoundResponse`).
 */
export function NotFoundContent() {
  return (
    <Container className="py-20 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="mt-2 text-ink-soft">{t('notFound.body')}</p>
      <p className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 font-semibold">
        <Link href="/" className="text-brand-700 underline">
          {t('notFound.home')}
        </Link>
        <Link href="/categorii" className="text-brand-700 underline">
          Vezi categoriile
        </Link>
      </p>
    </Container>
  );
}
