/**
 * Credit required by the Open Icecat licence wherever Icecat content is shown (M11): "Specs Icecat"
 * with a link to icecat.biz, and the AS IS disclaimer. Rendered when the product's image or
 * specs come from Icecat (`product_images.source` / `product_specs.source` = 'icecat').
 */
export function IcecatCredit({ image, specs }: { image: boolean; specs: boolean }) {
  const what = image && specs ? 'Imagine și date tehnice' : image ? 'Imagine' : 'Date tehnice';
  return (
    <p className="mt-2 text-xs text-muted">
      {what}:{' '}
      <a
        href="https://icecat.biz"
        target="_blank"
        rel="noopener"
        className="underline hover:text-brand-700"
      >
        Specs Icecat
      </a>{' '}
      — furnizate „ca atare”, fără garanție.
    </p>
  );
}
