import { NotFoundContent } from '@/components/layout/not-found-content';

/**
 * Not-found boundary of the site pages: with JavaScript, a `NotFoundResponse` hands over to it; the
 * page around it (header, footer) stays. Same content as the server-rendered 404.
 */
export default function SiteNotFound() {
  return <NotFoundContent />;
}
