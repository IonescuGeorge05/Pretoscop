/** Small text helpers shared by extractors (no I/O). */

export function collapse(text: string | undefined | null): string {
  return (text ?? '').replace(/[\s\u00a0\u202f]+/g, ' ').trim();
}

export function nonEmpty(text: string | undefined | null): string | undefined {
  const t = collapse(text);
  return t === '' ? undefined : t;
}

export function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Resolves `href` against `base`; returns undefined for javascript:, mailto: and junk. */
export function absoluteUrl(href: string | undefined | null, base: string): string | undefined {
  if (!href) return undefined;
  const h = href.trim();
  if (h === '' || /^(javascript|mailto|tel|data):/i.test(h)) return undefined;
  try {
    return new URL(h.startsWith('//') ? `https:${h}` : h, base).toString();
  } catch {
    return undefined;
  }
}

/** Drops tracking parameters and fragments so one product has one URL. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|gclid|fbclid|ref$|ref_|X-|cmpid|mc_)/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** ASCII-folds and slugifies the way most shops build URL slugs. */
export function slugLike(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șşȘŞ]/g, 's')
    .replace(/[țţȚŢ]/g, 't')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extracts the balanced JSON/JS value (object or array) starting at `start` (which must point at
 * `{` or `[`), honouring strings and escapes. Returns the text or undefined if unbalanced.
 */
export function extractBalanced(s: string, start: number): string | undefined {
  const open = s[start];
  if (open !== '{' && open !== '[') return undefined;
  let depth = 0;
  let inString: string | null = null;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      continue;
    }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return undefined;
}

/** Finds `marker` (e.g. `EM.multiple_offers =`) and parses the JSON value that follows. */
export function jsonAfter(s: string, marker: string): unknown {
  const at = s.indexOf(marker);
  if (at < 0) return undefined;
  const re = /[[{]/g;
  re.lastIndex = at + marker.length;
  const m = re.exec(s);
  if (!m) return undefined;
  const text = extractBalanced(s, m.index);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** "Homepage > TV si Electronice > Televizoare" → "TV si Electronice > Televizoare". */
export function withoutHomeCrumb(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const parts = path.split(' > ').filter((p, i) => !(i === 0 && /^(home(page)?|acas[aă]|prima pagin[aă]|carrefour|dedeman)$/i.test(p.trim())));
  return parts.length > 0 ? parts.join(' > ') : undefined;
}

/** Parses JSON that shops sometimes serve slightly broken (raw newlines, trailing commas). */
export function lenientJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/^\s*<!--|-->\s*$/g, '')
      // eslint-disable-next-line no-control-regex -- strip raw control characters from broken JSON
      .replace(/[\u0000-\u001f]+/g, ' ')
      .replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(cleaned);
    } catch {
      return undefined;
    }
  }
}

const NAMED_ENTITIES: Record<string, string> = { quot: '"', amp: '&', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

/**
 * Decodes the HTML entities some shops leave inside JSON-LD strings (forit writes `32&quot;`):
 * a script's text is not HTML-decoded, so the literal entity would end up in the title.
 */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (m, code: string) => {
    const c = code.toLowerCase();
    if (c.startsWith('#x')) return safeCodePoint(Number.parseInt(c.slice(2), 16)) ?? m;
    if (c.startsWith('#')) return safeCodePoint(Number.parseInt(c.slice(1), 10)) ?? m;
    return NAMED_ENTITIES[c] ?? m;
  });
}

function safeCodePoint(n: number): string | undefined {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : undefined;
}

export function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return nonEmpty(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A price value as found in structured data: numbers and plain decimals are machine format. */
export function priceFormatOf(v: unknown): 'decimal' | undefined {
  if (typeof v === 'number') return 'decimal';
  if (typeof v === 'string' && /^\s*\d+(\.\d{1,2})?\s*$/.test(v)) return 'decimal';
  return undefined;
}
