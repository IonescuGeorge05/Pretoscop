import { cn } from '@/lib/cn';

const MEDIA_BASE = process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? '/media';

/**
 * Product image from a licensed source only (ADR-008): `storageKey` points at our own copy
 * (`images/…`). Without one we show a neutral placeholder — never a shop's image.
 */
export function ProductImage({
  storageKey,
  alt,
  size = 400,
  className,
  priority = false,
}: {
  storageKey?: string | null;
  alt: string;
  size?: 120 | 400 | 800;
  className?: string;
  priority?: boolean;
}) {
  if (!storageKey) {
    return (
      <div className={cn('flex aspect-square items-center justify-center rounded-lg bg-surface ring-1 ring-line', className)} role="img" aria-label={`${alt} (fără imagine)`}>
        <svg viewBox="0 0 48 48" className="w-1/3 text-slate-300" aria-hidden>
          <rect x="6" y="10" width="36" height="28" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
          <circle cx="18" cy="21" r="4" fill="currentColor" />
          <path d="M10 35 L22 25 L30 31 L36 26 L40 30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  const src = `${MEDIA_BASE}/${storageKey.replace(/(\.[a-z]+)$/i, `_${size}$1`)}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- derivatives are pre-sized; no optimizer needed
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('aspect-square rounded-lg bg-white object-contain ring-1 ring-line', className)}
    />
  );
}
