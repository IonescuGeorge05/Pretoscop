import Link from 'next/link';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { Container } from '@/components/ui/container';
import { t } from '@/lib/i18n';

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="continut" className="flex-1">
    <Container className="py-20 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="mt-2 text-ink-soft">{t('notFound.body')}</p>
      <Link href="/" className="mt-6 inline-block font-semibold text-brand-700 underline">
        {t('notFound.home')}
      </Link>
    </Container>
      </main>
      <Footer />
    </>
  );
}
