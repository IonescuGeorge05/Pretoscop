# Icecat fixtures (synthetic)

There is no Open Icecat account yet (docs/09 B1) and the build session does not call Icecat live,
so these files are **hand-written**, hence the `_synthetic` suffix instead of a recording date. They
follow the structure of the Open Icecat Live JSON API documented in Icecat's "Manual for Icecat
JSON Product Requests" (v3.0, 13 Oct 2026) and observed in the research round's live tests of
2026-10-27 (`docs/research/notes/gaps2_affiliate_platforms.md` §6,
`gaps_affiliate_and_merchant_channels.md` §4): `data.GeneralInfo`, `data.Image`, `data.Gallery`,
`data.FeaturesGroups`, Romanian names with `Language: "RO"`, empty Romanian marketing text for most
brands, a Romanian `LongDesc` for Philips, `DemoAccount: true` for the public demo account.

The product values are illustrative (part codes and image file names contain `SYNTH`/`synth`) and
must not be read as Icecat data. The error documents reproduce the messages quoted in the research
notes: "not present in the Icecat database", "brand restrictions or access is limited" (Apple) and
the Romanian 403 for Full-Icecat-only brands ("este necesar un app_key": Sony, Xiaomi, Logitech, AMD).

Replace them with recorded responses (dated file names) once the account exists: run
`pnpm --filter @pretoscop/worker icecat:lookup <gtin> --save packages/icecat/fixtures` (see the
package README) and keep the synthetic ones only for the error cases the account cannot reproduce.
