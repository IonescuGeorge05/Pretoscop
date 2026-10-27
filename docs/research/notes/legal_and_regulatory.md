# Legal and regulatory framework for "Pretoscop" (Romanian price comparison and price-history site): EU law and Romanian transposition, status 27 October 2026

Research notes for the report writer. Scope: (1) data collection, (2) display of offers, prices and rankings, (3) user data and communications, (4) monetization disclosures, (5) IP, (6) company and tax setup, (7) accessibility, (8) platform and ad-network policies. Also the name check and classifieds. This is practical guidance, not legal advice.

**Method and limits (read first).**
- EUR-Lex, CURIA/InfoCuria, BAILII, IPPT and legislatie.just.ro all refused automated retrieval during this session. They returned empty pages, HTTP 403 or "socket hang up". EU legislative texts were therefore checked against the UK National Archives' copy of EU-origin legislation (legislation.gov.uk, original OJ wording) and an unofficial DSA mirror. Romanian statutes were checked on legeaz.net, an unofficial consolidation that can lag behind amendments. One example of that lag is noted in section 4.
- The fetch tool only returns verbatim fragments of up to about 125 characters. Long provisions therefore appear as quoted fragments plus paraphrase.
- The shared web-search budget ran out partway through, so several tax and contract items could not be sourced. They are listed under "Gaps", sometimes with my working understanding clearly marked **[UNVERIFIED]**.
- Where I could not open the text of a CJEU judgment, I give the holding as it is commonly reported. It is marked "(official text not retrievable this session)" next to the EUR-Lex link.
- The domain checks were made live with WHOIS on 27 Oct 2026.

---

## 1. Data collection: is crawling and re-using retailer product and price data lawful? (Database Directive and CJEU case law, the TDM exception and opt-outs, the Data Act, Romanian Law 8/1996, Criminal Code art. 360, ToS/browsewrap, GDPR for scraped personal data)

### Takeaway
A Romanian shop's product, price and availability catalogue is very likely a database protected by the sui generis right. Copying and indexing it, then re-displaying it, is "extraction" and "re-utilisation". Since *CV-Online Latvia* (C-762/19, 2021), the shop can stop this only where it adversely affects the shop's investment, meaning there is a risk to recouping that investment through normal operation of its site. Innoweb-style "meta search engines" that replicate the shop's own search are the high-risk pattern. A traffic-sending comparator that shows a few data points per offer and deep-links to the shop is the low-risk one. Where a shop's data is not protected by copyright or the sui generis right, its contract terms can still bind users (*Ryanair*, C-30/14). Robots.txt or other machine-readable reservations defeat the general TDM exception (DSM Art. 4), but that exception only covers reproductions and extractions for analysis. It does not cover re-publishing prices.

The criminal-law exposure in Romania (Criminal Code art. 360, illegal access, up to 2–7 years where access-restriction measures exist) is concentrated on bypassing technical restrictions: logins, anti-bot challenges, IP blocks. It does not attach to fetching public pages politely. The safest architecture is feeds or consent first (affiliate networks, merchant feeds), with polite crawling only of public pages as a fallback, and no circumvention.

### Cited Findings

**Database Directive 96/9/EC (sui generis right)**
- Art. 7(1) provides that "Member States shall provide for a right for the maker of a database". The right arises where there has been a substantial investment in obtaining, verification or presentation of the contents. It allows the maker to prevent extraction and/or re-utilisation of the whole or a substantial part — [legislation.gov.uk, Dir. 96/9/EC art. 7](https://www.legislation.gov.uk/eudr/1996/9/article/7)
- Art. 7(2)(a) defines extraction as "the permanent or temporary transfer of all or a substantial part of the contents of a database" to another medium by any means or in any form. Art. 7(2)(b) defines re-utilisation as "any form of making available to the public all or a substantial part of the contents of a database", including by online transmission — [legislation.gov.uk](https://www.legislation.gov.uk/eudr/1996/9/article/7)
- Art. 7(5) covers "The repeated and systematic extraction and/or re-utilization of insubstantial parts of the contents of the database". This is prohibited where it conflicts with normal exploitation or unreasonably prejudices the maker's legitimate interests. This is the provision that catches per-product crawling at scale — [legislation.gov.uk](https://www.legislation.gov.uk/eudr/1996/9/article/7)

**CJEU line of cases**
- *CV-Online Latvia v Melons*, C-762/19, judgment of 3 June 2021, ECLI:EU:C:2021:434 (Fifth Chamber; rapporteur Ilešič; AG Szpunar). Melons ran KurDarbs.lv, a specialised job-ad search engine. It indexed CV-Online's freely accessible job-ad database, copied it onto its own server, displayed CV-Online's meta tags in results and hyperlinked users to the source pages — [ICLR case report](https://www.iclr.co.uk/document/2021002793/casereport_604b1a8d-231f-46ae-ba15-854f8abec6a8/html); [SCL](https://www.scl.org/12290-cjeu-search-engine-copying-of-databases-infringes-sui-generis-right-where-it-adversely-affects-database-maker-investment/)
- AG Szpunar (January 2021) proposed that indexing infringes only if it adversely affects the maker's substantial investment. He treated the hyperlinks and meta-tag display as secondary manifestations of the extraction and re-utilisation — [Kluwer Copyright Blog](https://legalblogs.wolterskluwer.com/copyright-blog/search-engines-and-databases-in-the-search-for-a-balance-the-ags-opinion-in-the-cv-online-latvia-case/); see also [Clifford Chance Talking Tech (Feb 2021)](https://www.cliffordchance.com/insights/resources/blogs/talking-tech/en/articles/2021/02/are-all-search-engines-incompatible-with-sui-generis-database-right.html)
- The Court's test, as headlined by SCL: search-engine copying of databases infringes the sui generis right "where it adversely affects database maker investment" — [SCL](https://www.scl.org/12290-cjeu-search-engine-copying-of-databases-infringes-sui-generis-right-where-it-adversely-affects-database-maker-investment/). Husovec says the judgment "significantly alters the previous case law on the infringement test" — [husovec.eu](https://husovec.eu/2021/06/cjeu-redefines-sui-generis-database-right/)
- Operative part, paraphrased (official text not retrievable this session):
  - A specialised search engine that copies and indexes the whole or a substantial part of a freely accessible database, and lets users search it on its own site, "extracts" and "re-utilises" that database.
  - The maker may prohibit this only where the acts adversely affect its investment in obtaining, verification or presentation, i.e. where they create a risk to the possibility of redeeming that investment through normal operation of the database.
  - The national court must strike a fair balance with users' and competitors' legitimate interests, including access to information and the contribution of aggregators to the market.
  - Source: [EUR-Lex C-762/19](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62019CJ0762)
- *Innoweb v Wegener*, C-202/12, 19 Dec 2013 (official text not retrievable this session). An operator of a "dedicated meta search engine" re-utilises the whole or a substantial part of a protected database where it does all of the following:
  - offers the end user a search form with essentially the same functionality as the database's own form;
  - "translates" queries into the database's search engine in real time, so that the whole database is searched;
  - presents the results in its own website's format.
  - Source: [EUR-Lex C-202/12](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62012CJ0202)
- *Ryanair v PR Aviation*, C-30/14, 15 Jan 2015 (official text not retrievable this session). The Directive does not apply to a database protected neither by copyright nor by the sui generis right. Arts 6(1), 8 and 15 therefore do not prevent its maker from laying down contractual limitations on third-party use, without prejudice to applicable national law — [EUR-Lex C-30/14](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62014CJ0030)
- *British Horseracing Board v William Hill*, C-203/02, 9 Nov 2004 (official text not retrievable this session). Investment in "obtaining" means resources used to seek out existing independent materials and collect them. It does not mean resources used to create the materials. Extraction and re-utilisation cover any unauthorised appropriation or distribution, including indirect taking via a secondary source. Making the database publicly accessible does not extinguish the right — [EUR-Lex C-203/02](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62002CJ0203)
- *Football Dataco v Yahoo*, C-604/10, 1 Mar 2012: copyright in a database requires originality in the selection or arrangement of data. Skill and labour in creating the data are irrelevant — [EUR-Lex C-604/10](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62010CJ0604). *Football Dataco v Sportradar*, C-173/11, 18 Oct 2012: re-utilisation by sending data from a server located elsewhere takes place at least in the Member State whose public is targeted (both official texts not retrievable this session) — [EUR-Lex C-173/11](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62011CJ0173)

**TDM exception (DSM Directive 2019/790, Art. 4) and opt-outs**
- Art. 4(1): Member States "shall provide for an exception or limitation" for reproductions and extractions of lawfully accessible works and other subject matter for the purposes of text and data mining. This expressly includes the database maker's extraction right.
- Art. 4(2): the copies "may be retained for as long as is necessary for the purposes of text and data mining".
- Art. 4(3): the exception applies only if use "has not been expressly reserved by their rightholders in an appropriate manner", such as by machine-readable means for content made publicly available online.
- Source: [legislation.gov.uk, Dir. 2019/790 art. 4](https://www.legislation.gov.uk/eudr/2019/790/article/4)
- LG Hamburg, *Kneschke v LAION*, 310 O 227/23 (Sept 2024): the court tended to view a natural-language reservation in website terms as sufficiently explicit — [IPKat](https://ipkitten.blogspot.com/2024/09/guest-post-german-court-finds-laions.html?m=0); [Taylor Wessing](https://www.taylorwessing.com/en/insights-and-events/insights/2024/11/aiq-----laion-first-eu-decision-on-the-tdm-exception-in-the-context-of-genai-model-training)
- OLG Hamburg, 5 U 104/24 (December 2025):
  - It upheld dismissal on both the research exception (§ 60d UrhG) and the general TDM exception (§ 44b UrhG / DSM Art. 4).
  - A declaration is machine-readable if it "can be both perceived and interpreted by a machine". A natural-language reservation was not shown to meet that standard at the time of the 2021 download.
  - A further appeal to the BGH was admitted, so the decision is not final.
  - Sources: [Freshfields](https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/ai-training-copyright-part-2-text-and-data-mining-under-court-scrutiny-102mebl); [Bird & Bird](https://cm.twobirds.com/en/insights/2025/germany/higher-regional-court-hamburg-confirms-ai-training-was-permitted-(kneschke-v,-d-,-laion)); [Open Future (18 Dec 2025)](https://openfuture.eu/blog/laion-round-2-machine-readable-but-still-not-actionable/)
- Amsterdam District Court, *DPG Media v HowardsHome* (late 2024; a scraping case, not AI training): Art. 4(3) does not mandate a single technical standard, but a reservation must be practically detectable and processable by automated systems — [Open Future](https://openfuture.eu/blog/laion-round-2-machine-readable-but-still-not-actionable/)
- Danish Maritime and Commercial Court (Oct 2025; not AI training): a scraping or data-mining prohibition in a publicly accessible HTML privacy or data policy could be an "appropriate" reservation under Art. 4(3) — [Open Future](https://openfuture.eu/blog/laion-round-2-machine-readable-but-still-not-actionable/)
- The first TDM-related CJEU referral (*Like Company v Google*) is pending — [Freshfields](https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/ai-training-copyright-part-2-text-and-data-mining-under-court-scrutiny-102mebl)

**Romanian criminal law, Criminal Code (Law 286/2009), art. 360 "Accesul ilegal la un sistem informatic"** — [legeaz.net, art. 360](https://legeaz.net/noul-cod-penal/art-360)
- (1) "Accesul, fără drept, la un sistem informatic se pedepseşte cu închisoare de la 3 luni la 3 ani sau cu amendă." Translation: *Access without right to a computer system is punished with 3 months to 3 years' imprisonment or a fine.*
- (2) "Fapta prevăzută în alin. (1), săvârşită în scopul obţinerii de date informatice, … se pedepseşte cu închisoarea de la 6 luni la 5 ani." Translation: *If committed in order to obtain computer data: 6 months to 5 years.*
- (3) "Dacă fapta prevăzută în alin. (1) a fost săvârşită cu privire la un sistem informatic la care, prin intermediul unor proceduri, dispozitive sau programe specializate, accesul este restricţionat sau interzis pentru anumite categorii de utilizatori, pedeapsa este închisoarea de la 2 la 7 ani." Translation: *If the system's access is restricted or prohibited for certain categories of users through specialised procedures, devices or programs: 2 to 7 years.*
- Neighbouring offences on the same page: art. 361 (illegal interception), art. 362 "Alterarea integrităţii datelor informatice", art. 363 "Perturbarea funcţionării sistemelor informatice" (disrupting the functioning of computer systems, relevant if crawling overloads a shop) and art. 364 "Transferul neautorizat de date informatice". The page does not define "fără drept" — [legeaz.net](https://legeaz.net/noul-cod-penal/art-360)

**Example of Romanian anti-extraction contract language (illustrative)**
- The RoTLD WHOIS banner (queried 27 Oct 2026) reads: "it is explicitly forbidden to extract, copy and/or use or re-utilise in any form and by any means … the whole or a quantitatively or qualitatively substantial part of the contents of the WHOIS database without prior and explicit permission by ROTLD, nor in any attempt hereof, to apply automated, electronic processes to ROTLD". This shows how Romanian operators phrase sui generis and ToS reservations that a crawler must respect — [RoTLD](https://www.rotld.ro) (port-43 WHOIS response)

### Inferences
- **Risk ranking of data-acquisition methods (lowest to highest):**
  - (a) Affiliate-network product feeds (2Performant, Profitshare and similar). These come with a licence under the network terms.
  - (b) Direct merchant feeds under a CPC or listing contract. Get an express licence, including for images.
  - (c) Polite crawling of public product pages, extracting only price, availability, shipping, GTIN/EAN and URL, and linking out. Here the CV-Online "adverse effect on investment" test should favour a traffic-sending comparator.
  - (d) Copying descriptions, images and reviews. This brings in copyright, database rights, GDPR and Google "thin affiliation" exposure.
  - (e) Mirroring a shop's search, or Innoweb-style real-time query translation. This is the pattern the CJEU held to be re-utilisation.
  - (f) Circumventing anti-bot measures, logins, CAPTCHAs or IP bans. This risks Criminal Code art. 360(3).
- **TDM versus comparison.** Computing price histories and fake-discount analytics is plausibly "text and data mining": automated analysis to generate patterns and trends. Art. 4, however, only exempts reproductions and extractions. Publicly displaying each shop's current price and stock is re-utilisation, and Art. 4 does not exempt it. Treat robots.txt `Disallow`, `noai`/TDMRep headers and explicit ToS anti-scraping clauses as binding reservations. The courts are converging on "machine-readable", but the Danish court accepted an HTML policy text.
- **Contract risk (Ryanair).** If a small shop's catalogue does not meet the "substantial investment" threshold, its ToS can still restrict use, and breach of contract becomes the main claim. Avoid creating accounts or clicking "I agree" with crawler identities. Honour cease-and-desist letters promptly, and offer shops an opt-out or opt-in form.
- **Engineering rules ("polite crawling" policy):**
  - Identify the crawler with a User-Agent and contact URL.
  - Obey robots.txt, including crawl-delay.
  - Rate-limit per host, back off on 429/503, and crawl off-peak.
  - Never rotate residential proxies to evade blocks. Never solve CAPTCHAs or replay session tokens.
  - Stop crawling a host on the first explicit block or written objection.
  - Log all of this as evidence of good faith and of no "access without right".
- **GDPR in scraped data.** Marketplace seller names can be personal data (sole traders or PFAs, and private sellers on OLX), and so can reviewer names. Store only what is needed: merchant legal or brand name and, for private sellers, nothing identifying beyond the listing URL. Document a legitimate-interest assessment (Art. 6(1)(f) GDPR), and consider whether Art. 14 information duties apply. Simplest option: do not ingest reviews or private-seller identities at all.

### Gaps
- **Romanian Law 8/1996** (copyright; republished 2018). I could not verify the article numbers for the database sui generis chapter or for the Romanian transposition of DSM Arts 3–4, because legislatie.just.ro was unreachable. My understanding [UNVERIFIED] is that the DSM Directive was transposed by Law 69/2022 amending Law 8/1996, and that the sui generis right sits in the "drepturi sui generis ale fabricanților de baze de date" chapter. The writer should cite the consolidated text at legislatie.just.ro.
- **No Romanian court decisions** on scraping or price-comparison disputes were found: nothing involving compari.ro, price.ro, OLX or eMAG versus aggregators. The search budget ran out before targeted Romanian case-law databases (e.g., rolii.ro, ReJust) could be searched. **No Romanian doctrine** on whether scraping public pages is "acces fără drept" was found.
- **Browsewrap enforceability in Romania** is not verified. My understanding [UNVERIFIED]: Civil Code arts 1202–1203 (standard clauses) make "unusual" clauses effective only if expressly accepted in writing. A crawler that never clicks "accept" is therefore hard to bind to a browsewrap, but the Ryanair-type contract theory remains open.
- **EU Data Act (Reg. 2023/2854)** was not retrieved. My understanding [UNVERIFIED]: it has applied since 12 Sept 2025, mainly to connected-product data. Its Art. 43 disapplies the sui generis right for databases of data obtained from or generated by connected products. Low relevance to retail price data.
- The **Polish UODO/Bisnode** decision (Art. 14 GDPR duties for scraped data) and the **Dutch AP 2024 scraping guidance** could not be retrieved.

---
## 2. Consumer-law display rules: Omnibus and 30-day prior price, ranking transparency, paid placement, trader/consumer status, P2B, DSA, CRD, Commission "Key principles for comparison tools"

### Takeaway
Pretoscop is a trader engaging in B2C commercial practices, so the UCPD (Romanian Law 363/2007 as amended by OUG 58/2022) applies directly to how it ranks and presents offers. Five rules drive the design:

1. Publish the main ranking parameters and their relative importance in a dedicated section that is directly reachable from every results page (UCPD Art. 7(4a)).
2. Clearly disclose any paid placement or payment for higher ranking. If this is not disclosed, it is a per se unfair practice (Annex I point 11a).
3. Explain the business model (affiliate, CPC, ads, data sales) and give the market coverage (Commission Key Principles 2 and 4).
4. For marketplace or classifieds offers, show whether the seller is a trader (Art. 7(4)(f)).
5. If reviews are shown, say whether and how they are checked (Art. 7(6)).

The 30-day "prior price" rule (Art. 6a Price Indication Directive; Romanian HG 947/2000 as amended by HG 686/2022, in force 28 May 2022) formally binds the trader that announces a reduction, i.e. the shop. Once Pretoscop shows its own "-X%" or "reducere" badges, though, it is making its own price-advantage claim. That claim should be computed against the lowest price in the prior 30 days, following the CJEU's Aldi Süd reasoning, or clearly attributed to the shop.

Regulation by regulation:
- **P2B Regulation 2019/1150.** Pretoscop is very likely an online intermediation service towards merchants it has a contract with (CPC listings, affiliate programmes). That triggers the Art. 3 terms-and-conditions duties and Art. 5 ranking-parameter disclosure, including how paid influence works. Small-enterprise exemptions apply to internal complaint-handling (Art. 11) and mediation.
- **DSA.** Pretoscop becomes a hosting service and an online platform for merchant-supplied feeds and any user reviews or comments. Micro and small enterprises are exempt from most platform-specific duties (Art. 19). Baseline duties still apply: points of contact, terms and conditions, notice and action, and, under Romanian Law 50/2024, notifying ANCOM within 45 days of starting the service.

### Cited Findings

**Commission "Key principles for comparison tools" (2016; PDF metadata 22 July 2016)** — [European Commission PDF](https://commission.europa.eu/system/files/2017-06/key_principles_for_comparison_tools_en.pdf)
- Purpose: "The first series of principles seek at ensuring the [compliance with] … the Unfair Commercial Practices Directive". The second series improves user-friendliness "beyond legal requirements".
- **P1, impartiality and identification of advertising:**
  - "advertising and sponsored results must be prominently differentiated from organic comparison results".
  - Where the default ranking is affected by a relationship with a trader, "it should be clearly marked and consumers should also be given the option to rank the offers in an impartial way (e.g. by ascending price)".
  - Use "advertising" or "promoted link" labels when, for example, "a premium fee is paid … so that its offer(s) appear(s) more prominently/higher on the ranking page".
  - Banners "should be explicitly marked as such and separated visually from the results".
- **P2, business model:** disclose whether income stems from "advertising …", "pay-per-click", "pay-per-order/commission", "referencing manufacturers/sellers/providers" or "selling to other businesses data collected on its users". Also disclose ownership or affiliation with traders. Make this information "easily accessible from all pages of the website, e.g. in the 'About us' or 'FAQ' section".
- **P3, accuracy:**
  - Price and availability must correspond "exactly to the offer as made available by the seller".
  - Show the "final product price, including applicable taxes, charges, surcharges, additional fees and delivery costs".
  - Update "regularly and frequently" and "act promptly to correct inaccuracies".
  - "When offers are ranked by ascending prices, then final prices should serve as the criteria".
  - Availability information "could be completed with the time of the last update on the search result page".
  - Where delivery costs are unknown, give "indicative information by mentioning, for example, the standard shipping costs applicable".
- **P4, ranking and coverage:**
  - Ranking criteria should be "clearly and prominently indicated". "The criteria of the default ranking should be prominent, provided in a succinct way directly on the search results page".
  - Explain "how they collect data".
  - Specify coverage "in terms of sectors, number of sellers and geographical scope". For electronics and FMCG, give "the number of products and suppliers compared". Disclose important exceptions to coverage.
- **P5, reviews:** explain how reviews "are created, posted, ranked and sorted"; take anti-fake measures; publish negative reviews. "Sponsored reviews should be distinguished … [and] should not be counted in for aggregated review scores". Reviews posted by traders are "banned in all circumstances".
- **P6, contact details:** "including postal address and e-mail address".
- **P7–P9 (best practice):** complaint handling; plain language; accessibility, i.e. "follow existing international guidelines or standards on accessibility".

**UCPD 2005/29/EC as amended by Omnibus Directive (EU) 2019/2161 (applies from 28 May 2022)** — [legislation.gov.uk, Dir. 2019/2161 art. 3](https://www.legislation.gov.uk/eudr/2019/2161/article/3)
- New definition of "ranking": "the relative prominence given to products, as presented, organised or communicated by the trader, irrespective of the technological means used".
- New definition of "online marketplace": "a service using software, including a website, part of a website or an application, operated by or on behalf of a trader which allows consumers to conclude distance contracts with other traders or consumers". The last clause is the key for Pretoscop: it does not let consumers conclude contracts on its site.
- Art. 7(4a), OJ text, with the final sentence verified this session: "When consumers are provided with the possibility to search for products offered by different traders or by consumers on the basis of a query in the form of a keyword, phrase or other input, irrespective of where transactions are ultimately concluded, general information, made available in a specific section of the online interface that is directly and easily accessible from the page where the query results are presented, on the main parameters determining the ranking of products presented to the consumer as a result of the search query and the relative importance of those parameters, as opposed to other parameters, shall be regarded as material. This paragraph does not apply to providers of online search engines as defined in point (6) of Article 2 of Regulation (EU) 2019/1150."
- Art. 7(4)(f): "for products offered on online marketplaces, whether the third party offering the products is a trader or not, on the basis of the declaration of that third party to the provider of the online marketplace".
- Art. 7(6): "Where a trader provides access to consumer reviews of products, information about whether and how the trader ensures that the published reviews originate from consumers who have actually used or purchased the product shall be regarded as material."
- Annex I point 11a, always unfair: "Providing search results in response to a consumer's online search query without clearly disclosing any paid advertisement or payment specifically for achieving higher ranking of products within the search results."
- Annex I point 23b: "Stating that reviews of a product are submitted by consumers who have actually used or purchased the product without taking reasonable and proportionate steps to check that they originate from such consumers."
- Annex I point 23c: "Submitting or commissioning another legal or natural person to submit false consumer reviews or endorsements …"
- Art. 13 penalties: where fines are imposed under Art. 21 of Reg. 2017/2394 (CPC coordinated actions), "the maximum amount of such fines being at least 4 % of the trader's annual turnover". Where turnover data are unavailable, the maximum "shall be at least EUR 2 million".

**Price reductions: Art. 6a of Directive 98/6/EC (inserted by Omnibus Art. 2)** — [legislation.gov.uk, Dir. 2019/2161 art. 2](https://www.legislation.gov.uk/eudr/2019/2161/article/2)
- (1) Any announcement of a price reduction must indicate the trader's prior price for a determined period before the reduction.
- (2) "The prior price means the lowest price applied by the trader during a period of time not shorter than 30 days" before the reduction.
- (3)–(5) are Member State options: rapidly deteriorating goods, products on the market for less than 30 days, and progressive reductions (the price before the first reduction counts).
- Note the addressee: "the trader" whose price it is.
- *Aldi Süd*, C-330/23, 26 Sept 2024 (official text not retrievable this session): a percentage reduction or a "price highlight" announced by a trader must be determined on the basis of the Art. 6a(2) prior price, i.e. the 30-day lowest — [EUR-Lex C-330/23](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62023CJ0330)

**Romanian transposition of Art. 6a: HG 947/2000 (price indication) as amended by HG 686/2022**
- The Government adopted HG 686/2022 on 25 May 2022 to transpose Directive 2019/2161 into HG 947/2000. It was published on 26 May and took effect on 28 May 2022. Any price reduction must show the prior price, defined as "cel mai scăzut preţ practicat de vânzător în perioada ultimelor 30 de zile înainte de data aplicării reducerii de preţ". Translation: *the lowest price the seller charged in the last 30 days before the reduction took effect.* Worked example given: a vacuum cleaner sold at 350, 420 and 370 lei over 30 days and then offered "-20%" at 360 lei must disclose 350 lei — [gadget.ro](https://gadget.ro/de-azi-28-mai-comerciantii-sunt-obligati-sa-afiseze-in-cazul-reducerilor-ofertelor-si-cel-mai-mic-pret-practicat-in-ultimele-30-de-zile/)
- Special cases: perishable products use a 10-day reference period. Products sold for less than 30 days use the lowest price since first offered. The seller must indicate the period of the prior price — [gadget.ro](https://gadget.ro/de-azi-28-mai-comerciantii-sunt-obligati-sa-afiseze-in-cazul-reducerilor-ofertelor-si-cel-mai-mic-pret-practicat-in-ultimele-30-de-zile/); see also [ANPC draft HG (2021)](https://anpc.ro/galerie/file/proiecte_acte/2021/Proiect_HG_modificare_HG_947.pdf) and the republished base text [legislatie.just.ro, HG 947/2000](https://legislatie.just.ro/Public/DetaliiDocumentAfis/255257)
- Fines: the 2021 draft reportedly set fines of 7,000 to 35,000 lei. Final amounts are not verified — [StartupCafe](https://www.startupcafe.ro/taxe/reguli-black-friday-reduceri-amenzi-magazine.htm)
- Enforcement precedent: ANPC fined eMAG 50,000 lei over Black Friday irregularities (2021). Among other things, the prior-price disclosure did not say when the 30-day window started — [TVR Info](https://tvrinfo.ro/anpc-a-amendat-emag-cu-50-000-de-lei-pentru-nereguli-in-timpul-black-friday-emag-aspectele-sesizate-au-fost-rezolvate_894691/). The most frequent finding in reduction campaigns is a displayed reference price that is not the lowest of the previous 30 days — [Capital](https://www.capital.ro/noi-sanctiuni-date-de-anpc-zeci-de-operatori-au-fost-amendati-pentru-nereguli-la-campaniile-de-reduceri.html); [Alba24 list of 22 brands fined](https://alba24.ro/lista-22-de-branduri-si-magazine-cunoscute-amendate-de-anpc-pentru-reducerile-si-promotiile-de-black-friday-883946.html); [Antena 3](https://www.antena3.ro/actualitate/amenzi-magazine-reduceri-black-friday-620086.html)

**Romanian transposition of the UCPD amendments and sanctions: Law 363/2007 as amended**
- OUG 58/2022 (applicable from 28 May 2022) amended the consumer-protection acts. Where sanctions are applied under Art. 21 of Regulation (EU) 2017/2394, the trader can be fined from 0.1% up to and including 4% of annual turnover. Repeated non-compliance with Law 363/2007 "în două acțiuni distincte" (in two separate enforcement actions) is reported as fined 5,000–200,000 lei — [TaxNews (OUG 58/2022)](https://taxnews.ro/tag/oug-58-2022/?print=pdf)
- Base fine ranges in Law 363/2007 art. 15(1), as set by OG 37/2015:
  - 2,000–100,000 lei for unfair practices (art. 4(1)–(2));
  - 5,000–100,000 lei for misleading or aggressive practices (arts 6–7 and Annex 1).
  - Check later amendments — [legeaz.net, OG 37/2015](https://legeaz.net/monitorul-oficial-654-2015/og-37-2015-modificarea)

**P2B Regulation (EU) 2019/1150**
- Art. 2(2): "online intermediation services" are information society services that "allow business users to offer goods or services to consumers" with a view to facilitating direct transactions, irrespective of where those transactions are ultimately concluded. They must also be "provided to business users on the basis of contractual relationships" — [legislation.gov.uk, art. 2](https://www.legislation.gov.uk/eur/2019/1150/article/2)
- Art. 2(5): an "online search engine" is a service letting users search "in principle, all websites" or all websites in a particular language. A vertical shopping comparator is not that — [legislation.gov.uk, art. 2](https://www.legislation.gov.uk/eur/2019/1150/article/2)
- Art. 2(8): "ranking" means "the relative prominence given to the goods or services offered through online intermediation services" — [legislation.gov.uk, art. 2](https://www.legislation.gov.uk/eur/2019/1150/article/2)
- Recital 10: services "should be provided on the basis of contractual relationships". "Such a contractual relationship should be deemed to exist where both parties" unequivocally express an intention to be bound on a durable medium. No express written agreement is necessarily required — [legislation.gov.uk, recitals](https://www.legislation.gov.uk/eur/2019/1150/introduction)
- Recital 11 lists e-commerce marketplaces, app stores and social media as examples. It does **not** mention price-comparison tools by name (checked) — [legislation.gov.uk, recitals](https://www.legislation.gov.uk/eur/2019/1150/introduction)
- Art. 11(5): the internal complaint-handling obligation "shall not apply to providers of online intermediation services" that are small enterprises within the meaning of Recommendation 2003/361/EC — [legislation.gov.uk, art. 11](https://www.legislation.gov.uk/eur/2019/1150/article/11)

**Digital Services Act (EU) 2022/2065**
- Art. 3(g) "intermediary service" includes a "'hosting' service, consisting of the storage of information provided by, and at the request of," a recipient.
- Art. 3(i) "online platform": "a hosting service that, at the request of a recipient of the service, stores and disseminates information to the public". The exception is where that "is a minor and purely ancillary feature of another service".
- Art. 3(j) "online search engine": search of "in principle, all websites, or all websites in a particular language".
- Art. 3(s) "recommender system" includes systems "determining the relative order or prominence of information displayed".
- Art. 3(r) "advertisement": information promoting a message "presented by an online platform … against remuneration specifically for promoting that information".
- Source: [DSA art. 3 (unofficial mirror)](https://www.eu-digital-services-act.com/Digital_Services_Act_Article_3.html); official text [EUR-Lex Reg. 2022/2065](https://eur-lex.europa.eu/eli/reg/2022/2065/oj)
- Art. 19(1): Section 3 (Arts 20–28: complaint system, out-of-court settlement, trusted flaggers, ad transparency, dark patterns, recommender transparency, minors), "with the exception of Article 24(3) thereof, shall not apply to providers of online platforms that qualify as micro or small enterprises as defined in Recommendation 2003/361/EC". There is a 12-month grace period after losing that status, unless designated a VLOP — [DSA art. 19 (mirror)](https://www.eu-digital-services-act.com/Digital_Services_Act_Article_19.html)

**Romanian DSA implementation: Law 50/2024 (M.Of. no. 232 of 19 March 2024)** — [legeaz.net, Law 50/2024](https://legeaz.net/monitorul-oficial-232-2024/lege-50-2024)
- **Coordinator.** Art. 14(1): "ANCOM este desemnată drept coordonator al serviciilor digitale" (*ANCOM is designated Digital Services Coordinator*). ANCOM is also the EU single point of contact (art. 16).
- **Notification duty.** Art. 5(1): a Romanian provider must notify ANCOM within 45 days of starting to offer intermediary services. The notice gives identity data and the single points of contact for authorities (DSA Art. 11) and users (DSA Art. 12). Changes must be notified within 10 days (art. 5(3)). The form is set by an ANCOM decision (art. 5(2)), and ANCOM opens a "My ANCOM" account (art. 6).
- **Main fines.** Art. 34(1)(a): breaches of the DSA obligations listed in art. 32(1) points 1–53 carry a fine "de la 5.000 lei la maximum 6% din cifra de afaceri anuală" (*from 5,000 lei up to 6% of annual turnover*).
- **Information breaches.** Art. 34(1)(b): incorrect or misleading information, or refusing inspection, carries up to 1%.
- **First-year cap.** Art. 34(2): for breaches committed in the year activity started, the fine is 5,000–100,000 lei.
- **Notification fines.** Art. 33: failure to notify ANCOM under art. 5(1) carries 5,000–30,000 lei.
- **Periodic penalties.** Art. 44(1): "în cuantum maxim zilnic de 5% din cifra de afaceri zilnică medie la nivel mondial" (*up to 5% of average daily worldwide turnover per day*).
- **Other terms.** 50% of the fine may be paid within 15 days (art. 43(2)). Limitation period is 3 years (art. 46(1)). A supervision fee can be charged only from 1 Jan 2027 (art. 49(1)).
- **Other authorities.** The law also amended Law 365/2002 on e-commerce. The Authority for the Digitalization of Romania (ADR) supervises e-commerce service providers. ANSPDCP sanctions breaches of Law 365/2002 art. 22 lit. a), with fines of 1,000–100,000 lei.
- **ANCOM drafts.** ANCOM's draft decision on the information procedure says that until the art. 5 mechanism is operational, providers can join "My ANCOM" on request — [ANCOM explanatory note (consultation, Aug 2024)](https://ancom.ro/uploads/forms_files/EM_Proiect_Decizie_ANCOM_informare_FSI_CONSULTARE_29_08_20241724921041.pdf)

### Inferences
- **Classification of Pretoscop (as planned):**

| Regime | Applies? | Why / what it triggers |
|---|---|---|
| UCPD / Law 363/2007 | **Yes** | Pretoscop is a trader whose ranking and presentation are B2C commercial practices. It lets consumers search products "offered by different traders or by consumers … irrespective of where transactions are ultimately concluded", so Art. 7(4a) applies. Pretoscop is not a general "online search engine", so the carve-out does not help. |
| Omnibus Art. 6a / HG 947/2000 (30-day prior price) | **Directly: the shops.** Indirectly: Pretoscop whenever it publishes its own reduction claims | Pretoscop does not announce reductions of *its own* prices. Badges such as "-35%" or "Reducere" are its own statements about "the existence of a specific price advantage" (UCPD Art. 6(1)(d)). Apply the Aldi Süd logic. |
| "Online marketplace" (UCPD/CRD) | **No** (as planned) | Consumers do not conclude contracts on Pretoscop. This changes if checkout or "buy on Pretoscop" is added. |
| CRD 2011/83 / OUG 34/2014 | **Only for Pretoscop's own B2C sales** (premium subscription) | The merchant is the contracting trader for products. A premium consumer plan would trigger the full pre-contractual information duties and the 14-day withdrawal right, and digital-content rules would apply. |
| P2B 2019/1150 | **Likely yes** towards merchants with a contract (CPC, listing or affiliate terms accepted online). Arguably **no** for shops that are only crawled | Art. 3 (T&Cs, 15 days' notice of changes), Art. 4 (reasons for delisting), Art. 5 (main ranking parameters, including the effect of any remuneration on ranking), Art. 7 (differentiated treatment), Art. 9 (data access) and Art. 10 (parity clauses). Art. 11 complaint handling, and per my understanding Art. 12 mediation, are exempt for small enterprises (<50 staff and ≤ EUR 10m). |
| DSA: hosting / online platform | **Yes** for merchant-uploaded feeds and listings and for any user reviews, comments or Q&A. **No** for content Pretoscop scrapes and publishes itself (that is Pretoscop's own content, outside the Art. 6 hosting safe harbour) | All providers: Arts 11–12 (points of contact), 14 (T&Cs including moderation rules). Hosting: Arts 16–18 (notice and action, statements of reason, reporting criminal offences). Art. 15 transparency reports are exempt for micro/small per my understanding. Online-platform Section 3 duties are exempt while micro/small (Art. 19), apart from Art. 24(3) (giving user numbers to the regulator on request). Romanian Law 50/2024: **notify ANCOM within 45 days of launch.** |

- **Display checklist for engineers (Romania):**
  1. **"Cum ordonăm rezultatele" page** ("how we rank results"), linked next to every results list and sort selector. It lists the main parameters (e.g., total price including delivery, availability, shop rating, relevance to query, paid promotion) and their relative weight. Mirror the wording in the merchant T&Cs (P2B Art. 5).
  2. **Paid placement labels.** Every paid or boosted slot carries "Promovat" or "Publicitate" in a visually distinct box. Never mix paid boosts into the "Preț crescător" (ascending price) sort. Offer an always-available impartial sort.
  3. **Business-model disclosure** ("Cum câștigăm bani", "how we make money") reachable from every page (footer). It covers affiliate commissions, CPC, display ads and any B2B data sales, and any ownership links.
  4. **Coverage statement**, e.g. "Comparăm N produse din M magazine din România" ("we compare N products from M Romanian shops"), plus notable shops not covered.
  5. **Total price.** Use the total price where shipping is known. Otherwise state that shipping is extra, or show the shop's standard shipping cost.
  6. **Seller status** (trader or private individual) for any marketplace or classifieds offer.
  7. **Reviews.** If shown, state the source and verification method. Exclude sponsored reviews from scores.
  8. **Own discount badges.** Compute "reducere" against the Pretoscop-observed lowest price at that shop in the previous 30 days (product-specific), display that reference and the dates, and label shop-claimed strike-through prices as "preț anterior declarat de magazin" (prior price as declared by the shop).
  9. **"Fake discount" flags.** Use neutral, factual, reproducible wording, e.g. "Prețul de referință afișat de magazin (X lei) este mai mare decât cel mai mic preț observat de Pretoscop în ultimele 30 de zile (Y lei, la data Z)" ("The reference price shown by the shop (X lei) is higher than the lowest price Pretoscop observed in the last 30 days (Y lei, on date Z)"). Keep evidence (snapshots), publish the methodology and offer merchants a correction channel. This reduces defamation and unfair-competition exposure.
- **Penalty exposure.** Base ANPC fines run up to 100,000 lei per finding. A CPC coordinated action could reach 4% of turnover. Under the DSA (Law 50/2024), a first-year breach is capped at 100,000 lei.

### Gaps
- The Commission's **UCPD Guidance (2021/C 526/01)** has dedicated passages on comparison tools, ranking and paid placement. Its **Art. 6a Guidance (2021/C 526/02)** addresses who is bound by the prior-price rule and whether third-party price comparisons are covered. Neither could be retrieved, because EUR-Lex blocked automated access. The writer should cite [EUR-Lex 52021XC1229(05)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52021XC1229(05)) and [EUR-Lex 52021XC1229(06)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52021XC1229(06)) after checking them.
- **CPC network actions or sweeps against comparison websites.** Not found before the search budget ran out.
- **Romanian numbering.** The exact article and annex numbering under which Law 363/2007 now contains Art. 7(4a), 7(4)(f), 7(6) and Annex I points 11a/23b/23c is not verified. The current fine amounts under HG 947/2000 are also unverified; sources conflict and refer to a draft.
- **Commission P2B ranking guidelines (2020/C 424/01).** Not retrieved. My understanding [UNVERIFIED]: the P2B Arts 3–10 and 12(7) content summarised above is as I recall it, and I verified only Art. 2, Art. 11(5) and the recitals.
- **ANCOM notification decision.** The final number of the ANCOM decision setting the notification form, and whether the 45-day notification has become operational, are not verified.
- **Romanian enforcement.** No Romanian enforcement action against a price-comparison site was found.

---

## 3. Price accuracy liability: stale or wrong prices, disclaimers and timestamps

### Takeaway
A displayed price that is lower than the price the consumer finds at the shop, or an offer shown "în stoc" that is not, can be a misleading action as to price or availability. This risk sits with Pretoscop, which is the trader presenting the comparison, and potentially with the shop. A small-print disclaimer does not cure a misleading headline price. The defensible standard is the one in the Commission's Key Principles:
- update "regularly and frequently";
- show "the time of the last update";
- rank by final price;
- show delivery costs, or indicative standard shipping;
- "act promptly to correct inaccuracies".

In practice: timestamp every offer ("Preț actualizat la 14:32, 27.10.2026"), refresh the prices shown in the cheapest slots more aggressively, and drop or flag offers above a staleness threshold. On click-out, re-check the price if feasible.

### Cited Findings
- Comparison tools should ensure price and availability correspond "exactly to the offer as made available by the seller". "In no case should availability information give a false impression of scarcity" — [Commission Key principles, P3](https://commission.europa.eu/system/files/2017-06/key_principles_for_comparison_tools_en.pdf)
- They should update "regularly and frequently", "act promptly to correct inaccuracies once they become aware or are notified of them", and add "the time of the last update on the search result page". "When offers are ranked by ascending prices, then final prices should serve as the criteria for such a ranking." — [Commission Key principles, P3](https://commission.europa.eu/system/files/2017-06/key_principles_for_comparison_tools_en.pdf)
- They should give indicative delivery-cost information "by mentioning, for example, the standard shipping costs applicable" where exact costs are unknown — [Commission Key principles, P3](https://commission.europa.eu/system/files/2017-06/key_principles_for_comparison_tools_en.pdf)
- Google's CSS programme requires that "Products must lead users to a page where they can buy them". For CSS product pages, each page must show "the price and selling conditions from at least 2 merchant domains where the product is available for immediate purchase". This is useful as an industry accuracy benchmark — [Google CSS program requirements](https://support.google.com/css-center/answer/7524491?hl=en)
- Misleading or aggressive practices under Law 363/2007 are fined at 5,000–100,000 lei per finding, per art. 15 as amended by OG 37/2015 — [legeaz.net, OG 37/2015](https://legeaz.net/monitorul-oficial-654-2015/og-37-2015-modificarea). CPC-type coordinated cases can reach up to 4% of turnover under OUG 58/2022 — [TaxNews](https://taxnews.ro/tag/oug-58-2022/?print=pdf)

### Inferences
- **Recommended UI and technical standard:**
  - Per-offer timestamp ("actualizat acum 2 ore" / "actualizat la …"), with an exact timestamp on hover.
  - A global note on the results page: "Prețurile și disponibilitatea sunt preluate automat de pe site-urile magazinelor și pot fi modificate de acestea; prețul final este cel afișat de magazin la plasarea comenzii" ("Prices and availability are collected automatically from the shops' sites and may be changed by the shops; the final price is the one the shop shows when the order is placed").
  - Exclude offers older than a set threshold (e.g., more than 24h for volatile categories) from the "cel mai mic preț" (lowest price) badge.
  - Re-crawl the top-N cheapest offers more often.
  - Re-verify the price at click-out time if the shop's API or feed allows it.
  - A "Raportează o eroare de preț" (report a price error) button feeding a correction SLA.
  - Keep crawl logs so you can prove what was displayed and when.
- **Disclaimers.** A disclaimer supports good faith but does not neutralise a misleading headline. The obligation is to keep data accurate and to correct promptly.
- **Contracts with merchants (CPC/feeds).** The merchant warrants the accuracy of feed data and must update it promptly, and indemnifies Pretoscop for feed errors. Pretoscop may suspend offers on mismatch. Under P2B Art. 4, give a statement of reasons when restricting or suspending a business user. That article was not verified this session.

### Gaps
- **German case law** (persuasive only, not retrieved this session). My understanding [UNVERIFIED] is that the BGH held a retailer liable for misleading advertising where a price-comparison engine showed its old, lower price for hours after the retailer had raised it ("Espressomaschine", I ZR 123/08, 2010). It also required shipping costs to be visible in comparison listings ("Versandkosten bei Froogle"). The writer should verify before citing.
- **No Romanian decisions** on liability of comparison sites for stale prices were found.

---
## 4. Data protection and communications: GDPR + Law 190/2018, cookies (Law 506/2004), price alerts, newsletters, push and Telegram, DPO, RoPA, Google Analytics, transfers, Romanian fines

### Takeaway
Two regimes apply in parallel. The GDPR sets the lawful basis. The Romanian ePrivacy law, Law 506/2004, governs cookies and terminal access (art. 4(5)–(6)) and unsolicited commercial communications (art. 12).

- **Cookies.** Non-essential cookies, SDKs and pixels require prior consent. ANSPDCP actively fines Romanian sites for this: 5,000–30,000 lei in recent cases under art. 4(5) lit. a)–b). The statutory range is 5,000–100,000 lei, or up to 2% of turnover for companies above 5M lei turnover.
- **Commercial e-mails.** These require prior express consent, except a narrow soft opt-in for the trader's own customers and similar products.
- **Price alerts.** A user-requested alert can rest on contract (GDPR Art. 6(1)(b)). Because alerts carry merchant offers and affiliate links, implement them as an explicit opt-in subscription with double opt-in, a one-click unsubscribe in every message and no extra marketing content. Newsletters and promotional digests need consent.
- **Pending law.** A Romanian bill to harden cookie-banner rules ("reject all" on the first layer, no dark patterns) was under parliamentary review in 2026.
- **Analytics and transfers.** For Google Analytics and US vendors, the EU–US Data Privacy Framework remains valid after the General Court's *Latombe* ruling (3 Sept 2025). An appeal (C-703/25 P) is pending, so keep a fallback such as self-hosted analytics.

### Cited Findings

**Law 506/2004 (Romanian ePrivacy)**
- **Art. 12 (comunicări nesolicitate).**
  - (1) "Este interzisă efectuarea de comunicări comerciale" (*making commercial communications is prohibited*) by automated calling systems, fax, e-mail or any other method using publicly available electronic communications services, unless the subscriber has given prior express consent.
  - (2) Exception: a trader that obtained a customer's e-mail address in the context of a sale "poate utiliza adresa respectivă, în scopul efectuării de comunicări comerciale" (*may use that address for commercial communications*) for similar products or services. It must offer a clear, free and simple opt-out both at collection and in every message.
  - (3) "În toate cazurile este interzisă efectuarea prin poştă electronică de comunicări comerciale" (*commercial e-mail is always prohibited*) where the sender's identity is concealed or no valid opt-out address is given.
  - (4) Paras (1) and (3) also protect corporate subscribers.
  - Source: [legeaz.net, art. 12](https://legeaz.net/legea-506-2004-prelucrare-date-caracter-personal/articolul-12)
- **Art. 13 (sanctions).** Breaches of art. 4(5) and art. 12, among others, are fined "cu amendă de la 5000 lei (RON) la 100.000 lei (RON)". For companies "cu o cifră de afaceri de peste 5.000.000 lei (RON)" (*with turnover above 5,000,000 lei*), the fine is "până la 2% din cifra de afaceri" (*up to 2% of turnover*). Some offences carry 30,000–100,000 lei (art. 13(3)) — [legeaz.net, art. 13](https://legeaz.net/legea-506-2004-prelucrare-date-caracter-personal/articolul-13). The letter numbering of art. 13(1) shown on legeaz.net may be outdated: ANSPDCP decisions cite art. 13(1) lit. i) for cookies, and older decisions cite lit. q) for unsolicited e-mail.
- **Art. 4(5)–(6) (terminal equipment / cookies).**
  - Para (6) exempts storage or access "în scopul exclusiv al efectuării sau facilitării transmiterii unei comunicări" (*solely to carry out or facilitate the transmission of a communication*) or "strict necesare pentru furnizarea unui serviciu al societăţii informaţionale" (*strictly necessary to provide an information society service*) that the user expressly requested — [legeaz.net, art. 4](https://legeaz.net/legea-506-2004-prelucrare-date-caracter-personal/articolul-4)
  - legeaz.net shows a pre-2015 version of para (5) (information plus option to refuse). ANSPDCP now enforces **consent plus prior information**, citing "art. 4 alin. (5) lit. a) și b)" — see the fines below. The consolidated text should be checked on legislatie.just.ro.

**Romanian enforcement examples (ANSPDCP)**
- **iHunt** (phone and electronics brand): fined 20,000 lei (about EUR 4,000) for storing cookies on users' devices without consent, art. 4(5) lit. a)–b) — [Economedia](https://economedia.ro/producatorul-de-telefoane-ihunt-amendat-cu-20-000-de-lei-pentru-stocarea-de-module-cookies-pe-dispozitivele-clientilor-fara-acordul-lor.html); [StartupCafe](https://startupcafe.ro/brandul-romanesc-ihunt-de-electronice-si-electrocasnice-amenda-de-mii-de-eur-pentru-cookie-uri-92091)
- **"There's an AI for that SRL"** (Romanian AI-tools directory): fined 30,000 lei (about EUR 6,000) for non-essential cookies without information or explicit consent, after an October 2025 investigation — [StartupCafe](https://startupcafe.ro/date-personale-site-romanesc-care-ajuta-la-gasirea-aplicatiilor-ai-potrivite-amendat-cu-aproape-6-000-eur-pentru-cookie-uri-89148)
- **An online travel agency (Coral Travel)**: fined 5,000 lei for storing technically unnecessary cookies without consent, with a corrective order. The banner must be clear, non-necessary cookies must be blocked until valid consent and there must be a real, informed choice — [StartupCafe](https://startupcafe.ro/agentie-online-de-turism-amendata-pentru-cookie-urile-de-pe-site-ce-lege-a-incalcat-88031)
- **An online platform for homeowners' associations**: fined "thousands of lei" for cookies — [StartupCafe](https://startupcafe.ro/platforma-online-pentru-asociatiile-de-proprietari-din-romania-amendata-cu-mii-de-lei-pentru-cookie-uri-102362)
- **Elefant Online SA (elefant.ro)**: fined 10,000 lei (2019) for marketing e-mails sent without proof of prior, express and unequivocal consent — [Financial Intelligence](https://financialintelligence.ro/operatorul-elefant-online-a-fost-amendat-cu-10-000-lei-pentru-ca-a-transmis-mesaje-comerciale-nesolicitate/)

**Pending Romanian cookie reform (2026)**
- A draft law amending Law 506/2004 was "currently under legislative review in the Romanian Parliament" as of 27 April 2026. It would require:
  - a first-layer refusal option "equally visible and accessible" as acceptance;
  - that detailed settings cannot replace a one-click refusal;
  - a ban on pre-ticked categories, misleading wording and smaller or hidden refusal buttons;
  - that withdrawal be as easy as giving consent.
- Sanctions would be 5,000–100,000 lei, or up to 2% of turnover above 5M lei, enforced by ANSPDCP, with 120 days to comply after entry into force — [AmCham Romania / Baciu Partners](https://www.amcham.ro/business-intelligence/new-rules-on-cookie-consent-aligning-romanian-legislation-with-european-standards)
- It is referred to as "Legislative Proposal no. 256/2026" — [Mondaq](https://webiis08.mondaq.com/privacy-protection/1782518/upcoming-changes-to-romanian-cookie-consent-framework)

**Google Analytics and transfers**
- I found no ANSPDCP decision on Google Analytics. Other DPAs found GA transfers unlawful before the DPF:
  - Austria (DSB, first noyb decision) — [Orrick](https://www.orrick.com/en/Insights/2022/02/The-Austrian-Data-Protection-Authority-Groundbreaking-Google-Analytics-Decision)
  - France (CNIL, IP anonymisation insufficient) — [EPFL summary of CNIL](https://www.epfl.ch/campus/services/data-protection/en/use-of-google-analytics-and-data-transfers-to-the-united-states-the-cnil-orders-a-website-manager-operator-to-comply/)
  - Sweden (IMY fines on Tele2 and CDON) — [Spotmedia](https://spotmedia.ro/stiri/it/companiile-trebuie-sa-renunte-la-google-analytics-amenda-uriasa-in-suedia-pentru-incalcarea-gdpr)
- **DPF.** The General Court dismissed *Latombe v Commission* (T-553/23) on 3 Sept 2025. It reviewed the situation as at the July 2023 adequacy decision. Latombe appealed on 31 Oct 2025 (C-703/25 P; OJ notice 22 Dec 2025), and self-certified US recipients can still be used meanwhile — [Digital Policy Alert](https://digitalpolicyalert.org/event/35459-latombe-filed-appeal-against-general-court-dismissal-of-challenge-to-european-unionunited-states-data-protection-framework-adequacy-decision-in-latombe-v-commission); [WilmerHale (1 Dec 2025)](https://www.wilmerhale.com/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20251201-european-court-of-justice-to-review-challenge-to-eu-us-data-privacy-framework); [OJ C/2025/6610](https://eur-lex.europa.eu/eli/C/2025/6610/oj/eng)

**EDPB / WP29 guidance**
- EDPB **Guidelines 2/2023 on the Technical Scope of Art. 5(3) ePrivacy Directive**, Version 2.0, final, dated 16 Oct 2024. They address tracking pixels, URL tracking and other non-cookie techniques. Content not retrieved this session — [EDPB](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-22023-technical-scope-art-53-eprivacy-directive_en)
- **WP243 rev.01 Guidelines on DPOs** (30 Oct 2017), endorsed by the EDPB. They give examples of "regular and systematic monitoring" and the "large scale" factors. Content not retrieved this session — [European Commission / Article 29 WP](https://ec.europa.eu/newsroom/article29/items/612048)

### Inferences
- **Lawful-basis map for Pretoscop:**

| Processing | GDPR basis | ePrivacy (Law 506/2004) | Notes |
|---|---|---|---|
| Account (email, password hash, watchlists) | Art. 6(1)(b) contract | Strictly necessary cookies only (session/auth): art. 4(6) | Minimise; allow account deletion. |
| **Price-drop alert e-mails** (user sets "anunță-mă când scade sub X lei", i.e. "tell me when it drops below X lei") | Art. 6(1)(b): the user requested the service | **Treat as requiring explicit opt-in.** Content contains offers and affiliate links, so it is arguably a commercial communication under art. 12. | Double opt-in; per-alert and global unsubscribe link in every e-mail; sender identity and address; no unrelated promotions. |
| Newsletter / "deals of the week" | Art. 6(1)(a) consent | art. 12(1) prior express consent | Unticked checkbox, separate from ToS; keep consent logs (timestamp, IP, text version). |
| Web push notifications | Consent (browser permission + in-app explanation) | Service-worker and push subscription store or access info on the device, so treat as art. 4(5) consent | Offer an easy revoke in settings. |
| Telegram bot alerts | Art. 6(1)(b) (user-initiated) | – | Telegram acts as an independent controller. Disclose it in the privacy policy and handle the third-country transfer. |
| Analytics | Consent for GA4 and similar. Cookieless or self-hosted tools may reduce risk, but EDPB 2/2023 treats many non-cookie techniques as terminal access too. | art. 4(5) | Consider self-hosted Matomo or Plausible (EU-hosted), with IP truncation and no cross-site identifiers. |
| Ads (AdSense, programmatic) | Consent, via an IAB TCF CMP for Google ads in the EEA [UNVERIFIED: Google's CMP requirement page not retrieved] | art. 4(5) | Do not load ad tags before consent. |
| Affiliate click tracking (network cookies or redirects) | Consent for network cookies set on Pretoscop's domain. Redirect-only tracking may need consent depending on implementation. | art. 4(5) | Check 2Performant/Profitshare technical docs. |
| Email open or click tracking pixels | Consent (EDPB 2/2023 scope) | art. 4(5) | Or disable open-tracking. |
| Scraped data with personal data (seller names, reviews) | Art. 6(1)(f) with documented LIA | – | Prefer not to collect. |

- **DPO (GDPR Art. 37).** Probably not mandatory at launch. Pretoscop's core activities are not large-scale regular and systematic monitoring unless it builds behavioural profiling or retargeting at scale. Document the assessment. Behavioural advertising and email retargeting are classic WP243 examples, so re-assess at scale.
- **Records of processing (Art. 30).** Keep them. The under-250-employee exemption does not apply because the processing is not occasional.
- **DPIA (Art. 35).** Run one if profiling or personalisation of offers or prices is introduced.
- **Privacy policy (Art. 13).** It should list:
  - controller identity (SRL, CUI, address, email);
  - purposes and bases per row above;
  - recipients (ESP, push provider, Telegram, analytics, ad networks, affiliate networks);
  - transfers and safeguards (DPF or SCCs);
  - retention periods;
  - rights, including the right to object to direct marketing;
  - the complaint route to ANSPDCP;
  - whether provision of data is required;
  - any automated decision-making.
- **Retention (suggested).** Inactive accounts: 24 months, then deletion after a reminder. Consent logs: as long as consent lasts plus the limitation period. Server logs: 30–90 days. Unsubscribe suppression list: indefinitely, as a hash.
- **Cookie banner (do now, ahead of the pending bill).**
  - "Accept all", "Reject all" and "Setări" (settings) on the first layer, equally prominent.
  - Nothing non-essential fires before consent.
  - Granular purposes, re-openable from the footer.
  - Consent records kept.

### Gaps
- **Law 190/2018** (Romanian GDPR implementing law). Not retrieved. My understanding [UNVERIFIED]: it mainly covers national ID numbers (CNP), employee monitoring and sanctions for public bodies. Avoid collecting CNPs.
- **ANSPDCP official guidance** on cookies, Google Analytics, web push or price alerts. Not found (search budget exhausted). **No Romanian decision on whether solicited price alerts count as commercial communications.**
- **EU "Digital Omnibus"** proposals (Nov 2025) to move cookie rules into the GDPR, and the **ePrivacy Regulation**. Status not verified.
- **Telegram's** data location and controller status. Not verified.

---

## 5. Monetization disclosures: affiliate links, sponsored placements, ads, Google rel="sponsored", AdSense and Google Shopping CSS policies, ANPC influencer guidance

### Takeaway
Legally (UCPD/Law 363/2007 and the Commission's Key Principles):
- paid placement or ranking must be clearly labelled (Annex I 11a is a per se ban if undisclosed);
- ads must be visually separated and marked;
- the business model (commissions, CPC, ads, data sales) must be disclosed on an easily reachable page.

Search and ad-network rules (Google):
- outbound paid links (ads, paid placements, and in practice affiliate and CPC links) should carry `rel="sponsored"`, or `nofollow`, to avoid link-spam treatment;
- avoid "thin affiliation" and "scraping" patterns, i.e. copied merchant descriptions without added value;
- AdSense ads must not be disguised as content or navigation;
- Google's CSS programme (for Shopping ads and free listings in Romania) requires at least 50 distinct merchant domains per country, price sorting plus one other filter, no own checkout, and no misleading branding.

ANPC actively monitors labelling of commercial content, as in the ICPEN sweep of March–April 2026.

### Cited Findings
- **Commission Key principles.**
  - P1: "There should be a reference to 'advertising' or 'promoted link' whenever the default ranking is affected by a contractual or any other type of relationships". "Other types of advertising (e.g. banners) should be explicitly marked as such and separated visually from the results."
  - P2: disclose income from "pay-per-click", "pay-per-order/commission", advertising and data sales, "easily accessible from all pages of the website".
  - Source: [European Commission PDF](https://commission.europa.eu/system/files/2017-06/key_principles_for_comparison_tools_en.pdf)
- **UCPD Annex I point 11a** prohibits "Providing search results in response to a consumer's online search query without clearly disclosing any paid advertisement or payment specifically for achieving higher ranking of products within the search results" — [legislation.gov.uk](https://www.legislation.gov.uk/eudr/2019/2161/article/3)
- **DSA Art. 26** (advertising transparency on online platforms) sits in Section 3, which does not apply to micro and small platforms under Art. 19(1). UCPD disclosure duties apply regardless of size — [DSA art. 19 (mirror)](https://www.eu-digital-services-act.com/Digital_Services_Act_Article_19.html)
- **Google, "Qualify your outbound links"** (last updated 2025-12-10):
  - mark links that are "advertisements or paid placements (commonly called paid links) with the sponsored value";
  - `nofollow` "is still an acceptable way to flag them, though sponsored is preferred";
  - use `ugc` for user-generated content links;
  - the page itself does not mention affiliate links explicitly.
  - Source: [Google Search Central](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links)
- **Google Search spam policies** (last updated 2026-08-28):
  - "Thin affiliation is the practice of publishing content with product affiliate links" where "product descriptions and reviews are copied directly from the original merchant without any original content or added value".
  - "Scraping refers to the practice of taking content from other sites, often through automated means", e.g. "Republishing content from other sites without adding any original content or value".
  - Link spam includes "Buying or selling links for ranking purposes". It is "not a violation of our policies to have such links as long as they are qualified" with `rel="nofollow"` or `rel="sponsored"`.
  - Under site reputation abuse, "Using affiliate links throughout a page" is listed as not in itself inconsistent with policy.
  - Source: [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- **AdSense Program policies** (last updated 4 Aug 2026):
  - no encouraging clicks ("click the ads") and no arrows pointing to ads;
  - ads may not be formatted so they become "indistinguishable from other content on that page";
  - labels "Sponsored Links" or "Advertisements" are allowed, misleading labels are not;
  - ads where "intuitively meant for navigation" count as deceptive;
  - no ads on "pages published specifically for the purpose of showing ads" or on "any non-content-based page".
  - Source: [Google AdSense Help](https://support.google.com/adsense/answer/48182?hl=en)
- **Google CSS programme requirements.**
  - Business registered in a supported country, with a matching address on the site.
  - Users can "search and compare products, including price and selling conditions for the same product across merchants".
  - "at least 50 distinct merchant domains for each country", shipping to that country.
  - Products lead to a purchase page.
  - A search box with dynamic automated search not substantially based on Google-licensed search technology.
  - Sort or filter by price "and at least one other factor".
  - Accessible without sign-up.
  - "Marketplaces that transact on their own domain can't participate as a CSS".
  - It "can't use a name or logo shared with a brand selling on the site".
  - A prominent filter can't restrict results to fewer than 3 merchants on most queries.
  - Romania is supported for CSS Shopping ads and free listings, but is not in the shorter list for "CSS product pages".
  - The CSS must have rights to let Google access and display merchant content.
  - Source: [Google CSS Center Help](https://support.google.com/css-center/answer/7524491?hl=en)
- **ANPC and commercial-content labelling.**
  - In 2023 ANPC recommended labelling commercial content with hashtags such as #publicitate and #sponsorizare, visible and easy to notice, and signalled possible tougher measures up to account closure — [StartupCafe](https://startupcafe.ro/director-anpc-influenceri-romani-marcare-publicitare-inchidere-cont-htm-27062); [TVR Info](https://tvrinfo.ro/anpc-nereguli-privind-marcarea-continutului-comercial-la-unii-influenceri/)
  - ANPC took part in the ICPEN "Sweep" of 23 March – 8 April 2026 and checked 10 Romanian influencers. All published commercial content, but labelling was inconsistent and often "insuficient evidenţiate" (insufficiently highlighted). 70% of those using AI-generated or modified material did not disclose it. Internationally, 228 influencers were checked and only about one in five labelled properly — [Digi24 (2 July 2026)](https://www.digi24.ro/stiri/sci-tech/lumea-digitala/activitatea-influencerilor-verificata-de-anpc-publicitatea-nu-era-marcata-constant-70-au-creat-continut-cu-ai-fara-a-informa-3844799)

### Inferences
- **Labelling scheme for Pretoscop:**
  1. **CPC / paid listings.** Each boosted offer is labelled "Promovat" with a tooltip: "Magazinul plătește pentru o poziție mai vizibilă" ("The shop pays for a more visible position"). Paid boosts never alter price-sorted lists. There is a separate "Oferte promovate" box.
  2. **Affiliate links.** Use microcopy near the CTA ("Link afiliat: putem primi un comision dacă cumperi, fără cost suplimentar pentru tine", i.e. "Affiliate link: we may receive a commission if you buy, at no extra cost to you"), plus a site-wide "Cum câștigăm bani" page. Do **not** let commission rates silently affect default ranking. If they do, that is a "main parameter" that must be disclosed under UCPD Art. 7(4a) and P2B Art. 5.
  3. **Display ads.** Label them "Publicitate", visually separated, never inside result lists or styled as offers. This satisfies both UCPD and AdSense.
  4. **Editorial content** (buying guides, "top 10"). Disclose affiliate relationships at the top of the article, not only in the footer. Avoid hidden commercial intent (UCPD Art. 7(2); Annex I point 11 on paid editorial content).
  5. **HTML.** All outbound offer links get `rel="sponsored nofollow"` (affiliate and CPC). Merchant-feed descriptions should be enriched with original content (specs normalisation, price history, real-discount analysis) to avoid "thin affiliation".
- **Premium/B2B data (selling price data to brands or shops).** Disclose it in the business-model statement (Key Principle 2 lists "selling to other businesses data collected on its users"). Make sure no consumer personal data is sold without a proper basis. Aggregated, anonymised market data is preferable.
- **CSS route (later stage).** Pretoscop must hit at least 50 merchant domains shipping to Romania, have its own search, and offer price sorting plus another filter. Its branding cannot coincide with a merchant's.

### Gaps
- **Law 148/2000** (advertising) and **Law 158/2008** (misleading and comparative advertising). Exact provisions on recognisability of advertising and hidden advertising were not retrieved.
- **No formal ANPC guide** on "conținut comercial" for websites or affiliate links was found; only press reports of recommendations.
- **Affiliate-network terms.** The disclosure and cookie-consent clauses in 2Performant and Profitshare affiliate terms were not retrieved (search budget exhausted).
- **Other Google policies.** Google Publisher Policies (low-value content, EEA consent/CMP requirement), Google's position on affiliate links specifically, and the CPC network sweep results were not retrieved.
- **EU Digital Fairness Act** (expected to address dark patterns, influencer marketing and personalisation). Proposal status as of Oct 2026 not verified.

---
## 6. IP: retailer names and logos (trademarks), product photos and descriptions, Icecat, user reviews, Pretoscop's own database rights

### Takeaway
- **Retailer and brand names.** Using these as text to identify whose offer is shown is standard referential use, permitted by EU trademark law if it follows honest practices. Logos are riskier: they are marks and often copyright works. Use them only under the licence that affiliate or merchant programmes typically grant, or under express permission.
- **Product photos and descriptions.** These are the main copyright risk. Re-hosting a photo copied from a shop's site is a new communication to the public that needs authorisation (*Renckhoff*). Copying merchant descriptions also triggers Google's "thin affiliation" and "scraping" spam policies. Use licensed feed images and texts (affiliate or merchant feeds, manufacturer content syndication such as Icecat under its licence), or write original, normalised spec content.
- **User reviews.** Do not scrape them. Doing so stacks copyright, database right, GDPR and UCPD review-verification duties.
- **Pretoscop's own price-history database.** It should itself qualify for the sui generis right: substantial investment in obtaining and verifying data, as an EU maker. That right lets Pretoscop license B2B data and act against copycats.

### Cited Findings
- The sui generis right protects a maker whose investment is substantial "in either the obtaining, verification or presentation of the contents" (Art. 7(1), paraphrased from the fetched text) — [legislation.gov.uk, Dir. 96/9/EC art. 7](https://www.legislation.gov.uk/eudr/1996/9/article/7). Under *BHB* (C-203/02), "obtaining" covers seeking out and collecting existing materials (e.g., crawling shop prices), not creating them (official text not retrievable this session) — [EUR-Lex C-203/02](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62002CJ0203)
- Google CSS requirements: a CSS "can't use a name or logo shared with a brand selling on the site" and must "have the rights to let Google access and display the merchant content" — [Google CSS Center Help](https://support.google.com/css-center/answer/7524491?hl=en)
- Google spam policies: "Thin affiliation" is where "product descriptions and reviews are copied directly from the original merchant without any original content or added value". "Scraping" covers "Republishing content from other sites without adding any original content or value" — [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- **Reviews.**
  - UCPD Art. 7(6): information about "whether and how the trader ensures that the published reviews originate from consumers who have actually used or purchased the product shall be regarded as material".
  - Annex I 23b: stating reviews are from real users "without taking reasonable and proportionate steps to check" is always unfair.
  - Source: [legislation.gov.uk](https://www.legislation.gov.uk/eudr/2019/2161/article/3)
  - Commission Key Principle 5: explain how reviews "are created, posted, ranked and sorted"; sponsored reviews "should not be counted in for aggregated review scores" — [Commission PDF](https://commission.europa.eu/system/files/2017-06/key_principles_for_comparison_tools_en.pdf)
- **Trademarks, referential use** (official texts not retrievable this session). Directive (EU) 2015/2436 Art. 14(1)(c) and Regulation (EU) 2017/1001 Art. 14(1)(c) allow use of a mark "for the purpose of identifying or referring to goods or services as those of the proprietor", subject to honest practices (Art. 14(2)) — [EUR-Lex Dir. 2015/2436](https://eur-lex.europa.eu/eli/dir/2015/2436/oj); [EUR-Lex Reg. 2017/1001](https://eur-lex.europa.eu/eli/reg/2017/1001/oj)
  - *Gillette* (C-228/03) and *BMW v Deenik* (C-63/97): referential use is lawful unless it suggests a commercial connection, takes unfair advantage, denigrates, or presents the user's goods as imitations — [EUR-Lex C-228/03](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62003CJ0228); [EUR-Lex C-63/97](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:61997CJ0063)
- **Images and linking** (official texts not retrievable this session).
  - *Renckhoff* (C-161/17, 2018): posting on one's own site a photo copied from another site where it was freely available with the author's consent is a new communication to the public requiring authorisation — [EUR-Lex C-161/17](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62017CJ0161)
  - *Svensson* (C-466/12, 2014): hyperlinking to freely accessible works is not a communication to a new public — [EUR-Lex C-466/12](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62012CJ0466)
  - *VG Bild-Kunst* (C-392/19, 2021): framing that circumvents technical anti-framing measures is a communication to a new public — [EUR-Lex C-392/19](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62019CJ0392)
  - *Infopaq* (C-5/08, 2009): even an 11-word extract can be protected if it expresses the author's own intellectual creation, which matters for copied product descriptions — [EUR-Lex C-5/08](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62008CJ0005)

### Inferences
- **Practical IP rules:**
  1. Show shop names as text, plus logos only from the affiliate network or merchant asset kits, used under those terms. No logo use for shops without a relationship; use text.
  2. Images come from feeds with a licence (affiliate or merchant feeds, manufacturer or Icecat content). Do not re-host crawled shop images. Hotlinking or inline-embedding a shop's image is legally greyer (Svensson/VG Bild-Kunst logic) and fragile. Prefer licensed sources.
  3. Descriptions: generate Pretoscop's own structured spec sheets (normalised attributes) and original copy. Use feed descriptions only where licensed, and add value: price history, real-discount analysis, comparisons.
  4. No scraped reviews. If Pretoscop hosts its own reviews, add verification (e.g., receipt or "verified purchase" via affiliate conversion data) and disclose the method (Art. 7(6)).
  5. Protect Pretoscop's own database:
     - record crawl infrastructure costs, verification and QA work (evidence of "substantial investment");
     - put a database-rights and anti-scraping clause in Pretoscop's ToS;
     - publish robots.txt and TDM reservations (machine-readable, per the TDM case law in section 1);
     - license B2B data under contract.
  6. Under the Directive (Art. 10–11 per my understanding [UNVERIFIED this session]), the term is 15 years from completion, renewed by substantial new investment, and the maker must be EU-based. A Romanian SRL qualifies.
- **"Fake discount" exposure.** Publicly calling a shop's discount fake can raise defamation or commercial-disparagement claims. Treat this as an IP-adjacent reputational risk. Use the factual, data-backed wording described in section 2.

### Gaps
- **Romanian Law 84/1998** (trademarks, as amended by Law 112/2020 transposing Dir. 2015/2436). The exact article number of the referential-use limitation was not verified.
- **Romanian Law 8/1996.** Provisions on photographs and databases were not verified (legislatie.just.ro unreachable).
- **Open Icecat licence terms.** Free tier limited to "sponsoring" brands, attribution and display requirements, and image usage rights were not retrieved. Verify the current Icecat Open Content licence before use.
- **No Romanian case law** found on comparison sites' use of logos or images.

---

## 7. Company and tax setup in Romania (2026): SRL vs PFA, micro-enterprise regime, VAT (rate, threshold, reverse charge/VIES), e-Factura, dividend tax, incorporation, bookkeeping, payouts to individuals

### Takeaway
For affiliate commissions, ad revenue from Google Ireland and foreign networks, CPC invoicing and B2B data sales, the standard vehicle is an **SRL**. The 2026 rules:
- **Micro-enterprise regime:** 1% tax on revenues; requires revenues of at most EUR 100,000 (including linked enterprises), at least one employee, and that the company be the single micro designated by its >25% shareholders.
- **Otherwise:** profit tax.
- **Dividends:** taxed at **16%** from 1 Jan 2026 (Law 141/2025). Law 239/2025 added solvency limits on distributions.
- **VAT:** standard rate is **21%** since 1 Aug 2025 (reduced rate 11%). The small-business exemption threshold has been **RON 395,000** since 1 Sept 2025.

Cross-border B2B services (Google AdSense, foreign affiliate networks, SaaS bought from abroad) bring in the EU reverse-charge mechanism. Even a non-VAT-registered SRL will typically need a special VAT code and recapitulative statements. That point, and the e-Factura details, could not be verified in this session; they must be confirmed with a Romanian accountant.

### Cited Findings
- **Micro-enterprise ceiling.** "100.000 euro începând cu 1 ianuarie 2026" (*EUR 100,000 from 1 January 2026*; the 2025 ceiling was EUR 250,000). It is tested at 31 December of the previous year and includes revenues of affiliated enterprises — [Contzilla](https://www.contzilla.ro/microintreprinderea-in-2026/); [Fiscalitatea (Codul fiscal art. 47(1)(c))](https://www.fiscalitatea.ro/microintreprindere-in-2026-2-schimbari-importante-pentru-firme-24602/). The reduction from 250k to 100k comes from OUG 156/2024 — [Fiscalitatea guide](https://www.fiscalitatea.ro/ghid-practic-impozitarea-microintreprinderilor-incepand-cu-1-ianuarie-2026-24615/)
- **Rate.** "Cota de impozit este de 1%", a single rate introduced by OUG 89/24.12.2025. The former 3% rate was abolished — [Contzilla](https://www.contzilla.ro/microintreprinderea-in-2026/)
- **Employee condition.** Art. 47(1)(g): the company "are cel putin un salariat" (*has at least one employee*), save for art. 48(3) — [Fiscalitatea](https://www.fiscalitatea.ro/microintreprindere-in-2026-2-schimbari-importante-pentru-firme-24602/)
  - Part-time contracts summing to one full-time equivalent count.
  - Administration or mandate contracts count if remuneration is at least the minimum gross wage.
  - Newly set-up companies have 30 days from registration — [Contzilla](https://www.contzilla.ro/microintreprinderea-in-2026/)
- **Shareholder condition and other conditions.** The micro must be "singura persoană juridică stabilită de către aceștia [asociații >25%] să aplice regimul micro" (*the only legal entity designated by the >25% shareholders to apply the micro regime*). It must not be state-owned or in dissolution, and must have filed its annual financial statements on time — [Contzilla](https://www.contzilla.ro/microintreprinderea-in-2026/); [Fiscalitatea](https://www.fiscalitatea.ro/microintreprindere-in-2026-2-schimbari-importante-pentru-firme-24602/)
- **Exiting the regime.** Exceeding the ceiling "va determina iesirea din regimul de impozitare pe veniturile microintreprinderilor" (*leads to exit from the micro-enterprise regime*), i.e. the company moves to profit tax — [Fiscalitatea](https://www.fiscalitatea.ro/microintreprindere-in-2026-2-schimbari-importante-pentru-firme-24602/)
- **VAT rates.** Law 141/2025, published 25 July 2025, raised the standard rate from 19% to 21% from 1 Aug 2025 and merged the 5% and 9% reduced rates into 11% — [EY Global Tax News](https://globaltaxnews.ey.com/news/2025-1622); [NNDKP Tax Flash 1/2025 (draft PL-x 230/2025)](https://www.nndkp.ro/wp-content/uploads/2025/07/Tax-Flash-Nr.-1-2025_modificare-Cod-fiscal.pdf); [ANAF DGRFP Ploiești notice](https://static.anaf.ro/static/3/Ploiesti/20251104100501_comunicat.pdf)
- **VAT exemption threshold.** "Plafonul național de scutire de TVA pentru întreprinderile mici va crește de la 300.000 de lei la 395.000 de lei" (*the national small-business VAT exemption threshold rises from 300,000 to 395,000 lei*). The change took effect on 1 Sept 2025 by government ordinance amending the Fiscal Code (article of 28 Aug 2025). The EU cross-border SME scheme cap is EUR 100,000 — [Europa Liberă România](https://romania.rferl.org/a/plafon-tva-intreprinderi-mici-scazut/33515513.html); [Contzilla](https://www.contzilla.ro/plafon-tva-395-000-lei-incepand-cu-1-septembrie-2025/)
- **Dividends.** The dividend tax rate is 16% for dividends distributed from 1 Jan 2026 (or from the first day of a modified fiscal year beginning in 2026), "applicable to all categories of beneficiaries" — [NNDKP](https://www.nndkp.ro/wp-content/uploads/2025/07/Tax-Flash-Nr.-1-2025_modificare-Cod-fiscal.pdf); [Contzilla](https://www.contzilla.ro/dividende-in-2026-cota-restrictii/); [Capital.ro](https://www.capital.ro/impozitul-pe-dividende-urca-la-16-precizari-oficiale-de-la-finante.html)
  - Interim dividends distributed on the basis of 2025 interim financial statements are reported to stay at 10% — [Fiscalitatea](https://www.fiscalitatea.ro/impozit-dividende-cota-de-16-nu-se-va-aplica-in-2025-24319/)
- **Law 239/2025 restrictions on distributions:**
  - with a carried-forward loss, current-year profit can be distributed only after legal reserves are set up and the loss is covered;
  - if net assets are below half of subscribed capital, no dividends until net assets are restored;
  - the same applies to interim dividends.
  - Source: [Contzilla](https://www.contzilla.ro/dividende-in-2026-cota-restrictii/)

### Inferences
- **SRL vs PFA.**
  - An SRL is cleaner for B2B invoicing to Google Ireland and foreign networks and for signing merchant CPC contracts. It limits liability, and P2B/DSA/ANCOM obligations attach to a clear legal person.
  - With micro status, the effective burden is 1% of revenue plus 16% on distributed profit.
  - The **one-employee requirement** carries a real cost: at least a minimum-wage contract, or a mandate contract at that level. The alternative is profit tax at the standard rate on profit [rate UNVERIFIED this session; I understand it is 16%].
  - Pretoscop expects revenue to stay under EUR 100k in year 1. Model both scenarios: micro with one employee, versus profit-tax SRL with no employee.
- **VAT design for Pretoscop:**
  - Below RON 395k domestic turnover, the SRL can stay non-VAT-registered for domestic supplies.
  - Services invoiced to EU businesses (e.g., Google Ireland for AdSense) and services bought from EU or non-EU suppliers (Google Ads, cloud, SaaS) fall under reverse charge. Expect to need a **special VAT code (Fiscal Code art. 317)** and **D390 VIES / D301** filings [UNVERIFIED].
- **Revenue streams vs invoicing:**
  - Romanian affiliate networks pay against invoices from the SRL.
  - AdSense pays from Google Ireland; check Google's invoicing and self-billing set-up for Romania [UNVERIFIED].
  - CPC merchants in Romania are B2B, so e-Factura applies.

### Gaps (high priority to verify with a Romanian accountant; the search budget was exhausted before these could be sourced)
- **e-Factura.** My understanding [UNVERIFIED]: B2B has been mandatory since 1 Jan 2024 and B2C since 1 Jan 2025. Invoices must be uploaded within 5 working days. Invoices to non-established foreign customers are generally outside RO e-Factura. Check 2026 changes (e.g., OUG 8/2026 or later).
- **Art. 317 Fiscal Code special VAT code** for non-VAT-registered persons buying or supplying intra-EU B2B services. Also the registration timing and VIES (D390) obligations. [UNVERIFIED]
- **Profit tax.** Standard rate and whether a "minimum turnover tax" applies (it targets large companies). [UNVERIFIED]
- **PFA taxation in 2026.** My understanding [UNVERIFIED]: 10% income tax on net income, CAS 25% (if income at least 12 minimum wages) and CASS 10% (with minimum and maximum bases). Also the 2026 minimum gross wage value (4,050 lei from 1 Jan 2025; any 2026 increase not verified).
- **CASS on dividends for individual shareholders.** 10% above thresholds of 6/12/24 minimum wages, as reported in search snippets only. 2026 amounts not verified.
- **Micro-enterprise amendments in OUG 8/2026 (25 Feb 2026).** Search snippets reported an extension of the new-company employee grace period from 30 to 90 days and the exclusion of asset-sale revenue from the EUR 100k test. Contzilla still says 30 days. **Conflict unresolved.**
- **Minimum share capital under Law 239/2025.** Reported in snippets as RON 500 for new SRLs and RON 5,000 for SRLs with turnover above RON 400,000. Not verified.
- **Incorporation cost** (ONRC fees, registered-office proof, specimen signature, beneficial-owner declaration) and typical bookkeeping cost. Not verified.
- **Payouts to individuals.** Whether a **non-registered individual** may lawfully receive affiliate payouts in Romania (2Performant/Profitshare individual-payout rules; "venituri din alte surse" vs independent activity requiring PFA registration). Not verified.

---

## 8. Accessibility: does the European Accessibility Act (Dir. 2019/882; Romanian Law 232/2022) apply to a price-comparison website?

### Takeaway
Law 232/2022 (Romanian EAA transposition, applicable from 28 June 2025) covers "e-commerce services". These are services provided at a distance through websites "at the individual request of a consumer with a view to concluding a consumer contract".
- **Pure comparison function.** It does not conclude consumer contracts (purchases happen on the shop's site), so it is arguably outside scope. A Romanian commentary notes the law does not reach every website, e.g. presentation-only sites.
- **Consumer checkout of its own.** If Pretoscop sells a paid premium plan to consumers online, that checkout flow is an e-commerce service in scope.
- **Microenterprise exemption.** Service providers with under 10 employees and turnover or balance sheet of at most EUR 2m are exempt (art. 4(5)).
- **Enforcement.** The supervisor for e-commerce services is the Authority for the Digitalization of Romania (ADR). Fines run from 5,000 to 15,000 lei per breach, plus possible suspension.

Recommendation: build to WCAG 2.1/2.2 AA (the substance of EN 301 549). It future-proofs against growth beyond micro status and helps SEO and conversion.

### Cited Findings
- **Definition of e-commerce services.** Art. 3 pt. 22: "servicii furnizate la distanță, prin site-uri web …", "la solicitarea individuală a unui consumator în vederea încheierii unui contract de consum" (*services provided at a distance through websites …, at the individual request of a consumer with a view to concluding a consumer contract*) — [legeaz.net, Law 232/2022](https://legeaz.net/monitorul-oficial-743-2022/lege-232-2022)
- **Scope.** Art. 2(3)(e) covers e-commerce services provided to consumers after 28 June 2025 (alongside e-communications, audiovisual access, consumer banking and e-books) — [legeaz.net](https://legeaz.net/monitorul-oficial-743-2022/lege-232-2022)
- **Microenterprise definition.** Art. 3 pt. 12: "o întreprindere care are sub 10 angajați" (*an enterprise with fewer than 10 employees*) and annual turnover or balance sheet total of at most EUR 2 million — [legeaz.net](https://legeaz.net/monitorul-oficial-743-2022/lege-232-2022)
- **Microenterprise exemption.** Art. 4(5): "Microîntreprinderile ce oferă servicii sunt scutite de obligația de a respecta cerințele de accesibilitate" (*microenterprises providing services are exempt from complying with the accessibility requirements*). The internal cross-reference in the Romanian text looks imprecise — [legeaz.net](https://legeaz.net/monitorul-oficial-743-2022/lege-232-2022). EU text, Art. 4(5): "Microenterprises providing services shall be exempt from complying with the accessibility requirements" and related obligations — [legislation.gov.uk, Dir. 2019/882 art. 4](https://www.legislation.gov.uk/eudr/2019/882/article/4)
- **Supervision.** Art. 19(1)(d): the "Autoritatea pentru Digitalizarea României" supervises e-commerce services. Control is under art. 27(5)(d) — [legeaz.net](https://legeaz.net/monitorul-oficial-743-2022/lege-232-2022)
- **Fines for service providers (art. 27):**
  - 6,000–12,000 lei for not ensuring services comply (art. 13(1));
  - 7,000–15,000 lei for not preparing or explaining the accessibility information (art. 13(2)(a)–(d));
  - 6,000–12,000 lei for procedures under art. 13(3);
  - 7,000–15,000 lei for not reporting non-compliance;
  - 5,000–10,000 lei for not cooperating with or informing authorities;
  - plus complementary measures such as suspension.
  - Source: [legeaz.net](https://legeaz.net/monitorul-oficial-743-2022/lege-232-2022)
- **Accessibility information duty.** Art. 13(2): providers must prepare information per Annex 5, which "explică modul în care serviciile îndeplinesc cerințele de accesibilitate" (*explains how the services meet the accessibility requirements*). It must be public, in written and oral form and in accessible formats, for as long as the service is offered — [legeaz.net](https://legeaz.net/monitorul-oficial-743-2022/lege-232-2022)
- **Dates.** The law has applied since 28 June 2025, except art. 4(8), which applies from 28 June 2027. Transitional provisions: products already in use until 28 June 2030, and pre-June-2025 contracts for up to 5 years (art. 29–30) — [legeaz.net](https://legeaz.net/monitorul-oficial-743-2022/lege-232-2022)
- **Harmonised standards.** Art. 15 gives a presumption of conformity for "standarde armonizate sau părți ale acestora". The text does not name EN 301 549 or WCAG — [legeaz.net](https://legeaz.net/monitorul-oficial-743-2022/lege-232-2022)
- **Commentary.** "Legea menționează că nu se aplică tuturor companiilor care dețin un website … dacă au un simplu site de prezentare … nu intră sub incidența legii" (*the law does not apply to every company with a website; a simple presentation site is outside it*) — [Wall-Street.ro](https://www.wall-street.ro/articol/ecommerce/accesibilitatea-digitala-legea-pe-care-trebuie-sa-o-aplice-companiile-din-roman.html)
- **Best practice.** The Commission Key Principles (P9) say comparison tools "should also follow existing international guidelines or standards on accessibility" — [Commission PDF](https://commission.europa.eu/system/files/2017-06/key_principles_for_comparison_tools_en.pdf)

### Inferences
- **Scope test for Pretoscop:**
  - The comparison and redirect function alone is probably outside "e-commerce services".
  - A B2C premium subscription sold on-site would be in scope once Pretoscop exceeds microenterprise size.
  - B2B data products are outside, as they are not consumer contracts.
- **Engineering target.** Use WCAG 2.2 AA:
  - keyboard navigation;
  - visible focus;
  - text alternatives for charts (price-history charts need a data table or textual summary);
  - contrast;
  - form labels for alert sign-up;
  - accessible cookie banner and modals;
  - no colour-only "real discount" signalling.
- **Accessibility statement.** Publish a statement page ("Declarație de accesibilitate") with conformance status, known issues and a contact. This is required in substance by art. 13(2) once in scope.

### Gaps
- **EN 301 549 version.** Which version is currently harmonised for the EAA (v3.2.1 vs a newer v4.x aligned to WCAG 2.2), and whether a Commission implementing decision was adopted by Oct 2026, was not verified.
- **Official guidance on scope.** No Commission or ADR guidance was found on whether comparison sites are "e-commerce services". The content of Annex 5 of Law 232/2022 was not read (it lies beyond the fetched portion of the page).

---
## 9. Name and domain check: "Pretoscop" (OSIM/EUIPO marks; domains)

### Takeaway
Live WHOIS checks on 27 Oct 2026 found **pretoscop.ro, pretoscop.com and pretoscop.eu all unregistered**. Register all three immediately. **No trademark search could be run** in this session: TMview, EUIPO eSearch and the OSIM e-services are JavaScript applications, and the search budget was exhausted. Before launch, run the clearance searches listed below and file at least a Romanian (OSIM) or EU (EUIPO) word mark.

### Cited Findings
- **.ro.** The RoTLD WHOIS (port 43) for `pretoscop.ro` returned "No entries found for the selected source(s)" on 27 Oct 2026 — [RoTLD](https://www.rotld.ro) (own query)
- **.com.** The .com registry WHOIS returned `No match for domain "PRETOSCOP.COM".` on 27 Oct 2026 (own query; re-check at [ICANN Lookup](https://lookup.icann.org/en/lookup))
- **.eu.** The EURid WHOIS for `pretoscop.eu` returned `Status: AVAILABLE` on 27 Oct 2026 — [EURid](https://www.eurid.eu) (own query)
- **Google CSS branding rule.** If Pretoscop later joins Google's CSS programme, its display name must reflect its business or domain name, and it "can't use a name or logo shared with a brand selling on the site" — [Google CSS Center Help](https://support.google.com/css-center/answer/7524491?hl=en)

### Inferences
- **Distinctiveness.** "Pretoscop" combines Romanian "preț" (price) with "-scop" (as in telescop/microscop). That makes it suggestive rather than purely descriptive, so it is probably registrable. A short-form or logo mark adds protection.
- **Classes to consider:**
  - 35: advertising; online price comparison and consumer information services; retail-related business information;
  - 42: SaaS and data analytics platforms;
  - 9: downloadable app;
  - 38: providing online forums and electronic messaging, if alerts or community features are included.
- **Order of steps:**
  1. TMview identical and similar search across EUTM, the OSIM national register and international registrations designating RO/EU, for "pretoscop", "preto*", "*scop" and "pricescope"-type marks.
  2. EUIPO eSearch.
  3. WIPO Global Brand Database.
  4. ONRC company-name availability check and reservation ("rezervare denumire").
  5. Then file.

### Gaps
- **No register searched.** The trademark registers were not searched: [TMview](https://www.tmdn.org/tmview/), [EUIPO eSearch](https://euipo.europa.eu/eSearch/), [OSIM](https://www.osim.ro/), [WIPO Global Brand Database](https://branddb.wipo.int/). Similar marks therefore remain unknown.
- **Unverified items.** ONRC name-reservation availability, OSIM and EUIPO filing fees, and whether "price comparison services" sits in Nice class 35 under the current edition were not checked.

---

## 10. Including second-hand and classifieds (OLX, Publi24): extra legal considerations

### Takeaway
Classifieds raise the risk on every axis:
- **Personal data.** Private sellers' names, phone numbers and locations are personal data.
- **Contract.** OLX and Publi24 terms very likely prohibit automated collection. Not verified, but typical.
- **Database right.** OLX's listings database reflects a large investment, which favours the maker under CV-Online's adverse-effect test if Pretoscop substitutes for OLX search.
- **Consumer law.** A comparator that lets consumers search products "offered by different traders or by consumers" must disclose its ranking parameters (UCPD Art. 7(4a)). For marketplace offers it should show whether the seller is a trader, based on the seller's declaration to the marketplace (Art. 7(4)(f)).
- **Comparability.** Second-hand items are not identical to new ones, and the Commission principles require differences to be "clearly mentioned".

Recommendation: keep classifieds out of the MVP, or include them only through a partnership or API with explicit licence. If included:
- show seller status and condition labels;
- keep used prices out of new-product price histories and "lowest price" badges;
- store no seller identities.

### Cited Findings
- UCPD Art. 7(4a) applies where consumers can search for products "offered by different traders or by consumers … irrespective of where transactions are ultimately concluded". Art. 7(4)(f) requires stating, for products on online marketplaces, "whether the third party offering the products is a trader or not, on the basis of the declaration of that third party to the provider of the online marketplace" — [legislation.gov.uk](https://www.legislation.gov.uk/eudr/2019/2161/article/3)
- The "online marketplace" definition turns on a service that "allows consumers to conclude distance contracts with other traders or consumers". OLX is one; Pretoscop, as a redirecting comparator, is not — [legislation.gov.uk](https://www.legislation.gov.uk/eudr/2019/2161/article/3)
- Commission Key Principle 4: "When the products or services compared are not identical, differences in their characteristics should be clearly mentioned". Comparison tools should also give "a clear indication of the completeness and coverage of the comparison" — [Commission PDF](https://commission.europa.eu/system/files/2017-06/key_principles_for_comparison_tools_en.pdf)
- Database right: repeated and systematic extraction of insubstantial parts is restricted where it conflicts with normal exploitation (Art. 7(5)) — [legislation.gov.uk](https://www.legislation.gov.uk/eudr/1996/9/article/7). On re-using a listings site's content via a specialised search engine, see *CV-Online* — [EUR-Lex C-762/19](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62019CJ0762)
- *Kamenova* (C-105/17, 4 Oct 2018): whether a person selling via an online platform is a "trader" is assessed case by case, e.g. by the regularity of sales, profit motive and number of ads (official text not retrievable this session) — [EUR-Lex C-105/17](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62017CJ0105)
- If Pretoscop lets users post their own listings or ads, it becomes a hosting service and online platform under the DSA definitions — [DSA art. 3 (mirror)](https://www.eu-digital-services-act.com/Digital_Services_Act_Article_3.html)

### Inferences
- **Display rules for classifieds offers.**
  - Label every offer with condition: "Nou", "Resigilat" (open-box) or "Second-hand".
  - Label seller status: "Vânzător: persoană fizică" (private individual) or "firmă (conform declarației pe platformă)" (company, as declared on the platform).
  - Add a note on rights: "Când cumperi de la o persoană fizică, drepturile tale de consumator din legislația UE nu se aplică" ("When you buy from a private individual, your EU consumer rights do not apply"). This mirrors the CRD Art. 6a(1)(c) duty that applies to marketplaces. Verify the wording against the OUG 34/2014 transposition.
  - Use a separate section or tab, excluded from new-product rankings and price history.
- **Data minimisation.** Store only the listing ID or URL, price, condition, city-level location (if needed) and timestamp. Do not store seller name, phone or profile. Purge expired listings quickly.
- **Contract and database-right risk.** Without a licence, OLX can invoke its ToS (Ryanair route) and its database right (CV-Online/Innoweb route). Seek a partnership, affiliate deal or API instead.

### Gaps
- **Platform terms.** The current OLX.ro and Publi24 terms of use (anti-scraping and robots clauses) and any OLX actions against aggregators in Romania were not retrieved.
- **Platform declaration fields.** Whether OLX exposes the trader or consumer declaration (DSA Art. 30 / UCPD Art. 7(4)(f)) in a form Pretoscop could reuse was not checked.

---

## 11. Cross-cutting: launch compliance checklist and date-stamped watchlist of pending changes (as of 27 Oct 2026)

### Takeaway
At launch, Pretoscop needs the following in place:
- SRL set up, with a tax and VAT set-up that handles reverse charge;
- ToS and privacy policy;
- a consent-first cookie CMP;
- double opt-in alerts and newsletter;
- a ranking-parameters page and a "how we make money" page;
- "Promovat"/"Publicitate" labels and `rel="sponsored"` on outbound links;
- timestamped prices and a correction channel;
- merchant T&Cs (P2B);
- DSA contact points and notice-and-action;
- the **ANCOM notification within 45 days**;
- a written crawling policy and data licences;
- an accessibility baseline.

Several rules are moving: the Romanian cookie bill, the DPF appeal before the CJEU, TDM opt-out case law, the ANCOM supervision fee from 2027, and EAA transitional dates.

### Cited Findings
- **ANCOM notification.** Required within 45 days of starting intermediary services. Failure to notify carries 5,000–30,000 lei. ANCOM can charge a supervision fee only from 1 Jan 2027 (Law 50/2024 arts 5, 33, 49) — [legeaz.net](https://legeaz.net/monitorul-oficial-232-2024/lege-50-2024)
- **Romanian cookie-banner bill** (reported as Legislative Proposal 256/2026): under parliamentary review as of April 2026, with 120 days to comply after entry into force — [AmCham Romania](https://www.amcham.ro/business-intelligence/new-rules-on-cookie-consent-aligning-romanian-legislation-with-european-standards); [Mondaq](https://webiis08.mondaq.com/privacy-protection/1782518/upcoming-changes-to-romanian-cookie-consent-framework)
- **EU–US DPF.** The appeal (C-703/25 P) is pending before the Court of Justice — [WilmerHale](https://www.wilmerhale.com/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20251201-european-court-of-justice-to-review-challenge-to-eu-us-data-privacy-framework)
- **TDM opt-outs.** A BGH appeal was admitted in *Kneschke v LAION*, and the first CJEU TDM referral (*Like Company v Google*) is pending — [Freshfields](https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/ai-training-copyright-part-2-text-and-data-mining-under-court-scrutiny-102mebl)
- **Law 232/2022 (accessibility).** Art. 4(8) applies from 28 June 2027. Transitional periods run to 28 June 2030 — [legeaz.net](https://legeaz.net/monitorul-oficial-743-2022/lege-232-2022)
- **Google policy versions in force** (date-stamped): spam policies updated 2026-08-28 — [Google](https://developers.google.com/search/docs/essentials/spam-policies); AdSense Program policies updated 2026-08-04 — [Google](https://support.google.com/adsense/answer/48182?hl=en); outbound-link qualification updated 2025-12-10 — [Google](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links)
- **ANPC/ICPEN.** The influencer and commercial-content sweep ran from 23 Mar to 8 Apr 2026, a sign of active labelling enforcement — [Digi24](https://www.digi24.ro/stiri/sci-tech/lumea-digitala/activitatea-influencerilor-verificata-de-anpc-publicitatea-nu-era-marcata-constant-70-au-creat-continut-cu-ai-fara-a-informa-3844799)
- **2026 tax baseline.** Micro tax is 1% with a EUR 100k ceiling (OUG 89/2025; OUG 156/2024); dividend tax is 16%; VAT is 21%/11%; the VAT exemption threshold is RON 395,000 — [Contzilla](https://www.contzilla.ro/microintreprinderea-in-2026/); [NNDKP](https://www.nndkp.ro/wp-content/uploads/2025/07/Tax-Flash-Nr.-1-2025_modificare-Cod-fiscal.pdf); [EY](https://globaltaxnews.ey.com/news/2025-1622); [Europa Liberă](https://romania.rferl.org/a/plafon-tva-intreprinderi-mici-scazut/33515513.html)

### Inferences
- **Launch checklist (owner → artefact):**

| # | Area | Must-have at launch | Basis |
|---|---|---|---|
| 1 | Entity | SRL; CAEN code(s) for web portals/advertising/data; micro or profit-tax choice; payroll for the one employee if micro; VAT/art. 317 set-up for reverse charge | §7 |
| 2 | Legal pages | Terms of use (consumer); merchant T&Cs (P2B Arts 3–5, 7–10); privacy policy; cookie policy; "Cum ordonăm rezultatele"; "Cum câștigăm bani"; contact page with postal address and email; accessibility statement | §2, §4, §5, §8 |
| 3 | DSA | Single point of contact for authorities and users; notice-and-action form; statements of reasons; **ANCOM notification ≤45 days** | §2 |
| 4 | Display | Ranking info link on every results page; "Promovat"/"Publicitate" labels; impartial price sort; total price incl. shipping; per-offer timestamp; seller-status and condition labels; 30-day-based discount badges | §2, §3, §10 |
| 5 | Data | Feed licences (affiliate/merchant); crawling policy (robots.txt, rate limits, no circumvention, stop on objection); no review scraping; licensed images only | §1, §6 |
| 6 | Privacy | CMP with equal "Accept"/"Reject"; no tags before consent; double opt-in alerts and newsletter; unsubscribe in every message; RoPA; LIA for scraped data; DPF/SCC vendor list | §4 |
| 7 | SEO/ads | `rel="sponsored nofollow"` on all paid/affiliate links; original content to avoid "thin affiliation"; AdSense-compliant ad placement | §5 |
| 8 | Brand | Register .ro/.com/.eu; trademark clearance and filing | §9 |

### Gaps
- **EU Digital Fairness Act** proposal (dark patterns, personalisation, influencer marketing, possibly comparison tools). Status as of Oct 2026 not verified.
- **Commission "Digital Omnibus"** amendments affecting cookies and GDPR. Status not verified.
- **ODR platform.** Whether the EU ODR platform link requirement has ended (Regulation (EU) 2024/3228) is not verified. This matters only if Pretoscop sells to consumers. My understanding [UNVERIFIED] is that the platform closed in July 2025. Separately, whether ANPC still requires the SAL pictogram for B2C sellers.
- **2026–2027 fiscal changes** in Romania after OUG 8/2026 (micro regime, e-Factura, CASS) are not verified.
