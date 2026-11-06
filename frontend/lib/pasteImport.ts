// Import de prețuri manuale: din pagina de magazin copiată de proprietar (Ctrl+A, Ctrl+C) scoatem rândurile
// {titlu, link, prețuri}. Produsul și prețul final le decide backend-ul (matcher + plauzibilitate față de MSRP).

export type RawRow = { title: string; url: string | null; prices: string[]; context: string };

// doar titlurile care pot fi ale produselor urmărite; restul paginii (meniu, filtre, accesorii) nu ne interesează
export const FAMILY_RE = /ps\s?5|playstation|switch\s?2|xbox|iphone|galaxy|s26/i;
export const PRICE_RE = /\d+(?:[.\u00a0 ]\d{3})*(?:,\d{1,2})?\s*(?:lei|ron)\b/gi;
const prices = (text: string) => text.match(PRICE_RE) ?? [];
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
// textul unui element cu spații între noduri: „<span>2.899 lei</span><span>Stoc epuizat</span>” nu se lipește
const textOf = (el: Element) => {
  const parts: string[] = [];
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.textContent ?? "");
  return clean(parts.join(" "));
};

/** Din HTML-ul copiat: pentru fiecare link cu titlu de produs, cardul lui = cel mai apropiat strămoș care are un preț
 *  și nu conține alt produs. */
export function fromHtml(html: string): RawRow[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript,svg").forEach((n) => n.remove());
  // „2.299<sup>99</sup> Lei” (eMAG, IT Galaxy) -> „2.299,99 Lei”
  doc.querySelectorAll("sup").forEach((s) => {
    const t = (s.textContent ?? "").trim();
    if (!/^\d{2}$/.test(t)) return;
    const prev = s.previousSibling; // text („2.299<sup>”) sau element („<span>2.299</span><sup>”)
    if (prev && /\d$/.test((prev.textContent ?? "").trimEnd())) {
      prev.textContent = `${(prev.textContent ?? "").trimEnd()},${t}`;
      s.remove();
    } else s.textContent = `,${t}`;
  });
  const titleOf = (a: Element) => clean(a.getAttribute("title") || a.textContent || "");
  const isProductLink = (a: Element) => titleOf(a).length >= 15 && FAMILY_RE.test(titleOf(a));
  const byHref = new Map<string, RawRow>();
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    if (!isProductLink(a)) continue;
    const href = a.getAttribute("href")!;
    let el: Element | null = a.parentElement;
    let card: Element | null = null;
    for (let i = 0; el && i < 10; i++, el = el.parentElement) {
      const others = new Set(Array.from(el.querySelectorAll("a[href]")).filter(isProductLink).map((x) => x.getAttribute("href")));
      if (others.size > 1) break; // am urcat prea sus: aici sunt mai multe produse
      if (prices(textOf(el)).length) {
        card = el;
        break;
      }
    }
    if (!card) continue;
    const text = textOf(card);
    const prev = byHref.get(href);
    const title = titleOf(a);
    if (!prev || title.length > prev.title.length) byHref.set(href, { title, url: href, prices: prices(text), context: text });
  }
  return Array.from(byHref.values());
}

/** Text simplu (fără HTML): un rând cu titlu de produs, apoi prețurile din rândurile de sub el. */
export function fromText(text: string): RawRow[] {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const out: RawRow[] = [];
  lines.forEach((line, i) => {
    if (line.length < 15 || !FAMILY_RE.test(line) || prices(line).length) return;
    const next: string[] = [];
    for (let j = i + 1; j < lines.length && j <= i + 8; j++) {
      if (lines[j].length >= 15 && FAMILY_RE.test(lines[j]) && !prices(lines[j]).length) break;
      next.push(lines[j]);
    }
    const ctx = next.join(" ");
    if (prices(ctx).length) out.push({ title: line, url: null, prices: prices(ctx), context: ctx });
  });
  return out;
}
