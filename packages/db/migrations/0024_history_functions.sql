-- History integrity (review fixes, 10 Nov 2026; CLAUDE.md "never fabricate history", docs/03 §6.4).
--
-- 1. offer_day_states(): the one implementation of an offer's observed state per Europe/Bucharest
--    day, used by the product rollup, the per-shop chart series and the discount facts.
--      * An offer covers day D when D lies between its first sight and its last check and not
--        strictly inside a recorded coverage gap (offer_gaps).
--      * Its price for D is the minimum over the in-stock states in effect during D: every event of
--        D plus the state carried in from before D. Exception: on the day a gap ends, when the check
--        that ended it recorded a change, the carried-in (pre-gap) state was never observed on that
--        day, so it does not count. When that check found the same content, it does count: it was
--        observed again.
--      * The total is the one shown at the time (price_events.total_price); events written before
--        this migration fall back to price + stated shipping, as they were shown.
-- 2. rollup_product_daily() on top of it; the median is exact (numeric) instead of a float.
-- 3. Triggers that mark a product's history dirty (product_history_dirty) whenever an offer joins
--    or leaves its series, or an event is written for an earlier day (replays, released
--    quarantine). The worker job rollup.history rebuilds those products from the marked day.
-- 4. Every product that has offers is marked once, so history built under the old rules (gap ends,
--    mapping changes after which only two days were re-rolled) is rebuilt in the background.

CREATE OR REPLACE FUNCTION offer_day_states(p_offers bigint[], p_from date, p_to date)
RETURNS TABLE (offer_id bigint, day date, min_price numeric, min_total numeric)
LANGUAGE sql
STABLE
AS $$
  WITH o AS (
    SELECT o.id,
           (o.first_seen_at AT TIME ZONE 'Europe/Bucharest')::date AS d_first,
           (o.last_checked_at AT TIME ZONE 'Europe/Bucharest')::date AS d_last
    FROM offers o
    WHERE o.id = ANY (p_offers)
  ),
  days AS (
    SELECT o.id AS offer_id, d::date AS day,
           (d::date::timestamp AT TIME ZONE 'Europe/Bucharest') AS day_start,
           ((d::date + 1)::timestamp AT TIME ZONE 'Europe/Bucharest') AS day_end
    FROM o
    CROSS JOIN LATERAL generate_series(greatest(o.d_first, p_from), least(o.d_last, p_to), interval '1 day') AS d
    WHERE NOT EXISTS (
      SELECT 1 FROM offer_gaps g
      WHERE g.offer_id = o.id
        AND (g.from_ts AT TIME ZONE 'Europe/Bucharest')::date < d::date
        AND (g.to_ts AT TIME ZONE 'Europe/Bucharest')::date > d::date
    )
  ),
  states AS (
    SELECT days.offer_id, days.day, e.price, e.total, e.availability
    FROM days
    CROSS JOIN LATERAL (
      (SELECT pe.price, coalesce(pe.total_price, pe.price + coalesce(pe.shipping_cost, 0)) AS total, pe.availability
       FROM price_events pe
       WHERE pe.offer_id = days.offer_id
         AND pe.observed_at < days.day_start
         -- The day starts inside a gap whose closing check recorded a change: the pre-gap state
         -- was not observed on this day.
         AND NOT EXISTS (
           SELECT 1 FROM offer_gaps g
           WHERE g.offer_id = days.offer_id
             AND g.from_ts < days.day_start
             AND g.to_ts >= days.day_start
             AND EXISTS (SELECT 1 FROM price_events c WHERE c.offer_id = g.offer_id AND c.observed_at = g.to_ts)
         )
       ORDER BY pe.observed_at DESC
       LIMIT 1)
      UNION ALL
      (SELECT pe.price, coalesce(pe.total_price, pe.price + coalesce(pe.shipping_cost, 0)), pe.availability
       FROM price_events pe
       WHERE pe.offer_id = days.offer_id
         AND pe.observed_at >= days.day_start
         AND pe.observed_at < days.day_end)
    ) e
  )
  SELECT offer_id, day,
         min(price) FILTER (WHERE availability = 'in_stock'),
         min(total) FILTER (WHERE availability = 'in_stock')
  FROM states
  GROUP BY offer_id, day
$$;
--> statement-breakpoint
-- Daily product rollups (M08). Only matched (auto/manual), new, non-bundle, non-accessory,
-- non-blacklisted offers from shops with trust_tier <= 2 and source_tier <= 2 count; marketplace
-- sellers form a separate series (mp_*). Days are Europe/Bucharest calendar days.
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
    SELECT o.id, o.product_id, o.seller_type, o.shop_id
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
  offer_day AS (
    SELECT offs.id AS offer_id, offs.product_id, offs.seller_type, offs.shop_id, st.day, st.min_price, st.min_total
    FROM offer_day_states((SELECT array_agg(id) FROM offs), p_from, p_to) st
    JOIN offs ON offs.id = st.offer_id
  )
  INSERT INTO product_daily (product_id, day, min_price, min_total_price, min_offer_id, min_shop_id,
                             median_price, offer_count, in_stock_count, mp_min_total_price, mp_min_offer_id)
  SELECT product_id, day,
         min(min_price) FILTER (WHERE seller_type = 'shop'),
         min(min_total) FILTER (WHERE seller_type = 'shop'),
         (array_agg(offer_id ORDER BY min_total) FILTER (WHERE seller_type = 'shop' AND min_total IS NOT NULL))[1],
         (array_agg(shop_id ORDER BY min_total) FILTER (WHERE seller_type = 'shop' AND min_total IS NOT NULL))[1],
         -- Exact median: the mean of the lower and the upper middle value, in numeric.
         round((percentile_disc(0.5) WITHIN GROUP (ORDER BY min_price) FILTER (WHERE seller_type = 'shop' AND min_price IS NOT NULL)
              + percentile_disc(0.5) WITHIN GROUP (ORDER BY min_price DESC) FILTER (WHERE seller_type = 'shop' AND min_price IS NOT NULL)) / 2, 2),
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mark_product_history_dirty(p_product bigint, p_from date)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO product_history_dirty (product_id, from_day, marked_at)
  VALUES (p_product, p_from, now())
  ON CONFLICT (product_id) DO UPDATE
    SET from_day = least(product_history_dirty.from_day, EXCLUDED.from_day), marked_at = now()
$$;
--> statement-breakpoint
-- An offer joins or leaves a product's series: its whole past changes series, so both products are
-- rebuilt from the offer's first day.
CREATE OR REPLACE FUNCTION offers_history_dirty()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.product_id IS NOT NULL THEN
    PERFORM mark_product_history_dirty(OLD.product_id, (OLD.first_seen_at AT TIME ZONE 'Europe/Bucharest')::date);
  END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') AND NEW.product_id IS NOT NULL THEN
    PERFORM mark_product_history_dirty(NEW.product_id, (NEW.first_seen_at AT TIME ZONE 'Europe/Bucharest')::date);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER offers_history_dirty_insert
  AFTER INSERT ON offers
  FOR EACH ROW WHEN (NEW.product_id IS NOT NULL)
  EXECUTE FUNCTION offers_history_dirty();
--> statement-breakpoint
CREATE TRIGGER offers_history_dirty_update
  AFTER UPDATE OF product_id, match_status, condition, is_bundle, is_accessory, blacklisted, seller_type, source_tier ON offers
  FOR EACH ROW WHEN (
    OLD.product_id IS DISTINCT FROM NEW.product_id
    OR OLD.match_status IS DISTINCT FROM NEW.match_status
    OR OLD.condition IS DISTINCT FROM NEW.condition
    OR OLD.is_bundle IS DISTINCT FROM NEW.is_bundle
    OR OLD.is_accessory IS DISTINCT FROM NEW.is_accessory
    OR OLD.blacklisted IS DISTINCT FROM NEW.blacklisted
    OR OLD.seller_type IS DISTINCT FROM NEW.seller_type
    OR OLD.source_tier IS DISTINCT FROM NEW.source_tier
  )
  EXECUTE FUNCTION offers_history_dirty();
--> statement-breakpoint
CREATE TRIGGER offers_history_dirty_delete
  AFTER DELETE ON offers
  FOR EACH ROW WHEN (OLD.product_id IS NOT NULL)
  EXECUTE FUNCTION offers_history_dirty();
--> statement-breakpoint
-- An event written for an earlier day (replay, a quarantined observation released later) changes
-- history that the nightly three-day rollup no longer covers.
CREATE OR REPLACE FUNCTION price_events_history_dirty()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pid bigint;
BEGIN
  SELECT product_id INTO pid FROM offers WHERE id = NEW.offer_id;
  IF pid IS NOT NULL THEN
    PERFORM mark_product_history_dirty(pid, (NEW.observed_at AT TIME ZONE 'Europe/Bucharest')::date);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER price_events_history_dirty
  AFTER INSERT ON price_events
  FOR EACH ROW WHEN ((NEW.observed_at AT TIME ZONE 'Europe/Bucharest')::date < (now() AT TIME ZONE 'Europe/Bucharest')::date)
  EXECUTE FUNCTION price_events_history_dirty();
--> statement-breakpoint
INSERT INTO product_history_dirty (product_id, from_day)
SELECT product_id, min((first_seen_at AT TIME ZONE 'Europe/Bucharest')::date)
FROM offers
WHERE product_id IS NOT NULL
GROUP BY product_id
ON CONFLICT (product_id) DO NOTHING;
