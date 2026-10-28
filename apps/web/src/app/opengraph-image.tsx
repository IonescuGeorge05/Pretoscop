import { ImageResponse } from 'next/og';

/**
 * Default Open Graph image (M16, "static template"), rendered once at build time and used by every
 * page that does not set its own. The rendered text avoids letters outside the bundled font's Latin
 * set (ș, ț), so it never shows missing glyphs; the alt text carries the Romanian diacritics.
 */
export const alt = 'Pretoscop — prețul total real din magazinele online din România, cu istoric';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px', background: 'linear-gradient(180deg, #effaf8 0%, #ffffff 70%)', color: '#0f172a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <svg width="120" height="120" viewBox="0 0 32 32">
            <circle cx="14" cy="14" r="10" fill="none" stroke="#1d7a73" strokeWidth="3" />
            <path d="M8 17 L12 13 L15 15.5 L20 10" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21.5 21.5 L28 28" stroke="#1d7a73" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
          <div style={{ display: 'flex', fontSize: 96, fontWeight: 700 }}>
            Preto<span style={{ color: '#1d7a73' }}>scop</span>
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: '36px', fontSize: 54, fontWeight: 700 }}>Unde e cel mai ieftin, de fapt?</div>
        <div style={{ display: 'flex', marginTop: 'auto', fontSize: 30, color: '#1d7a73' }}>pretoscop.ro</div>
      </div>
    ),
    size,
  );
}
