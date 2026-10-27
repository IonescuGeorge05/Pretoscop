import type { Metadata } from "next";

import Catalog from "@/components/Catalog";
import DemoBanner from "@/components/DemoBanner";
import { getProducts } from "@/lib/api";
import { IS_STATIC } from "@/lib/static";

export const metadata: Metadata = {
  title: "Second hand și refurbished",
  description: "Refurbished cu garanție și anunțuri second hand pentru toate modelele, inclusiv cele care nu se mai fabrică.",
};

// aceeași listă ca prima pagină, deschisă direct pe fila „Second hand și refurbished” (link de trimis)
export default async function SecondHand({ searchParams }: { searchParams: { source?: string } }) {
  const source = IS_STATIC ? undefined : searchParams.source;
  const data = await getProducts(source);
  return (
    <>
      <DemoBanner isDemo={data.is_demo} path="/second-hand" />
      <Catalog families={data.families} products={data.products} source={source} initialTab="used" />
    </>
  );
}
