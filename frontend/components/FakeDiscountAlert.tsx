import { formatLei } from "@/lib/format";
import type { FakeDiscount } from "@/lib/types";

export default function FakeDiscountAlert({ items }: { items: FakeDiscount[] }) {
  if (!items.length) return null;
  return (
    <section
      role="alert"
      className="rounded-xl border-2 border-red-500 bg-red-50 p-4 text-red-950 dark:border-red-600 dark:bg-red-950 dark:text-red-100"
    >
      {items.map((f) => (
        <div key={f.offer_id}>
          <h2 className="font-bold">
            ⚠ Reducere falsă la {f.shop_name}: „-{f.claimed_discount_pct}%” afișat
          </h2>
          <p className="mt-1 text-sm">
            Preț „redus” {formatLei(f.price)}, preț tăiat {formatLei(f.old_price)}.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {f.explanation.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
