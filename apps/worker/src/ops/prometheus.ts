/**
 * Prometheus text exposition format 0.0.4 (https://prometheus.io/docs/instrumenting/exposition_formats/),
 * enough for gauges and counters computed at scrape time. Kept dependency-free on purpose: every
 * worker metric is a database read made when Grafana Alloy (or curl) asks for /metrics.
 */

export type Labels = Record<string, string | number | boolean | null | undefined>;

export interface Sample {
  labels?: Labels;
  value: number | null | undefined;
}

export interface MetricFamily {
  name: string;
  help: string;
  type: 'gauge' | 'counter';
  samples: Sample[];
}

export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

const NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function escapeHelp(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

function formatValue(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return '+Inf';
  if (v === -Infinity) return '-Inf';
  return String(v);
}

function formatLabels(labels: Labels | undefined): string {
  if (!labels) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(labels)) {
    if (v === undefined || v === null) continue;
    if (!LABEL_RE.test(k)) throw new Error(`invalid label name ${k}`);
    parts.push(`${k}="${escapeLabelValue(String(v))}"`);
  }
  return parts.length ? `{${parts.join(',')}}` : '';
}

/** Renders metric families; samples whose value is null/undefined are left out. */
export function renderMetrics(families: MetricFamily[]): string {
  const out: string[] = [];
  for (const f of families) {
    if (!NAME_RE.test(f.name)) throw new Error(`invalid metric name ${f.name}`);
    out.push(`# HELP ${f.name} ${escapeHelp(f.help)}`);
    out.push(`# TYPE ${f.name} ${f.type}`);
    for (const s of f.samples) {
      if (s.value === null || s.value === undefined) continue;
      out.push(`${f.name}${formatLabels(s.labels)} ${formatValue(s.value)}`);
    }
  }
  return `${out.join('\n')}\n`;
}

export function gauge(name: string, help: string, samples: Sample[] | number | null): MetricFamily {
  return { name, help, type: 'gauge', samples: typeof samples === 'number' || samples === null ? [{ value: samples }] : samples };
}

export function counter(name: string, help: string, samples: Sample[] | number): MetricFamily {
  return { name, help, type: 'counter', samples: typeof samples === 'number' ? [{ value: samples }] : samples };
}
