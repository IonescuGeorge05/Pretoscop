import type { MetadataRoute } from "next";
import { unstable_noStore as noStore } from "next/cache";

import { IS_STATIC, siteUrl } from "@/lib/static";

// robots.txt al site-ului nostru: zonele tehnice nu au ce căuta în Google; restul e controlat de NOINDEX (meta)
export default function robots(): MetadataRoute.Robots {
  if (!IS_STATIC) noStore(); // adresa site-ului vine din .env la rulare
  return {
    rules: { userAgent: "*", disallow: ["/admin", "/api/", "/alerte/"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
