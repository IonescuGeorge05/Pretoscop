import { toBani } from './format';

/**
 * Sparkline geometry for the daily lowest total: a step line (each observed day holds its price
 * for the whole day), broken wherever a day was not observed. Gaps stay gaps: nothing is drawn
 * for a day we did not observe (CLAUDE.md: never fabricate history, no interpolation).
 */
export interface Spark {
  width: number;
  height: number;
  /** SVG path data, one per run of consecutive observed days. */
  paths: string[];
  /** Days observed on their own (no neighbour), drawn as dots so they stay visible. */
  dots: Array<{ x: number; y: number }>;
  lowBani: number;
  highBani: number;
  firstDay: string;
  lastDay: string;
  observedDays: number;
}

const DAY_MS = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function sparkline(history: ReadonlyArray<readonly [string, string]>, width = 280, height = 56, pad = 4): Spark | null {
  const pts = history
    .map(([day, v]) => ({ day, i: Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS), v: toBani(v) }))
    .filter((p) => Number.isFinite(p.i) && Number.isFinite(p.v))
    .sort((a, b) => a.i - b.i);
  if (pts.length === 0) return null;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const step = (width - 2 * pad) / (last.i - first.i + 1);
  const low = Math.min(...pts.map((p) => p.v));
  const high = Math.max(...pts.map((p) => p.v));
  const x = (i: number) => pad + (i - first.i) * step;
  const y = (v: number) => (high === low ? height / 2 : pad + ((high - v) / (high - low)) * (height - 2 * pad));
  const paths: string[] = [];
  const dots: Spark['dots'] = [];
  let run: typeof pts = [];
  const flush = () => {
    if (run.length === 0) return;
    const [a, ...rest] = run;
    let d = `M${r2(x(a!.i))} ${r2(y(a!.v))} H${r2(x(a!.i) + step)}`;
    for (const p of rest) d += ` V${r2(y(p.v))} H${r2(x(p.i) + step)}`;
    paths.push(d);
    if (run.length === 1) dots.push({ x: r2(x(a!.i) + step / 2), y: r2(y(a!.v)) });
    run = [];
  };
  for (const p of pts) {
    if (run.length > 0 && p.i !== run[run.length - 1]!.i + 1) flush();
    run.push(p);
  }
  flush();
  return { width, height, paths, dots, lowBani: low, highBani: high, firstDay: first.day, lastDay: last.day, observedDays: pts.length };
}
