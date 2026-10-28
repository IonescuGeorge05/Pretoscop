/**
 * Assisted-access channel (M05B, ADR-015): which shops may ever be read through it.
 *
 * The founders decided on 2026-10-27, after legal advice, to use a commercial data-collection
 * service for the prototype, for these designated shops only (docs/12-blocked-shops-strategy.md
 * §0 and layer 2b; docs/progress.md, decisions log): Altex, Media Galaxy, Flanco, PC Garage and
 * cel.ro, plus evoMAG and Vexio until their feeds are live. Being on this list allows nothing by
 * itself: a shop is read through the channel only when its registry YAML says
 * `access_mode: assisted` with a `legal.basis_ref` (the filed written opinion), the flag
 * `assisted.enabled` is on, a vendor is configured and its sources run.
 *
 * Adding a shop here requires a founder decision recorded in docs/progress.md first (CLAUDE.md).
 * eMAG can never be added: it stays under ADR-013 and its own decision.
 */
export const ASSISTED_DESIGNATED_SHOPS = ['altex', 'mediagalaxy', 'flanco', 'pcgarage', 'cel', 'evomag', 'vexio'] as const;

export type AssistedDesignatedShop = (typeof ASSISTED_DESIGNATED_SHOPS)[number];

/** Shops excluded from the channel whatever the list says. */
export const ASSISTED_NEVER = ['emag'] as const;

export function isAssistedDesignated(slug: string): boolean {
  return (ASSISTED_DESIGNATED_SHOPS as readonly string[]).includes(slug) && !(ASSISTED_NEVER as readonly string[]).includes(slug);
}

/**
 * The methodology wording for the trust pages (M17 wires it into /cum-functioneaza or /metodologie;
 * `docs/12` §0 condition 7): truthful and general. The bot page describes PretoscopBot only and
 * never claims that all collection is done by it. Wording to be reviewed by the lawyer (B5).
 */
export const ASSISTED_METHODOLOGY_RO = 'Pentru unele magazine, prețurile sunt colectate printr-un serviciu terț de colectare a datelor.';
