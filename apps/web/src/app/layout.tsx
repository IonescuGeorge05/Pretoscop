import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ConsentBanner } from '@/components/consent/consent';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { serverEnv } from '@/lib/db';
import { t } from '@/lib/i18n';
import './globals.css';

export function generateMetadata(): Metadata {
  const env = serverEnv();
  return {
    metadataBase: new URL(env.PUBLIC_BASE_URL),
    title: { default: `${t('site.name')} — ${t('site.tagline')}`, template: `%s | ${t('site.name')}` },
    description: t('site.description'),
    applicationName: t('site.name'),
    robots: env.SITE_INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { siteName: t('site.name'), locale: 'ro_RO', type: 'website' },
    alternates: { languages: { ro: '/' } },
  };
}

export const viewport: Viewport = { themeColor: '#1d7a73', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ro">
      <body className="flex min-h-screen flex-col antialiased">
        <a href="#continut" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Sari la conținut
        </a>
        <Header />
        <main id="continut" className="flex-1">
          {children}
        </main>
        <Footer />
        <ConsentBanner />
      </body>
    </html>
  );
}
