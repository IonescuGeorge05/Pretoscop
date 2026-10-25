import type { Recommendation } from "@/lib/types";

import { VERDICT_STYLE } from "./VerdictBadge";

export default function RecommendationCard({ rec }: { rec: Recommendation }) {
  const style = VERDICT_STYLE[rec.verdict];
  const pct = Math.round(rec.confidence * 100);
  return (
    <section aria-labelledby="rec-title" className="rounded-xl border border-line bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Recomandarea noastră</p>
      <h2 id="rec-title" className={`mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-2xl font-bold ${style.cls}`}>
        <span aria-hidden>{style.icon}</span>
        {rec.label}
      </h2>

      {rec.verdict !== "INSUFFICIENT_DATA" && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted">
            <span>Încredere</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-line" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Nivel de încredere">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <ul className="mt-4 grid gap-x-8 gap-y-2 text-sm lg:grid-cols-2">
        {rec.reasons.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-muted">
              →
            </span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">⚠ {rec.disclaimer}</p>
    </section>
  );
}
