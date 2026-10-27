import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function AdminRoot({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-surface">{children}</div>;
}
