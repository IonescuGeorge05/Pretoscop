import type { Recommendation, Verdict } from "@/lib/types";

// verdictul spus pe înțelesul oricui + o culoare de fundal per verdict (textul rămâne lizibil în ambele teme)
const HERO: Record<Verdict, { title: string; cls: string; iconCls: string }> = {
  BUY_NOW: {
    title: "E un preț bun. Poți cumpăra.",
    cls: "bg-green-100 text-green-950 dark:bg-green-950/70 dark:text-green-50",
    iconCls: "text-green-800 dark:text-green-300",
  },
  UPCOMING_SALE: {
    title: "Urmează reduceri — merită să aștepți.",
    cls: "bg-sky-100 text-sky-950 dark:bg-sky-950/70 dark:text-sky-50",
    iconCls: "text-sky-800 dark:text-sky-300",
  },
  WAIT: {
    title: "Mai așteaptă — prețul e peste obișnuit.",
    cls: "bg-orange-100 text-orange-950 dark:bg-orange-950/70 dark:text-orange-50",
    iconCls: "text-orange-800 dark:text-orange-300",
  },
  NEUTRAL: {
    title: "Preț obișnuit — nici chilipir, nici scump.",
    cls: "bg-soft text-ink",
    iconCls: "text-muted",
  },
  INSUFFICIENT_DATA: {
    title: "Încă nu știm sigur.",
    cls: "bg-amber-100 text-amber-950 dark:bg-amber-950/70 dark:text-amber-50",
    iconCls: "text-amber-800 dark:text-amber-300",
  },
};

export default function RecommendationCard({ rec, overMsrp }: { rec: Recommendation; overMsrp?: boolean }) {
  const hero = HERO[rec.verdict];
  const pct = Math.round(rec.confidence * 100);
  const title = rec.verdict === "INSUFFICIENT_DATA" && overMsrp ? "Încă nu știm sigur — dar prețul e mare." : hero.title;
  return (
    <section aria-labelledby="rec-title" className={`rounded-[28px] p-6 sm:p-8 ${hero.cls}`}>
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70 dark:bg-black/20 ${hero.iconCls}`}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            {rec.verdict === "BUY_NOW" ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
          </svg>
        </span>
        <span className="text-sm font-bold uppercase tracking-wider opacity-80">Verdictul nostru · {rec.label}</span>
      </div>
      <h2 id="rec-title" className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-[34px]">
        {title}
      </h2>

      <ul className="mt-4 space-y-2 text-[16px] leading-relaxed opacity-90">
        {rec.reasons.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden>→</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>

      {rec.verdict !== "INSUFFICIENT_DATA" && (
        <div className="mt-5 max-w-sm">
          <div className="flex justify-between text-xs font-medium opacity-80">
            <span>Încredere</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-black/10 dark:bg-white/15" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Nivel de încredere">
            <div className="h-2 rounded-full bg-current" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <p className="mt-5 text-xs opacity-75">{rec.disclaimer}</p>
    </section>
  );
}
