import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
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
    twitter: { card: 'summary_large_image' },
    // No site-wide alternates: each page declares its own canonical and hreflang ro-RO (M16).
    // TDM reservation (Law 8/1996 art. 36², Directive 2019/790 art. 4(3)), also in /.well-known/tdmrep.json.
    other: { 'tdm-reservation': '1' },
  };
}

export const viewport: Viewport = { themeColor: '#1d7a73', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ro">
      <body className="flex min-h-screen flex-col antialiased">{children}</body>
    </html>
  );
}
