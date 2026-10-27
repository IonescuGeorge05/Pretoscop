# Verdicts, discount facts and anomaly guards (M08)

All three are pure functions in `@pretoscop/core` (`verdict.ts`, `discount.ts`, `anomaly.ts`) and use
only Pretoscop's own observations, in integer bani.

## Verdict (`computeVerdict`)

| Verdict | Rule |
|---|---|
| `insufficient_data` | fewer than 14 observed days, or no current in-stock offer |
| `good_price` | today's best total ≤ 30-day minimum × 1.01 |
| `above_usual` | today's best total ≥ 90-day median × 1.08 |
| `usual` | otherwise |

Thresholds compare integers (percent × bani) so rounding never flips a verdict. The "−X% față de
minimul ultimelor 30 de zile" badge (`dropVersus30dMin`) appears only with ≥ 14 observed days.

## Discount-verification facts (`discountFacts`)

Never in an offer's first 30 days, and only when we observed at least 70% of the days of the window.

1. **Reference not supported** — the shop's crossed price is more than 2% above the lowest price we
   observed at that shop in the 30 days before the reduction started.
2. **Raise-then-cut** — the maximum over [t−30d, t−3d] is ≥ 1.15 × the median over [t−60d, t−31d] and the
   current price is ≥ 97% of that earlier median.
3. **Phantom old price** — the crossed price was never an observed selling price in the last 90 days
   (needs 90 days of history).
4. **Market-irrelevant discount** — the claimed reduction exceeds 30% while the price is at or above
   today's cross-shop median.

Each fact carries a factual Romanian sentence with the numbers and dates it rests on, and its evidence.
Wording never accuses (docs/07 §2).

## Anomaly guards (`anomaly.ts`)

- **Quarantine**: a new price beyond ×3 or ÷3 of the offer's 14-day median is held
  (`price_events_quarantine`) and published only when the next observation agrees within 2%; a return
  to the usual level rejects it; an admin can release it. Ratios near 10/100/1000 are labelled as
  likely separator errors.
- **Run breaker**: if more than 20% of a batch (≥ 20 known offers) moved by more than 50%, nothing
  from the batch is recorded and the run is held with an alert.
- **Cross-shop floor**: an in-stock offer below 30% of its product's cross-shop median goes back to
  the matcher (nightly).
- **Bot traps**: titles made mostly of random hex tokens (cel.ro's captcha decoys) are rejected.
