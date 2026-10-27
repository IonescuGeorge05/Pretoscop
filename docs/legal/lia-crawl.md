# Legitimate interest assessment: personal data incidental to collected offers

Status: draft v0.1, 2026-10-27 (module M17; docs/07 item 1.9). Assessor: implementing agent for the founders; founders' sign-off and lawyer review (setup B5) pending. Review: yearly, and before any change listed in the last section. Related: `ropa.md` activity P7, `/confidentialitate#magazine`.

## 1. What is processed

Pretoscop records offer facts from public shop pages, sitemaps and product feeds, through PretoscopBot, merchant and affiliate feeds, and (for designated shops, M05B) a third-party data-collection service: price, crossed price, availability, delivery cost, title, brand, identifiers (GTIN, MPN), category, URL and, for marketplace offers, the seller's name. The same fields are kept in the raw run snapshots (`snapshots/{source}/{run}.jsonl.gz`), the audit trail of every observation.

Most of this is business data. Personal data can appear incidentally in two places:

| Item | When it is personal data | Volume (estimate) |
|---|---|---|
| Marketplace seller name (`offers.seller_name`, e.g. eMAG Marketplace sellers) | When the seller is a natural person trading under their own name (PFA, II or IF, e.g. "Popescu Ion PFA") | Hundreds to a few thousand names |
| Product titles | Names of authors, performers or designers inside titles (books, music, branded goods) | Incidental; public information about published works |

Not collected, by design and by the extractors (docs/07 items 1.4 and 1.7): images, product descriptions, review texts, ratings attached to people, contact details, addresses, private (non-trader) sellers, classifieds (OLX and Publi24 are out of scope, docs/02 §4.3).

## 2. Purpose test

The interests pursued are legitimate, specific and present:

1. **Consumers' interest in knowing who sells an offer.** For marketplace offers, whether the seller is a trader is material information (UCPD art. 7(4)(f), Law 363/2007 art. 7 alin. (4) lit. f)); a comparator that shows marketplace offers without the seller's identity would mislead.
2. **Pretoscop's commercial interest** in an accurate price comparison and a truthful price history, its core service (Art. 6(1)(f), recital 47).
3. **Sellers' own interest** in being found: comparators send buyers to their offers.

## 3. Necessity test

- The seller name is needed to tell apart several offers of the same product on one marketplace, to display "vândut de X prin eMAG Marketplace" and to apply the marketplace flag in rankings and in the default "cel mai mic preț" series (docs/03 §6.4).
- Less intrusive options considered: omitting or hashing the name (breaks the trader-status disclosure and the buyer's ability to recognise the seller); using the marketplace's internal seller id (meaningless to buyers). Neither achieves the purpose.
- Minimisation in place: only the name as published; no other attribute of the person; no cross-source profiles; no enrichment from other datasets; no use for marketing.
- Product titles are stored as published because they identify the product; the names they contain are not used as data in their own right.

## 4. Balancing test

| Factor | Assessment |
|---|---|
| Nature of the data | A trade name used publicly in commerce; no special-category data; nothing about private life |
| Source | Published by the seller, through the marketplace, to the public for commercial purposes |
| Reasonable expectations | A trader selling on a public marketplace expects the trade name to be shown to buyers and indexed by search engines and comparison services |
| Impact on the person | Low; mostly positive (more visibility). Risk of outdated information is reduced by per-offer "last checked" times and by deactivating offers that disappear |
| Vulnerable persons | None expected (traders acting in a professional capacity) |
| Scale and duration | Limited number of names; kept as long as the offer history, which is the purpose of the service |
| Power imbalance | None: sellers can object at any time and are informed publicly |

Outcome: the legitimate interests are not overridden by the interests or fundamental rights of the sellers concerned, provided the safeguards below are kept.

## 5. Safeguards

1. Business names only; no classifieds, private sellers, images, descriptions, reviews or contact details (enforced in `packages/extractors` and reviewed when a source is added).
2. The name is shown only next to the offer it belongs to: no seller profile pages, no rankings of people.
3. Objection (Art. 21) through privacy@pretoscop.ro or `/contact?subiect=privacy`: the seller's name is suppressed from display and from new observations, and the suppression is logged. **To implement:** an admin action for this (M09 follow-up); until then the founders apply it by hand in the database and record it in `audit_log`.
4. Information (Art. 14): individual notification is impossible or would need disproportionate effort (no contact details are collected, and contacting each seller would require more data). Public information is given in the privacy policy (`/confidentialitate#magazine`), as Art. 14(5)(b) allows.
5. Seller names are kept out of LLM prompts (M22) and out of B2B exports at person level (M28).
6. Access control, EU hosting and retention as in `ropa.md` (P7).

## 6. Review triggers

Re-run this assessment before: adding classifieds or second-hand sources; introducing seller-level features (seller pages, seller ratings, seller alerts); sending offer data with seller names to a new recipient; or when objections from sellers show a pattern. Also re-check after any change in the trader-status disclosure rules or a supervisory authority's guidance on web data collection.

## Sign-off

| Role | Name | Date |
|---|---|---|
| Founder | | |
| Founder | | |
| Lawyer review (B5) | | |
