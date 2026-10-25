import type { Metadata } from "next";

import { getProducts } from "@/lib/api";

import UnmatchedReview from "./UnmatchedReview";

export const metadata: Metadata = { title: "Admin — anunțuri nepotrivite", robots: { index: false } };

export default async function AdminPage() {
  const { products } = await getProducts();
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
      <h2 className="mt-4 text-lg font-semibold">Anunțuri nepotrivite</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Anunțuri pe care regulile nu le-au putut asocia sigur unui model (de ex. „Slim, 1TB” fără „Disc” sau
        „Digital”). Alege modelul și apasă <strong className="text-ink">Asociază</strong>: oferta apare imediat, iar la
        scrape-urile următoare anunțul e recunoscut automat. <strong className="text-ink">Ignoră</strong> pentru anunțuri
        care nu sunt console PS5 (PS4 modat, accesorii etc.).
      </p>
      <UnmatchedReview products={products.map((p) => ({ slug: p.slug, name: p.name }))} />
    </>
  );
}
