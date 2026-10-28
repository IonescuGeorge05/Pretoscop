import type { MetadataRoute } from 'next';

/**
 * Web app manifest (M27): lets people add Pretoscop to the Home Screen, which iOS requires before
 * it allows web notifications (iOS 16.4+). No offline mode and no install prompt of our own.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pretoscop — prețuri totale și istoric',
    short_name: 'Pretoscop',
    description: 'Prețul total real, din toate magazinele, cu istoric. Alerte de preț pe email, în browser sau pe Telegram.',
    lang: 'ro',
    start_url: '/alerte',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1d7a73',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
