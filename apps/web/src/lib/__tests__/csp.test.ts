import { describe, expect, it } from 'vitest';
import { ADSENSE_CSP, adsBuildEnabled, contentSecurityPolicy } from '../csp';

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? null;

describe('content security policy (M16, M25)', () => {
  it('a build without an AdSense publisher lets no ad origin in and embeds no frame', () => {
    const csp = contentSecurityPolicy({ dev: false });
    expect(csp).not.toMatch(/googlesyndication|doubleclick|google\.com|adtrafficquality/);
    expect(directive(csp, 'frame-src')).toBeNull();
    expect(directive(csp, 'script-src')).toBe("script-src 'self' 'unsafe-inline'");
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'form-action')).toBe("form-action 'self' https://checkout.stripe.com");
  });

  it('a malformed publisher id does not open the policy', () => {
    expect(adsBuildEnabled('pub-123')).toBe(false);
    expect(adsBuildEnabled(undefined)).toBe(false);
    expect(contentSecurityPolicy({ dev: false, adsenseClient: 'ca-pub-12' })).not.toMatch(/googlesyndication/);
  });

  it('a build with the publisher id allows exactly the ad origins, in the directives they need', () => {
    const csp = contentSecurityPolicy({ dev: false, adsenseClient: 'ca-pub-1234567890123456' });
    for (const o of ADSENSE_CSP.script) expect(directive(csp, 'script-src')).toContain(o);
    for (const o of ADSENSE_CSP.frame) expect(directive(csp, 'frame-src')).toContain(o);
    for (const o of ADSENSE_CSP.img) expect(directive(csp, 'img-src')).toContain(o);
    for (const o of ADSENSE_CSP.connect) expect(directive(csp, 'connect-src')).toContain(o);
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'self'");
  });

  it('keeps Plausible and the media origin, and dev tooling only in dev', () => {
    const csp = contentSecurityPolicy({ dev: true, plausibleScriptUrl: 'https://stats.pretoscop.ro/js/script.js', mediaBaseUrl: 'https://media.pretoscop.ro/x' });
    expect(directive(csp, 'script-src')).toBe("script-src 'self' 'unsafe-inline' 'unsafe-eval' https://stats.pretoscop.ro");
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://stats.pretoscop.ro ws:");
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob: https://media.pretoscop.ro");
    expect(contentSecurityPolicy({ dev: false, plausibleScriptUrl: 'not a url' })).not.toContain('not a url');
  });
});
