# @pretoscop/core

Pure domain logic: money/VAT, GTIN, Romanian text normalization, attribute extraction, matching
rules and scoring, total price, discount verdicts, anomaly filters. **No I/O** (enforced by ESLint).

Contract: filled by M06 (`normalizeOffer`, `validateGtin`, `normalizeText`, `asciiFold`, `slugify`,
`extractAttributes`, `parsePriceRon`, `totalPrice`), M07 (`matching`) and M08 (`verdict`, `anomaly`).
