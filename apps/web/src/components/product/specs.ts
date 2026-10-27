/** Romanian labels for the key attributes extracted from titles (M06) and shown on product pages. */
const COLORS: Record<string, string> = {
  black: 'Negru', white: 'Alb', gray: 'Gri', silver: 'Argintiu', blue: 'Albastru', green: 'Verde', red: 'Roșu', pink: 'Roz',
  gold: 'Auriu', purple: 'Mov', yellow: 'Galben', orange: 'Portocaliu', beige: 'Bej', brown: 'Maro', titanium: 'Titan',
};

export function keySpecs(a: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const n = (k: string) => (typeof a[k] === 'number' ? (a[k] as number) : null);
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : null);
  const storage = n('storageGb');
  if (storage) out.push(['Stocare', storage >= 1024 ? `${storage / 1024} TB` : `${storage} GB`]);
  if (n('ramGb')) out.push(['Memorie RAM', `${n('ramGb')} GB`]);
  if (n('screenInches')) out.push(['Diagonală', `${String(n('screenInches')).replace('.', ',')}″`]);
  if (s('resolution')) out.push(['Rezoluție', s('resolution')!]);
  const color = s('color');
  if (color) out.push(['Culoare', s('colorRo') ?? COLORS[color] ?? color]);
  if (n('capacityL')) out.push(['Capacitate', `${n('capacityL')} l`]);
  if (n('capacityKg')) out.push(['Capacitate', `${n('capacityKg')} kg`]);
  if (s('energyClass')) out.push(['Clasă energetică', s('energyClass')!]);
  if (n('powerW')) out.push(['Putere', `${n('powerW')} W`]);
  const conn = a.connectivity;
  if (Array.isArray(conn) && conn.length) out.push(['Conectivitate', conn.join(', ')]);
  return out;
}
