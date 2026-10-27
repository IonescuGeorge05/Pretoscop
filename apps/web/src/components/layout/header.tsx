import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { t } from '@/lib/i18n';
import { Logo } from './logo';
import { SearchBox } from './search-box';

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <Container className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
        <Logo />
        <SearchBox className="order-3 basis-full md:order-none md:max-w-xl md:flex-1 md:basis-auto" />
        <nav aria-label="Navigare principală" className="ml-auto flex items-center gap-4 text-sm font-medium text-ink-soft">
          <Link href="/reduceri" className="hover:text-brand-700">
            {t('nav.deals')}
          </Link>
          <Link href="/categorii" className="hidden hover:text-brand-700 sm:inline">
            {t('nav.categories')}
          </Link>
        </nav>
      </Container>
    </header>
  );
}
