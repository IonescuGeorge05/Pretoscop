import Link from 'next/link';
import { Container } from '@/components/ui/container';
import { t } from '@/lib/i18n';
import { Logo } from './logo';

const columns = [
  {
    title: 'Pretoscop',
    links: [
      ['/despre', t('footer.about')],
      ['/cum-functioneaza', t('footer.how')],
      ['/cum-castigam-bani', t('footer.money')],
      ['/metodologie', t('footer.method')],
    ],
  },
  {
    title: 'Magazine',
    links: [
      ['/pentru-magazine', t('footer.merchants')],
      ['/bot', t('footer.bot')],
      ['/contact', t('footer.contact')],
    ],
  },
  {
    title: 'Legal',
    links: [
      ['/termeni', t('footer.terms')],
      ['/confidentialitate', t('footer.privacy')],
      ['/cookies', t('footer.cookies')],
      ['/accesibilitate', t('footer.accessibility')],
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <Container className="grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted">{t('site.tagline')}.</p>
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title} className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">{col.title}</h2>
            <ul className="space-y-1.5 text-sm text-ink-soft">
              {col.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-brand-700">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <Container className="border-t border-line py-5 text-xs leading-relaxed text-muted">
        <p>{t('footer.disclaimer')}</p>
        <p className="mt-2">© {new Date().getFullYear()} Pretoscop. Prețuri în lei, cu TVA inclus.</p>
      </Container>
    </footer>
  );
}
