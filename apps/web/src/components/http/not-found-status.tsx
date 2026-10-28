import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

function RaiseNotFound(): never {
  notFound();
}

/**
 * Server-rendered 404 (M16). A `notFound()` thrown while a page renders escapes to the top of the
 * server render (React's server renderer has no error boundaries), so Next.js answers 404 with an
 * empty `<html id="__next_error__">` document and draws the not-found UI only after JavaScript runs:
 * visitors without JavaScript, and many crawlers, see a blank page.
 *
 * Instead, a page renders its not-found content itself and adds this element: the `notFound()` inside
 * the Suspense boundary still sets the 404 status and the `noindex` robots tag, while the content
 * outside the boundary stays in the HTML. With JavaScript, the boundary hands over to the nearest
 * `not-found.tsx`, which shows the same content (keep the two in sync by rendering the same component).
 */
export function NotFoundResponse({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <RaiseNotFound />
      </Suspense>
    </>
  );
}
