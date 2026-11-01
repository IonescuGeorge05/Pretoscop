export type AdminProduct = { slug: string; name: string; family: string; retired: boolean };

/** Opțiunile listei de produse din admin, grupate pe familii (modelele actuale întâi, apoi cele retrase). */
export default function ProductOptions({ products }: { products: AdminProduct[] }) {
  const families = Array.from(new Set(products.map((p) => p.family)));
  return (
    <>
      {families.map((f) => (
        <optgroup key={f} label={f}>
          {products
            .filter((p) => p.family === f)
            .map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
                {p.retired ? " — nu se mai fabrică" : ""}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}
