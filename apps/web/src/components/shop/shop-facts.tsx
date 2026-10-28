import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { RelativeTime } from '@/components/ui/relative-time';
import { BOT_POLICY } from '@/lib/bot-policy';
import type { ShopFacts } from '@/lib/catalog';
import { formatDate, formatLeiNumeric, formatPercent, plural } from '@/lib/format';

/** Where the shop stands in our coverage, in one badge. */
export function shopState(s: ShopFacts): { label: string; tone: 'good' | 'neutral' | 'usual' | 'high'; covered: boolean } {
  if (s.status === 'blocked') return { label: 'Neinclus încă', tone: 'neutral', covered: false };
  if (s.status === 'paused') return { label: 'Colectare suspendată temporar', tone: 'usual', covered: false };
  if (s.status === 'removed') return { label: 'Scos din comparație', tone: 'neutral', covered: false };
  if (s.liveOffers === 0) return { label: 'În curs de adăugare', tone: 'neutral', covered: false };
  return { label: 'Inclus în comparație', tone: 'good', covered: true };
}

/**
 * How we read this shop's prices, stated truthfully per access mode. Only the identified crawler is
 * described as PretoscopBot; other channels are described in general terms, with the methodology
 * page for details (docs/12 §0, docs/02 §5.3).
 */
export function CollectionNote({ s }: { s: ShopFacts }) {
  if (s.status === 'blocked' || s.accessMode === 'off') {
    return (
      <p>
        Nu colectăm încă prețuri de la {s.name}, așa că produsele sale nu apar în comparații. Pe paginile de produs îți arătăm un link de căutare pe site-ul
        magazinului, marcat ca neverificat. Dacă reprezinți magazinul, ne poți trimite un feed de produse:{' '}
        <Link href="/pentru-magazine">Pretoscop pentru magazine</Link>.
      </p>
    );
  }
  if (s.accessMode === 'direct') {
    return (
      <p>
        Prețurile sunt citite automat de PretoscopBot, robotul nostru identificat, de pe paginile publice ale magazinului: respectăm robots.txt și
        trimitem cel mult o cerere la {BOT_POLICY.minIntervalSeconds} secunde. Detalii: <Link href="/bot">PretoscopBot</Link> și <Link href="/metodologie">metodologie</Link>.
      </p>
    );
  }
  if (s.accessMode === 'feed_only') {
    return (
      <p>
        Prețurile provin din feedul de produse al magazinului și le verificăm periodic. Detalii în <Link href="/metodologie">metodologie</Link>.
      </p>
    );
  }
  return (
    <p>
      Prețurile sunt preluate automat de pe paginile publice ale magazinului. Detalii despre surse în <Link href="/metodologie">metodologie</Link>.
    </p>
  );
}

export function ShippingNote({ s }: { s: ShopFacts }) {
  const { shipping } = s;
  if (!shipping.verified) {
    return (
      <p>
        Nu am verificat încă tarifele de livrare ale magazinului. Când oferta afișează costul livrării, îl adunăm la preț; altfel scriem „livrare de
        verificat” și totalul este doar prețul produsului.
      </p>
    );
  }
  const rows: string[] = [];
  if (shipping.freeOver !== null) rows.push(`Livrare gratuită pentru comenzi peste ${formatLeiNumeric(shipping.freeOver.toFixed(2))}.`);
  if (shipping.flat !== null) rows.push(`Livrare prin curier: ${formatLeiNumeric(shipping.flat.toFixed(2))}.`);
  if (shipping.lockerFlat !== null) rows.push(`Livrare la locker: ${formatLeiNumeric(shipping.lockerFlat.toFixed(2))}.`);
  if (shipping.notes) rows.push(shipping.notes);
  return rows.length ? (
    <ul>
      {rows.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  ) : (
    <p>Magazinul nu publică tarife de livrare fixe; folosim costul afișat în fiecare ofertă.</p>
  );
}

/** Coverage and freshness facts as a definition list (numbers we can stand behind). */
export function ShopFactsList({ s }: { s: ShopFacts }) {
  const freshShare = s.activeOffers > 0 ? s.checked24h / s.activeOffers : null;
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="shop-facts">
      <div className="rounded-lg bg-surface p-3 ring-1 ring-line">
        <dt className="text-muted">Oferte urmărite</dt>
        <dd className="text-lg font-semibold tabular">{s.liveOffers.toLocaleString('ro-RO')}</dd>
      </div>
      <div className="rounded-lg bg-surface p-3 ring-1 ring-line">
        <dt className="text-muted">Produse</dt>
        <dd className="text-lg font-semibold tabular">{s.products.toLocaleString('ro-RO')}</dd>
      </div>
      <div className="rounded-lg bg-surface p-3 ring-1 ring-line">
        <dt className="text-muted">Verificate în ultimele 24 de ore</dt>
        <dd className="text-lg font-semibold tabular">{freshShare === null ? '—' : formatPercent(freshShare)}</dd>
      </div>
      <div className="rounded-lg bg-surface p-3 ring-1 ring-line">
        <dt className="text-muted">Ultima verificare</dt>
        <dd className="font-semibold">{s.lastCheckedAt ? <RelativeTime iso={new Date(s.lastCheckedAt).toISOString()} /> : '—'}</dd>
      </div>
      {s.firstSeenAt && (
        <div className="col-span-2 rounded-lg bg-surface p-3 ring-1 ring-line sm:col-span-4">
          <dt className="text-muted">Observăm prețurile acestui magazin din</dt>
          <dd className="font-semibold">
            {formatDate(s.firstSeenAt)}
            {s.kind === 'marketplace_host' && s.marketplaceOffers > 0 && (
              <span className="ml-2 font-normal text-ink-soft">· {plural(s.marketplaceOffers, 'ofertă', 'oferte')} de la vânzători din marketplace, marcate separat</span>
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}

export function ShopStateBadge({ s }: { s: ShopFacts }) {
  const st = shopState(s);
  return <Badge tone={st.tone}>{st.label}</Badge>;
}
