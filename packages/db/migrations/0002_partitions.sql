-- Monthly partitions for price_events (ADR-002, ADR-006).
-- ensure_price_event_partitions(months_back, months_ahead) creates any missing partition
-- price_events_YYYY_MM for each month in [now - months_back, now + months_ahead].
-- The pg-boss job `maintenance.partitions` calls it daily with (0, 12).
CREATE OR REPLACE FUNCTION ensure_price_event_partitions(months_back integer DEFAULT 0, months_ahead integer DEFAULT 12)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  base date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  m integer;
  start_d date;
  end_d date;
  part_name text;
  created integer := 0;
BEGIN
  FOR m IN -months_back..months_ahead LOOP
    start_d := (base + make_interval(months => m))::date;
    end_d := (start_d + interval '1 month')::date;
    part_name := format('price_events_%s', to_char(start_d, 'YYYY_MM'));
    IF to_regclass('public.' || part_name) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.price_events FOR VALUES FROM (%L) TO (%L)',
        part_name, start_d::timestamptz, end_d::timestamptz
      );
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END;
$$;
--> statement-breakpoint
-- History starts with the Phase-0 recorder (late October 2026); keep the whole of 2026 available
-- for replays of stored snapshots, plus twelve months ahead.
SELECT ensure_price_event_partitions(
  GREATEST(0, (EXTRACT(YEAR FROM age(date_trunc('month', now()), DATE '2026-01-01')) * 12
             + EXTRACT(MONTH FROM age(date_trunc('month', now()), DATE '2026-01-01')))::integer),
  12
);
