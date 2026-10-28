/**
 * JSON-LD block. `<` is escaped so a product title can never close the script element; this is
 * the only inline script the site renders (docs/03 §10: no inline scripts except JSON-LD).
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
