import type { MetadataRoute } from "next";
import { unstable_noStore as noStore } from "next/cache";

import { getProducts } from "@/lib/api";
import { IS_STATIC, siteUrl } from "@/lib/static";

const PAGES = [
  "/",
  "/second-hand",
  "/reduceri",
  "/black-friday",
  "/despre",
  "/cum-castigam-bani",
  "/pentru-magazine",
  "/bot",
  "/termeni",
  "/confidentialitate",
];

/** Lista paginilor pentru motoarele de căutare: paginile fixe + fiecare produs. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!IS_STATIC) noStore(); // produsele și adresa site-ului se citesc la rulare
  const base = siteUrl();
  const { products } = await getProducts().catch(() => ({ products: [] as { family_slug: string; slug: string }[] }));
  const trail = process.env.NEXT_PUBLIC_STATIC === "1" ? "/" : ""; // site-ul static folosește trailingSlash
  return [
    ...PAGES.map((p) => ({ url: base + (p === "/" ? "/" : p + trail), changeFrequency: "daily" as const })),
    ...products.map((p) => ({ url: `${base}/${p.family_slug}/${p.slug}${trail}`, changeFrequency: "daily" as const })),
  ];
}
