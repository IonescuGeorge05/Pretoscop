const lei = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const leiShort = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 });

export const formatLei = (v: number) => `${lei.format(v)} lei`;
export const formatLeiShort = (v: number) => `${leiShort.format(v)} lei`;

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" });

export const formatShortDate = (ms: number) =>
  new Date(ms).toLocaleDateString("ro-RO", { day: "2-digit", month: "short" });

export const appName = () => process.env.APP_NAME ?? "Pretoscop";

export const withSource = (path: string, source?: string) => (source ? `${path}?source=${source}` : path);

/** "-7,2% față de MSRP" / "+74,6% față de MSRP" */
export const vsMsrp = (price: number, msrp: number) => {
  const pct = (price / msrp - 1) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")}% față de MSRP`;
};
