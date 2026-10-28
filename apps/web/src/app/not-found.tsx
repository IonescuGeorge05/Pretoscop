import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { NotFoundContent } from '@/components/layout/not-found-content';

/** 404 for URLs that match no route (rendered outside the (site) layout, so it brings its own shell). */
export default function NotFound() {
  return (
    <>
      <Header />
      <main id="continut" className="flex-1">
        <NotFoundContent />
      </main>
      <Footer />
    </>
  );
}
