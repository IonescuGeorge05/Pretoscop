# @pretoscop/extractors

Per-source parsers that turn pages and feeds into `RawOffer` records. **No I/O** (enforced by ESLint).

Contract: filled by M03 (`RawOffer`, `parsePage`, `parseFeed`, `parseSitemap`).
Fixtures live under `fixtures/<shop>/<page>_<YYYY-MM-DD>.<ext>`; never edit a fixture by hand.
