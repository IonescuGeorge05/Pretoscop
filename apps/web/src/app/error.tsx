'use client';

import { Container } from '@/components/ui/container';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container className="py-20 text-center">
      <h1 className="text-2xl font-bold">A apărut o eroare</h1>
      <p className="mt-2 text-ink-soft">Nu am putut încărca pagina. Încearcă din nou peste câteva momente.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white">
        Încearcă din nou
      </button>
    </Container>
  );
}
