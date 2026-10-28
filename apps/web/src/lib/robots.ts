/**
 * robots.txt policy (M16, docs/03 §6.6, docs/07 §1.8). Pure, so it can be unit-tested.
 *
 * - While the site is not indexable (prototype, staging): everything is disallowed.
 * - Search engines may crawl everything except the click-out redirect, the admin, the APIs and the
 *   search results (`/cauta` is noindex and its facet links form an endless URL space; every product
 *   is reachable through category, brand and shop pages and the sitemaps).
 * - AI crawlers (model training, datasets and AI answer engines) are refused site-wide: the terms
 *   (/termeni#baza-de-date) reserve text and data mining rights under art. 36² of Law 8/1996 and
 *   art. 4(3) of Directive (EU) 2019/790, and the Open Icecat licence forbids AI training on its
 *   specifications. The same reservation is published machine-readably in /.well-known/tdmrep.json
 *   and the `tdm-reservation` header.
 */
export const DISALLOWED_PATHS = ['/out/', '/admin', '/api/', '/cauta'] as const;

/** Product tokens of crawlers that collect content for AI models or AI answers (2026-10). */
export const AI_CRAWLERS = [
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

export function robotsTxt(opts: { indexable: boolean; baseUrl: string }): string {
  const base = opts.baseUrl.replace(/\/+$/, '');
  if (!opts.indexable) {
    return ['# Pretoscop (prototype/staging): not open to crawlers yet.', 'User-agent: *', 'Disallow: /', ''].join('\n');
  }
  return [
    '# Pretoscop — https://pretoscop.ro',
    '# Text and data mining rights are reserved (Law 8/1996 art. 36², Directive (EU) 2019/790 art. 4(3)):',
    `# ${base}/termeni#baza-de-date · machine-readable: ${base}/.well-known/tdmrep.json`,
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
