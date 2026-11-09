/** Romanian labels for promoted-placement records (merchant portal and admin, M25). Pure. */

/** Why a click from the slot was not billed (`promoted_clicks.reason`), for the merchant. */
export const NOT_BILLED_LABELS: Record<string, string> = {
  disabled: 'promovarea era oprită',
  bot: 'roboți și instrumente automate',
  prefetch: 'preîncărcări ale browserului',
  no_referer: 'fără o pagină Pretoscop de proveniență',
  duplicate: 'clic repetat (același vizitator, aceeași zi)',
  rate_hold: 'prea multe clicuri într-un timp scurt',
  ineligible: 'oferta sau campania nu mai era eligibilă',
  not_winner: 'pagina arăta o licitație mai veche',
  budget: 'sold sau plafon zilnic insuficient',
};
export const LEDGER_LABELS: Record<string, string> = { topup: 'Alimentare', click: 'Clic facturat', click_refund: 'Clic returnat', adjustment: 'Ajustare' };
