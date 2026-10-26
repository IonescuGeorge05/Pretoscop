import Link from "next/link";

import { getSnapshotMeta } from "@/lib/api";
import { IS_STATIC } from "@/lib/static";

export default async function DemoBanner({
  isDemo,
  path,
  availableSources,
}: {
  isDemo: boolean;
  path: string;
  availableSources?: string[];
}) {
  if (IS_STATIC) {
    const meta = await getSnapshotMeta();
    const when = meta ? new Date(meta.generated_at).toLocaleString("ro-RO", { dateStyle: "long", timeStyle: "short" }) : null;
    return (
      <div className="mb-5 rounded-lg border border-line bg-card px-4 py-3 text-sm text-muted">
        {meta?.source === "mock" ? <strong className="text-ink">Date demo. </strong> : "Date reale colectate din magazine. "}
        Prototip — prețurile se actualizează periodic{when ? `; ultima actualizare: ${when}` : ""}.
      </div>
    );
  }
  const hasReal = !availableSources || availableSources.includes("real");
  if (isDemo) {
    return (
      <div className="mb-5 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100">
        <strong>Date demo.</strong> Prețurile și istoricul de pe această pagină sunt sintetice, generate pentru demonstrație.{" "}
        {hasReal && (
          <Link href={`${path}?source=real`} className="underline">
            Vezi datele reale colectate
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="mb-5 rounded-lg border border-line bg-card px-4 py-3 text-sm text-muted">
      Date reale colectate din magazine.{" "}
      <Link href={`${path}?source=mock`} className="underline">
        Vezi datele demo
      </Link>
    </div>
  );
}
