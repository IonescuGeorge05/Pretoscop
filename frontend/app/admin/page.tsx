import type { Metadata } from "next";

import { getProducts } from "@/lib/api";
import { IS_STATIC } from "@/lib/static";

import UnmatchedReview from "./UnmatchedReview";

export const metadata: Metadata = { title: "Admin — anunțuri nepotrivite", robots: { index: false } };

export default async function AdminPage() {
  if (IS_STATIC) {
    return <p className="py-16 text-center text-muted">Pagina de admin e disponibilă doar în aplicația locală.</p>;
  }
  const { products, families } = await getProducts();
  // în ordinea familiilor de pe site; în fiecare familie, modelele actuale întâi
  const order = (family: string) => families.findIndex((f) => f.family === family);
  const adminProducts = products
    .map((p) => ({ slug: p.slug, name: p.name, family: p.family, retired: p.lifecycle === "retired" }))
    .sort((a, b) => order(a.family) - order(b.family) || Number(a.retired) - Number(b.retired));
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
      <UnmatchedReview products={adminProducts} />
    </>
  );
}
