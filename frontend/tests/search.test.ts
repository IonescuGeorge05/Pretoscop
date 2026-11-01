import { describe, expect, it } from "vitest";

import { searchText } from "@/components/Catalog";

const finds = (query: string, product: string) => {
  const hay = searchText(product);
  return searchText(query).split(" ").every((w) => hay.includes(w));
};

describe("căutarea de pe prima pagină", () => {
  it("prescurtările uzuale găsesc numele complete", () => {
    expect(finds("ps5", "PlayStation 5 Slim Digital Edition, 825 GB")).toBe(true);
    expect(finds("ps 5 pro", "PlayStation 5 Pro, 2 TB")).toBe(true);
    expect(finds("playstation5", "PlayStation 5 Pro, 2 TB")).toBe(true);
    expect(finds("switch 2", "Nintendo Switch 2")).toBe(true);
    expect(finds("iphone 17 promax 1tb", "Apple iPhone 17 Pro Max, 1 TB")).toBe(true);
    expect(finds("s26 ultra", "Samsung Galaxy S26 Ultra, 512 GB")).toBe(true);
    expect(finds("consolă", "PlayStation 5 consola")).toBe(true); // fără diacritice
  });

  it("nu găsește ce nu e", () => {
    expect(finds("ps5", "Xbox Series X (cu unitate disc), 1 TB")).toBe(false);
    expect(finds("iphone 17 pro max 1tb", "Apple iPhone 17 Pro, 1 TB")).toBe(false);
  });
});
