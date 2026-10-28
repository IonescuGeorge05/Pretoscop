import { ImageResponse } from 'next/og';

// Home Screen icon (iOS needs a PNG; Web Push on iPhone works only from the Home Screen app, M27).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        <svg width="150" height="150" viewBox="0 0 32 32">
          <circle cx="14" cy="14" r="10" fill="none" stroke="#1d7a73" strokeWidth="3" />
          <path d="M8 17 L12 13 L15 15.5 L20 10" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21.5 21.5 L28 28" stroke="#1d7a73" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
