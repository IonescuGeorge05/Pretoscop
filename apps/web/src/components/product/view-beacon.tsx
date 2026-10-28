'use client';

import { useEffect } from 'react';
import { track } from '@/lib/track';

/**
 * One `product_view` event per page view (no cookies; daily-salted session hash on the server).
 * Views feed the nightly popularity score that orders category and brand pages (docs/03 §6.6).
 */
export function ViewBeacon({ productId }: { productId: number }) {
  useEffect(() => {
    track('product_view', { product: productId });
  }, [productId]);
  return null;
}
