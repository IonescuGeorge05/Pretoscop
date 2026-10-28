import { describe, expect, it } from 'vitest';
import { deviceLabel } from '../device-label';
import { isCrossSite } from '../same-origin';

describe('push and Telegram routes (M27)', () => {
  it('refuse requests from another site: Sec-Fetch-Site, a foreign or opaque Origin', () => {
    const h = (init: Record<string, string>) => new Headers({ host: 'pretoscop.ro', ...init });
    expect(isCrossSite(h({ 'sec-fetch-site': 'cross-site' }))).toBe(true);
    expect(isCrossSite(h({ origin: 'https://evil.example' }))).toBe(true);
    expect(isCrossSite(h({ origin: 'https://stats.pretoscop.ro', 'sec-fetch-site': 'same-site' }))).toBe(true);
    expect(isCrossSite(h({ origin: 'null' }))).toBe(true);
    expect(isCrossSite(h({ origin: 'not a url' }))).toBe(true);
    expect(isCrossSite(h({ origin: 'https://pretoscop.ro', 'sec-fetch-site': 'same-origin' }))).toBe(false);
    expect(isCrossSite(new Headers({ host: 'localhost:3480', origin: 'http://localhost:3480' }))).toBe(false);
    expect(isCrossSite(h({}))).toBe(false); // no browser headers: the session check decides
  });

  it('keeps only a browser and system label from the User-Agent', () => {
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36')).toBe('Chrome · Android');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari · iOS');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0')).toBe('Edge · Windows');
    expect(deviceLabel('Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0')).toBe('Firefox · Linux');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36')).toBe('Samsung Internet · Android');
    expect(deviceLabel(null)).toBe('Browser · alt sistem');
  });
});
