/** A lookup answer in the documented shape (apps/web/README.md "Browser extension API"). */
export function sampleBody(): Record<string, unknown> {
  return {
    product_id: 42,
    slug: 'telefon-samsung-galaxy-s26-fe-42',
    title: 'Telefon mobil Samsung Galaxy S26 FE, Dual SIM, 8GB RAM, 128GB, 5G, Blueberry',
    url: 'https://pretoscop.ro/p/telefon-samsung-galaxy-s26-fe-42',
    matched_by: 'url',
    low_30d: '2149.00',
    low_all_time: '2099.00',
    median_30d: '2249.99',
    verdict: { code: 'good_price', label: 'Preț bun', text: 'Preț bun: cel mai mic din ultimele 30 de zile observate de Pretoscop.' },
    observations_days: 40,
    history_started_at: '2026-09-30',
    badges: [{ kind: 'drop', label: '−10% față de minimul din 30 de zile', text: 'Prețul total de acum (2.149,00 lei) este cu 10% sub …' }],
    best_offers: [
      { shop: 'itgalaxy', shop_name: 'IT Galaxy', seller_name: null, marketplace: false, price: '2149.00', shipping: null, total: '2149.00', checked_at: '2026-11-09T07:00:00.000Z' },
      { shop: 'emag', shop_name: 'eMAG', seller_name: 'Gadget SRL', marketplace: true, price: '2180.00', shipping: '19.99', total: '2199.99', checked_at: '2026-11-09T06:00:00.000Z' },
    ],
    history: [
      ['2026-10-01', '2399.99'],
      ['2026-10-02', '2399.99'],
      ['2026-11-08', '2149.00'],
    ],
    updated_at: '2026-11-09T07:00:00.000Z',
  };
}
