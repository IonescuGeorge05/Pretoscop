'use client';

import { ExternalLink, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { formatDateTime, formatLeiNumeric, formatRelative } from '@/lib/format';
import { track } from '@/lib/track';
import type { ProductOffer } from '@/lib/product';

function seller(o: ProductOffer): string {
  if (o.sellerType === 'marketplace') return o.sellerName ? `Vândut de ${o.sellerName} prin ${o.shopName} Marketplace` : `Vânzător terț prin ${o.shopName}`;
  if (o.sellerName && o.sellerName.toLowerCase() !== o.shopName.toLowerCase()) return `Vândut de ${o.sellerName}`;
  return o.shopKind === 'marketplace_host' && !o.sellerName ? `Vânzător nespecificat în listare (${o.shopName})` : `Vândut de ${o.shopName}`;
}

const AVAIL: Record<ProductOffer['availability'], [string, 'good' | 'usual' | 'neutral' | 'high']> = {
  in_stock: ['În stoc', 'good'],
  preorder: ['Precomandă', 'usual'],
  out_of_stock: ['Stoc epuizat', 'high'],
  unknown: ['Stoc necunoscut', 'neutral'],
};

export function OffersTable({ offers, productId }: { offers: ProductOffer[]; productId: number }) {
  const [inStockOnly, setInStockOnly] = useState(false);
  const [noMarketplace, setNoMarketplace] = useState(false);
  const shown = useMemo(
    () => offers.filter((o) => (!inStockOnly || o.availability === 'in_stock') && (!noMarketplace || o.sellerType !== 'marketplace')),
    [offers, inStockOnly, noMarketplace],
  );
  const bestId = offers.find((o) => o.availability === 'in_stock' && !o.stale && o.sellerType === 'shop')?.id;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" aria-label="Doar în stoc" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} className="size-4 accent-brand-600" />
          Doar în stoc
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" aria-label="Fără vânzători din marketplace" checked={noMarketplace} onChange={(e) => setNoMarketplace(e.target.checked)} className="size-4 accent-brand-600" />
          Fără vânzători din marketplace
        </label>
        <a href="/cum-functioneaza" className="ml-auto flex items-center gap-1 text-brand-700 hover:underline">
          <Info className="size-4" aria-hidden /> Ordonate după prețul total. Cum funcționează?
        </a>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] ring-1 ring-line">
        {shown.map((o) => {
          const [availLabel, tone] = AVAIL[o.availability];
          const shipping = o.shippingCost === null ? null : Number(o.shippingCost);
          return (
            <li key={o.id} className={cn('grid gap-3 bg-white px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center', o.stale && 'bg-surface text-muted')}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{o.shopName}</span>
                  {o.id === bestId && <Badge tone="good">Cel mai mic preț total</Badge>}
                  {o.sellerType === 'marketplace' && <Badge tone="info">Marketplace</Badge>}
                  <Badge tone={tone}>{availLabel}</Badge>
                  {o.condition !== 'new' && <Badge tone="usual">{o.condition === 'refurbished' ? 'Resigilat / recondiționat' : 'Folosit'}</Badge>}
                  {o.hasAffiliate && (
                    <span className="text-[11px] text-muted" title="Pretoscop poate primi un comision dacă cumperi prin acest link; comisionul nu influențează ordinea.">
                      Link afiliat
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">{seller(o)}</p>
                <p className={cn('mt-0.5 text-xs', o.stale ? 'text-high' : 'text-muted')} title={formatDateTime(o.lastCheckedAt)}>
                  Verificat {formatRelative(o.lastCheckedAt)}
                  {o.stale ? ' — preț neconfirmat recent' : ''}
                </p>
                {o.facts.map((f) => (
                  <p key={f.kind} className="mt-1 rounded bg-info-bg px-2 py-1 text-xs text-ink-soft">
                    {f.text}
                  </p>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <div className="text-right tabular">
                  {o.oldPrice && Number(o.oldPrice) > Number(o.price) && (
                    <div className="text-xs text-muted" title="Prețul de referință afișat de magazin">
                      <s>{formatLeiNumeric(o.oldPrice)}</s> <span className="sr-only">preț de referință afișat de magazin</span>
                    </div>
                  )}
                  <div className="text-lg font-bold text-ink">{formatLeiNumeric(o.total)}</div>
                  <div className="text-[11px] text-muted">
                    {shipping === null
                      ? `${formatLeiNumeric(o.price)} + livrare de verificat`
                      : shipping === 0
                        ? 'livrare gratuită'
                        : `${formatLeiNumeric(o.price)} + ${formatLeiNumeric(o.shippingCost)} livrare${o.shippingEstimated ? ' (estimată)' : ''}`}
                  </div>
                </div>
                <a
                  href={`/out/${o.id}?p=offers_table`}
                  rel={o.hasAffiliate ? 'sponsored nofollow noopener' : 'nofollow noopener'}
                  target="_blank"
                  onClick={() => track('clickout', { offer: o.id, product: productId, shop: o.shopSlug })}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Vezi oferta <ExternalLink className="size-4" aria-hidden />
                </a>
              </div>
            </li>
          );
        })}
        {shown.length === 0 && <li className="bg-white px-4 py-6 text-center text-sm text-muted">Nicio ofertă pentru filtrele alese.</li>}
      </ul>
    </div>
  );
}
