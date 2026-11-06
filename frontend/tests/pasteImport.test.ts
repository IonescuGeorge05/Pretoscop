import { describe, expect, it } from "vitest";

import { fromText } from "@/lib/pasteImport";

describe("import din text copiat", () => {
  it("leagă titlul de prețurile de sub el și ignoră restul paginii", () => {
    const text = [
      "Console și accesorii",
      "Filtrează după preț: 100 lei - 5.000 lei",
      "Consola PlayStation 5 Slim Digital Edition, 1TB, D-Chassis",
      "4.7 (312)",
      "2.599,99 Lei",
      "2.299,99 Lei",
      "Controller DualSense Midnight Black",
      "349,99 Lei",
      "Consola Nintendo Switch 2, 256GB",
      "în stoc",
      "2 699 lei",
    ].join("\n");
    expect(fromText(text).map((r) => [r.title, r.prices])).toEqual([
      ["Consola PlayStation 5 Slim Digital Edition, 1TB, D-Chassis", ["2.599,99 Lei", "2.299,99 Lei", "349,99 Lei"]],
      ["Consola Nintendo Switch 2, 256GB", ["2 699 lei"]],
    ]);
  });
});
