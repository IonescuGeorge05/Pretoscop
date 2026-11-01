import { describe, expect, it } from "vitest";

import { compareOffers } from "@/lib/compare";
import type { Offer } from "@/lib/types";

function offer(id: number, shop: string, price: number, shipping: number, months: number): Offer {
  const penalty = Math.round(price * 0.005 * Math.max(0, 24 - months) * 100) / 100;
  const final = price + shipping + penalty;
  return {
    id,
    shop: { slug: shop.toLowerCase(), name: shop, status: "active", shipping_verified: true },
    breakdown: {
      price,
      shipping,
      warranty_months: months,
      warranty_penalty: penalty,
      final_price: final,
      cost_per_warranty_month: months ? final / months : final,
    },
  } as unknown as Offer;
}

describe("comparatorul din browser (site-ul static)", () => {
  it("prețul afișat mai mic poate pierde la prețul final", () => {
    const a = offer(1, "Ieftin", 3300, 30, 12); // transport + garanție scurtă
    const b = offer(2, "Corect", 3350, 0, 24);
    const c = compareOffers(a, b);
    expect(c.winner_offer_id).toBe(2);
    expect(c.explanation).toContain("costurilor ascunse");
    expect(c.diffs.find((d) => d.component === "price")?.diff).toBe(50);
  });

  it("egalitate la preț final", () => {
    expect(compareOffers(offer(1, "A", 3000, 0, 24), offer(2, "B", 3000, 0, 24)).winner_offer_id).toBeNull();
  });
});
