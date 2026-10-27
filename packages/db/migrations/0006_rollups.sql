-- Daily product rollups (M08). One implementation, called by the worker (rollup.daily, rollup.touch),
-- the CLI and psql. Days are Europe/Bucharest calendar days.
--
-- Honesty rules ("never fabricate history"):
--   * an offer contributes to day D only if D lies between its first sight and its last check and
--     not strictly inside a recorded coverage gap (offer_gaps, > 48 h between checks);
--   * the offer's price for D is the minimum over the in-stock states in effect during D (the state
--     carried in from before D plus every event during D); out-of-stock/unknown states set no minimum;
--   * only matched (auto/manual), new, non-bundle, non-accessory offers from shops with trust_tier <= 2
--     and source_tier <= 2 count; marketplace sellers form a separate series (mp_*).
CREATE OR REPLACE FUNCTION rollup_product_daily(p_products bigint[], p_from date, p_to date)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM product_daily
  WHERE day BETWEEN p_from AND p_to
    AND (p_products IS NULL OR product_id = ANY (p_products));

  WITH offs AS (
    SELECT o.id, o.product_id, o.seller_type, o.shop_id,
           (o.first_seen_at AT TIME ZONE 'Europe/Bucharest')::date AS d_first,
           (o.last_checked_at AT TIME ZONE 'Europe/Bucharest')::date AS d_last
    FROM offers o
    JOIN shops s ON s.id = o.shop_id
    WHERE o.product_id IS NOT NULL
      AND (p_products IS NULL OR o.product_id = ANY (p_products))
      AND o.match_status IN ('auto', 'manual')
      AND o.condition = 'new' AND NOT o.is_bundle AND NOT o.is_accessory AND NOT o.blacklisted
      AND s.trust_tier <= 2 AND o.source_tier <= 2
      AND (o.last_checked_at AT TIME ZONE 'Europe/Bucharest')::date >= p_from
      AND (o.first_seen_at AT TIME ZONE 'Europe/Bucharest')::date <= p_to
  ),
  days AS (
    SELECT o.id AS offer_id, o.product_id, o.seller_type, o.shop_id, d::date AS day
    FROM offs o
    CROSS JOIN LATERAL generate_series(greatest(o.d_first, p_from), least(o.d_last, p_to), interval '1 day') AS d
    WHERE NOT EXISTS (
      SELECT 1 FROM offer_gaps g
      WHERE g.offer_id = o.id
        AND (g.from_ts AT TIME ZONE 'Europe/Bucharest')::date < d::date
        AND (g.to_ts AT TIME ZONE 'Europe/Bucharest')::date > d::date
    )
  ),
  states AS (
    SELECT d.offer_id, d.product_id, d.seller_type, d.shop_id, d.day, e.price, e.shipping_cost, e.availability
    FROM days d
    CROSS JOIN LATERAL (
      (SELECT pe.price, pe.shipping_cost, pe.availability
       FROM price_events pe
       WHERE pe.offer_id = d.offer_id
         AND pe.observed_at < (d.day::timestamp AT TIME ZONE 'Europe/Bucharest')
       ORDER BY pe.observed_at DESC
       LIMIT 1)
      UNION ALL
      (SELECT pe.price, pe.shipping_cost, pe.availability
       FROM price_events pe
       WHERE pe.offer_id = d.offer_id
         AND pe.observed_at >= (d.day::timestamp AT TIME ZONE 'Europe/Bucharest')
         AND pe.observed_at < ((d.day + 1)::timestamp AT TIME ZONE 'Europe/Bucharest'))
    ) e
  ),
  offer_day AS (
    SELECT offer_id, product_id, seller_type, shop_id, day,
           min(price) FILTER (WHERE availability = 'in_stock') AS min_price,
           min(price + coalesce(shipping_cost, 0)) FILTER (WHERE availability = 'in_stock') AS min_total
    FROM states
    GROUP BY offer_id, product_id, seller_type, shop_id, day
  )
  INSERT INTO product_daily (product_id, day, min_price, min_total_price, min_offer_id, min_shop_id,
                             median_price, offer_count, in_stock_count, mp_min_total_price, mp_min_offer_id)
  SELECT product_id, day,
         min(min_price) FILTER (WHERE seller_type = 'shop'),
         min(min_total) FILTER (WHERE seller_type = 'shop'),
         (array_agg(offer_id ORDER BY min_total) FILTER (WHERE seller_type = 'shop' AND min_total IS NOT NULL))[1],
         (array_agg(shop_id ORDER BY min_total) FILTER (WHERE seller_type = 'shop' AND min_total IS NOT NULL))[1],
         percentile_cont(0.5) WITHIN GROUP (ORDER BY min_price) FILTER (WHERE seller_type = 'shop' AND min_price IS NOT NULL),
         count(*),
         count(min_price),
         min(min_total) FILTER (WHERE seller_type = 'marketplace'),
         (array_agg(offer_id ORDER BY min_total) FILTER (WHERE seller_type = 'marketplace' AND min_total IS NOT NULL))[1]
  FROM offer_day
  GROUP BY product_id, day;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
