import Catalog from "@/components/Catalog";
import DemoBanner from "@/components/DemoBanner";
import { getProducts } from "@/lib/api";
import { IS_STATIC } from "@/lib/static";

const PROMISES = [
  ["Preț final, nu preț afișat", "Adunăm transportul și scădem din valoare când garanția e mai scurtă."],
  ["Reducerile false, demascate", "Dacă un magazin a scumpit înainte de „reducere”, îți arătăm."],
  ["Nou, refurbished sau second hand", "Vezi cât economisești și ce garanție pierzi."],
];

export default async function Home({ searchParams }: { searchParams: { source?: string } }) {
  const source = IS_STATIC ? undefined : searchParams.source; // site static: fără parametri în URL
  const data = await getProducts(source);

  return (
    <>
      <DemoBanner isDemo={data.is_demo} path="/" />
      <Catalog families={data.families} products={data.products} source={source} />
      <section className="mt-14 grid gap-5 sm:grid-cols-3">
        {PROMISES.map(([title, text]) => (
          <div key={title} className="rounded-3xl bg-soft p-6">
            <strong className="text-[17px]">{title}</strong>
            <p className="mt-2 leading-relaxed text-muted">{text}</p>
          </div>
        ))}
      </section>
    </>
  );
}
