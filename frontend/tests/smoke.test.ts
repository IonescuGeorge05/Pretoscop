/**
 * Test „de fum” pe site-ul pornit: fiecare pagină importantă și câte un produs din fiecare familie se deschid fără eroare.
 *   SMOKE_URL=http://localhost:3000 npm run test:smoke
 * Fără SMOKE_URL testul e sărit (ex. în CI, unde nu rulează stack-ul).
 */
import { describe, expect, it } from "vitest";

const BASE = process.env.SMOKE_URL?.replace(/\/$/, "");

const PAGES = [
  "/",
  "/second-hand",
  "/reduceri",
  "/black-friday",
  "/despre",
  "/bot",
  "/pentru-magazine",
  "/termeni",
  "/confidentialitate",
  "/cum-castigam-bani",
  "/alerte/confirmat",
  "/admin",
];

async function page(path: string) {
  const res = await fetch(BASE + path);
  return { status: res.status, html: await res.text() };
}

function expectHealthy(html: string) {
  expect(html).toContain("<h1");
  expect(html).not.toMatch(/Application error|Internal Server Error|Unhandled Runtime Error/);
}

describe.skipIf(!BASE)("site pornit", () => {
  it.each(PAGES)("%s se deschide", async (path) => {
    const { status, html } = await page(path);
    expect(status).toBe(200);
    expectHealthy(html);
  });

  it("câte un produs din fiecare familie (și unul retras)", async () => {
    const list = await (await fetch(`${BASE}/api/products`)).json();
    const picks = new Map<string, { family_slug: string; slug: string; name: string }>();
    for (const p of list.products) {
      const key = `${p.family_slug}:${p.lifecycle === "retired" ? "retras" : "actual"}`;
      if (!picks.has(key)) picks.set(key, p);
    }
    expect(picks.size).toBeGreaterThanOrEqual(list.families.length);
    for (const p of picks.values()) {
      const { status, html } = await page(`/${p.family_slug}/${p.slug}`);
      expect(status, p.slug).toBe(200);
      expectHealthy(html);
      expect(html).toContain(p.name.replace(/&/g, "&amp;"));
    }
  }, 60_000);

  it("pagina inexistentă dă 404, nu eroare", async () => {
    expect((await page("/ps5/nu-exista")).status).toBe(404);
  });
});
