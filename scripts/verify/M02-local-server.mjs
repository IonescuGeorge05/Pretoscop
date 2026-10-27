// Local stand-in shop for `scripts/verify/M02.sh` (no live requests). Serves a robots.txt and a
// product page on 127.0.0.1, prints its port on the first line of stdout, and appends one line
// per request (`<epoch ms> <path> <user-agent>`) to the file given as the first argument.
import { appendFileSync } from 'node:fs';
import http from 'node:http';

const hitsFile = process.argv[2];
const robots = [
  'User-agent: *',
  'Disallow: /cart',
  'Disallow: /checkout',
  'Disallow: /*?q=',
  '',
  'User-agent: bot/',
  'User-agent: crawl',
  'Disallow: /',
  '',
  'Sitemap: http://127.0.0.1/sitemap.xml',
  '',
].join('\n');

const server = http.createServer((req, res) => {
  if (hitsFile) appendFileSync(hitsFile, `${Date.now()} ${req.url} ${req.headers['user-agent'] ?? ''}\n`);
  if (req.url === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(robots);
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><head><title>Produs</title></head><body>2.199,99 lei</body></html>');
});

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`${server.address().port}\n`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
