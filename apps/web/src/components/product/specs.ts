/** Romanian labels for the key attributes extracted from titles (M06) and shown on product pages. */
const COLORS: Record<string, string> = {
  black: 'Negru', white: 'Alb', gray: 'Gri', silver: 'Argintiu', blue: 'Albastru', green: 'Verde', red: 'Roșu', pink: 'Roz',
  gold: 'Auriu', purple: 'Mov', yellow: 'Galben', orange: 'Portocaliu', beige: 'Bej', brown: 'Maro', titanium: 'Titan',
};

const RESOLUTIONS: Record<string, string> = {
  '8k': '8K UHD', '5k': '5K', '4k': '4K UHD', dqhd: 'Dual QHD', uwqhd: 'UWQHD', wqxga: 'WQXGA (2560×1600)', qhd: 'QHD (2560×1440)',
  '3k': '3K', '2.8k': '2.8K', wuxga: 'WUXGA (1920×1200)', fhd: 'Full HD (1920×1080)', hd: 'HD',
};
const CONNECTIVITY: Record<string, string> = {
  '5g': '5G', '4g': '4G', wifi: 'Wi-Fi', bluetooth: 'Bluetooth', dual_sim: 'Dual SIM', esim: 'eSIM', cellular: 'date mobile', nfc: 'NFC',
};

export function keySpecs(a: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const n = (k: string) => (typeof a[k] === 'number' ? (a[k] as number) : null);
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : null);
  const storage = n('storageGb');
  if (storage) out.push(['Stocare', storage >= 1024 ? `${storage / 1024} TB` : `${storage} GB`]);
  if (n('ramGb')) out.push(['Memorie RAM', `${n('ramGb')} GB`]);
  if (n('screenInches')) out.push(['Diagonală', `${String(n('screenInches')).replace('.', ',')}″`]);
  const res = s('resolution');
  if (res) out.push(['Rezoluție', RESOLUTIONS[res] ?? res.toUpperCase()]);
  const color = s('color');
  if (color) out.push(['Culoare', s('colorRo') ?? COLORS[color] ?? color]);
  if (n('capacityL')) out.push(['Capacitate', `${n('capacityL')} l`]);
  if (n('capacityKg')) out.push(['Capacitate', `${n('capacityKg')} kg`]);
  if (s('energyClass')) out.push(['Clasă energetică', s('energyClass')!]);
  if (n('powerW')) out.push(['Putere', `${n('powerW')} W`]);
  const conn = a.connectivity;
  if (Array.isArray(conn) && conn.length) out.push(['Conectivitate', conn.map((c) => CONNECTIVITY[String(c)] ?? String(c)).join(', ')]);
  return out;
}
