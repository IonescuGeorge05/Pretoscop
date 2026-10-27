import Catalog from "@/components/Catalog";
import DemoBanner from "@/components/DemoBanner";
import { getProducts } from "@/lib/api";
import { IS_STATIC } from "@/lib/static";

export default async function Home({ searchParams }: { searchParams: { source?: string } }) {
  const source = IS_STATIC ? undefined : searchParams.source; // site static: fără parametri în URL
  const data = await getProducts(source);

  return (
    <>
      <DemoBanner isDemo={data.is_demo} path="/" />
      <p className="max-w-2xl text-sm text-muted">
        Cel mai bun <strong className="text-ink">preț final real</strong> (preț + transport + penalizare pentru garanție
        mai scurtă) din toate magazinele urmărite, plus recomandarea noastră: cumperi acum sau aștepți?
      </p>
      <Catalog families={data.families} products={data.products} source={source} />
    </>
  );
}
