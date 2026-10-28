import { ICECAT_ROBOTS_DISALLOW_AGENTS } from '@pretoscop/icecat/attribution';

/**
 * robots.txt policy (M16, docs/03 §6.6, docs/07 §1.8). Pure, so it can be unit-tested.
 *
 * - While the site is not indexable (prototype, staging): everything is disallowed.
 * - Search engines may crawl everything except the click-out redirect, the admin and the APIs. Search
 *   results (`/cauta`) stay crawlable on purpose: they are `noindex, follow` (docs/03 §6.6), which a
 *   crawler can only see if it may fetch them; their facet, sort and page links are `nofollow`.
 * - AI crawlers (model training, datasets and AI answer engines) are refused site-wide: the terms
 *   (/termeni#baza-de-date) reserve text and data mining rights under art. 36² of Law 8/1996 and
 *   art. 4(3) of Directive (EU) 2019/790, and the Open Icecat licence forbids AI training and content
 *   aggregation on its specifications (M11: `ICECAT_ROBOTS_DISALLOW_AGENTS`, at least on /p/*; we
 *   refuse them everywhere). The same reservation is published machine-readably in
 *   /.well-known/tdmrep.json and the `tdm-reservation` header.
 */
export const DISALLOWED_PATHS = ['/out/', '/admin', '/api/'] as const;

/** Product tokens of crawlers that collect content for AI models or AI answers (2026-10). */
const OWN_AI_CRAWLERS = [
  // Training and dataset crawlers
  'GPTBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'ClaudeBot',
  'anthropic-ai',
  'Claude-Web',
  'Bytespider',
  'meta-externalagent',
  'FacebookBot',
  'cohere-ai',
  'cohere-training-data-crawler',
  'Diffbot',
  'Omgilibot',
  'Omgili',
  'ImagesiftBot',
  'AI2Bot',
  'Ai2Bot-Dolma',
  'Timpibot',
  'Webzio-Extended',
  'img2dataset',
  'PanguBot',
  'Kangaroo Bot',
  'Amazonbot',
  // AI answer engines and agents
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-SearchBot',
  'Claude-User',
  'DuckAssistBot',
  'MistralAI-User',
  'YouBot',
] as const;

/**
 * Every crawler refused site-wide: ours plus the Icecat list (M11), each once. Product tokens match
 * case-insensitively (RFC 9309 §2.2.1), so `omgili` and `Omgili` are the same token.
 */
export const AI_CRAWLERS: readonly string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ua of [...OWN_AI_CRAWLERS, ...ICECAT_ROBOTS_DISALLOW_AGENTS]) {
    const key = ua.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ua);
  }
  return out;
})();

export function robotsTxt(opts: { indexable: boolean; baseUrl: string }): string {
  const base = opts.baseUrl.replace(/\/+$/, '');
  if (!opts.indexable) {
    return ['# Pretoscop (prototype/staging): not open to crawlers yet.', 'User-agent: *', 'Disallow: /', ''].join('\n');
  }
  return [
    '# Pretoscop — https://pretoscop.ro',
    '# Text and data mining rights are reserved (Law 8/1996 art. 36², Directive (EU) 2019/790 art. 4(3)):',
    `# ${base}/termeni#baza-de-date · machine-readable: ${base}/.well-known/tdmrep.json`,
    '# AI crawlers are refused everywhere, also as the Open Icecat licence requires for product data.',
    '',
    ...AI_CRAWLERS.map((ua) => `User-agent: ${ua}`),
    'Disallow: /',
    '',
    'User-agent: *',
    ...DISALLOWED_PATHS.map((p) => `Disallow: ${p}`),
    'Allow: /',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}
