/**
 * A read-only view of a page, small enough to implement over the browser DOM (content script) and
 * over cheerio (unit tests on fixture pages), so the detectors run the same code on both.
 */
export interface PageEl {
  attr(name: string): string | null;
  text(): string;
  find(selector: string): PageEl[];
  closest(selector: string): PageEl | null;
  same(other: PageEl): boolean;
}

export interface PageDoc {
  /** The page's address (location.href). */
  url: string;
  find(selector: string): PageEl[];
}

function wrap(el: Element): PageEl {
  return {
    attr: (name) => el.getAttribute(name),
    text: () => el.textContent ?? '',
    find: (selector) => Array.from(el.querySelectorAll(selector), wrap),
    closest: (selector) => {
      const c = el.closest(selector);
      return c ? wrap(c) : null;
    },
    same: (other) => (other as unknown as { node?: Element }).node === el,
    node: el,
  } as PageEl & { node: Element };
}

/** The live document, read only (no attribute or node is ever changed through it). */
export function domPage(doc: Document, url: string): PageDoc {
  return { url, find: (selector) => Array.from(doc.querySelectorAll(selector), wrap) };
}
