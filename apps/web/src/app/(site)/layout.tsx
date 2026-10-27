import type { ReactNode } from 'react';
import { ConsentBanner } from '@/components/consent/consent';
import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#continut" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Sari la conținut
      </a>
      <Header />
      <main id="continut" className="flex-1">
        {children}
      </main>
      <Footer />
      <ConsentBanner />
    </>
  );
}
