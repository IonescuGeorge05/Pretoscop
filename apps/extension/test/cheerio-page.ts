import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import type { PageDoc, PageEl } from '../src/page';

/** The detectors' read-only page view over cheerio, so unit tests run them on fixture files. */
export function cheerioPage(html: string, url: string): PageDoc {
  const $ = load(html);
  type Node = Parameters<typeof $.contains>[0];
  const wrap = (node: Node): PageEl & { node: Node } => {
    const el = $(node);
    return {
      node,
      attr: (name) => el.attr(name) ?? null,
      text: () => el.text(),
      find: (selector) => el.find(selector).toArray().map(wrap),
      closest: (selector) => {
        // Like Element.closest: the element itself counts.
        const c = el.closest(selector).toArray()[0];
        return c ? wrap(c) : null;
      },
      same: (other) => (other as unknown as { node?: Node }).node === node,
    };
  };
  return { url, find: (selector) => $(selector).toArray().map(wrap) };
}

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

/** A file of the repository (fixtures), as text. */
export function repoFile(path: string): string {
  return readFileSync(`${REPO}${path}`, 'utf8');
}

/** The URL a recorded fixture was fetched from (its `.meta.json`). */
export function recordedUrl(path: string): string {
  return (JSON.parse(repoFile(`${path}.meta.json`)) as { url: string }).url;
}
