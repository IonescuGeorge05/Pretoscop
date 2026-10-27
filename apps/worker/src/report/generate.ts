import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportLabels, reportOffers, type Db } from '@pretoscop/db';
import {
  addDays,
  analyzeReport,
  classShareChart,
  dropsChart,
  offerHistoryChart,
  renderCsv,
  renderMarkdown,
  roDay,
  type ReportData,
  type ReportInputOffer,
} from '@pretoscop/report';
import sharp from 'sharp';

export interface GenerateOptions {
  id: string;
  title: string;
  from: string;
  to: string;
  categories: string[] | null;
  /** Fixed generation time (ISO) for reproducible output. */
  now: string;
  outDir: string;
  /** PNG copies of the charts for the press kit (on by default). */
  png?: boolean;
  /** Label for the shaded event window on example charts. */
  windowLabel?: string;
}

export interface GeneratedReport {
  dir: string;
  data: ReportData;
  files: string[];
}

const SOURCE = 'Sursa: Pretoscop, prețuri observate pe paginile publice ale magazinelor. pretoscop.ro/metodologie';

/** The offer to show as an example: the strongest raise-then-cut case, else the largest unsupported reference. */
function exampleOffer(data: ReportData, offers: ReportInputOffer[]): { offer: ReportInputOffer; caption: string } | null {
  const rtc = data.raiseThenCut.cases[0];
  if (rtc) {
    const offer = offers.find((o) => o.offerId === rtc.offerId);
    if (offer) return { offer, caption: `Exemplu: preț crescut înainte, apoi „redus” (${rtc.shop})` };
  }
  const row = data.offers
    .filter((o) => o.discountClaimed && o.class !== 'real_drop' && o.referenceBani !== null && o.min30Bani !== null)
    .sort((a, b) => b.referenceBani! / b.min30Bani! - a.referenceBani! / a.min30Bani! || a.offerId - b.offerId)[0];
  const offer = row ? offers.find((o) => o.offerId === row.offerId) : undefined;
  return offer && row ? { offer, caption: `Exemplu: reducere afișată fără scădere reală (${row.shop})` } : null;
}

/** Builds report.json, report.md, CSVs and charts (SVG + PNG) into `outDir/<id>/`. Deterministic. */
export async function generateReport(db: Db, o: GenerateOptions): Promise<GeneratedReport> {
  const [labels, offers] = await Promise.all([reportLabels(db), reportOffers(db, { from: o.from, to: o.to, categories: o.categories })]);
  const data = analyzeReport({
    id: o.id,
    title: o.title,
    window: { from: o.from, to: o.to },
    generatedAt: o.now,
    categories: o.categories,
    shopNames: labels.shopNames,
    categoryNames: labels.categoryNames,
    offers,
  });
  const dir = join(o.outDir, o.id);
  mkdirSync(join(dir, 'charts'), { recursive: true });
  const period = `${roDay(o.from)} – ${roDay(o.to)} ${o.to.slice(0, 4)}`;
  const charts: Array<{ name: string; alt: string; svg: string }> = [
    {
      name: 'clase-pe-magazine',
      alt: 'Ofertele din perioadă, pe magazine: scădere reală, fără scădere reală, mai scump',
      svg: classShareChart(data.byShop, {
        title: 'Cum s-au comparat prețurile din perioadă cu minimul ultimelor 30 de zile',
        subtitle: `${period}, oferte cu istoric suficient, pe magazine`,
        source: SOURCE,
      }),
    },
    {
      name: 'magazin-vs-marketplace',
      alt: 'Vândute de magazine comparativ cu vânzătorii din marketplace',
      svg: classShareChart(data.bySeller, {
        title: 'Magazine și vânzători din marketplace',
        subtitle: `${period}, oferte cu istoric suficient`,
        source: SOURCE,
      }),
    },
    {
      name: 'scaderi-reale',
      alt: 'Cele mai mari scăderi reale față de minimul ultimelor 30 de zile',
      svg: dropsChart(data.biggestDrops, {
        title: 'Cele mai mari scăderi reale',
        subtitle: `${period}, față de cel mai mic preț din cele 30 de zile dinainte (oferte vândute de magazine)`,
        source: SOURCE,
      }),
    },
  ];
  const example = exampleOffer(data, offers);
  if (example) {
    const days = example.offer.days.filter((d) => d.day >= addDays(o.from, -60));
    charts.push({
      name: 'exemplu-oferta',
      alt: example.caption,
      svg: offerHistoryChart(
        days.map((d) => ({ day: d.day, bani: d.priceBani })),
        days.filter((d) => d.oldPriceBani !== null && d.oldPriceBani > d.priceBani).map((d) => ({ day: d.day, bani: d.oldPriceBani })),
        { title: example.caption, subtitle: example.offer.productTitle ?? `Oferta #${example.offer.offerId}`, source: SOURCE, window: { from: o.from, to: o.to }, windowLabel: o.windowLabel ?? 'Perioada analizată' },
      ),
    });
  }
  const files: string[] = [];
  const write = (name: string, body: string | Buffer) => {
    writeFileSync(join(dir, name), body);
    files.push(name);
  };
  for (const c of charts) {
    write(`charts/${c.name}.svg`, c.svg);
    if (o.png !== false) write(`charts/${c.name}.png`, await sharp(Buffer.from(c.svg), { density: 144 }).png({ compressionLevel: 9 }).toBuffer());
  }
  write('report.json', `${JSON.stringify(data, null, 1)}\n`);
  write('report.md', renderMarkdown(data, charts.map((c) => ({ file: `charts/${c.name}.${o.png === false ? 'svg' : 'png'}`, alt: c.alt }))));
  for (const [name, body] of Object.entries(renderCsv(data))) write(name, body);
  return { dir, data, files };
}
