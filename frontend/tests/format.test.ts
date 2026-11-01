import { describe, expect, it } from "vitest";

import { categoryLabel, formatLeiShort, formatStorage, productHref, variantLabel, vsMsrp, withSource } from "@/lib/format";

// spațiul dintre mii poate fi un spațiu special (Intl): comparăm fără spații
const flat = (s: string) => s.replace(/\s/g, "");

describe("formatare", () => {
  it("prețuri în lei, cu punct la mii", () => {
    expect(flat(formatLeiShort(3399.9))).toBe("3.400lei");
  });

  it("stocarea în GB / TB", () => {
    expect(formatStorage(825)).toBe("825 GB");
    expect(formatStorage(1000)).toBe("1 TB");
    expect(formatStorage(2000)).toBe("2 TB");
  });

  it("eticheta variantei pentru fiecare familie", () => {
    expect(variantLabel({ edition: "digital", storage_gb: 825 })).toBe("Digital · 825 GB");
    expect(variantLabel({ edition: "series-x", storage_gb: 1000 })).toBe("Series X cu unitate disc · 1 TB");
    expect(variantLabel({ edition: "e", storage_gb: 256 })).toBe("17e · 256 GB");
    expect(variantLabel({ edition: "necunoscut", storage_gb: 256 })).toBe("necunoscut · 256 GB");
  });

  it("diferența față de MSRP, cu virgulă", () => {
    expect(vsMsrp(3000, 3209)).toBe("-6,5% față de MSRP");
    expect(vsMsrp(4000, 3209)).toBe("+24,6% față de MSRP");
  });

  it("linkuri de produs și sursa datelor", () => {
    expect(productHref({ family_slug: "ps5", slug: "ps5-pro-2tb" })).toBe("/ps5/ps5-pro-2tb");
    expect(withSource("/ps5/ps5-pro-2tb", "real")).toBe("/ps5/ps5-pro-2tb?source=real");
    expect(categoryLabel("console")).toBe("Console");
    expect(categoryLabel("altceva")).toBe("Altele");
  });
});
