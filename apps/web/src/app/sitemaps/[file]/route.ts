import { pagesSitemap, readSitemapFile } from '@/lib/sitemap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const XML = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=3600' };

/** GET /sitemaps/pages.xml (built here) or a file written by the worker's `sitemap.build`. */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await ctx.params;
  if (file === 'pages.xml') return new Response((await pagesSitemap()).xml, { headers: XML });
  const xml = await readSitemapFile(file);
  return xml ? new Response(xml, { headers: XML }) : new Response('not found', { status: 404 });
}
