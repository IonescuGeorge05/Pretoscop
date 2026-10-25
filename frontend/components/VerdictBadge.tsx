import type { Verdict } from "@/lib/types";

// Stări: verde = bun, chihlimbar = atenție, gri = neutru. Mereu cu etichetă text + simbol, nu doar culoare.
export const VERDICT_STYLE: Record<Verdict, { cls: string; icon: string }> = {
  BUY_NOW: { cls: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200", icon: "✓" },
  UPCOMING_SALE: { cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", icon: "⏳" },
  WAIT: { cls: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200", icon: "✋" },
  NEUTRAL: { cls: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200", icon: "•" },
  INSUFFICIENT_DATA: { cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", icon: "?" },
};

export default function VerdictBadge({ verdict, label }: { verdict: Verdict; label: string }) {
  const s = VERDICT_STYLE[verdict];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {label}
    </span>
  );
}
