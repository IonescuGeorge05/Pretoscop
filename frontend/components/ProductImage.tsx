import { BASE_PATH } from "@/lib/static";

/** Poza produsului, dacă are una (`image_url` în backend/app/seed/models.yaml, fișier în frontend/public/produse/).
 *  Fără poză nu afișăm nimic: nu folosim poze copiate de pe site-urile magazinelor. */
export default function ProductImage({ src, alt, className = "" }: { src: string | null | undefined; alt: string; className?: string }) {
  if (!src) return null;
  const url = src.startsWith("/") ? BASE_PATH + src : src;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- poze mici, statice; merge identic și pe GitHub Pages
    <img src={url} alt={alt} loading="lazy" decoding="async" className={`object-contain ${className}`} />
  );
}
