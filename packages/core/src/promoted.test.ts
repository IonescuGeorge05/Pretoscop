import { describe, expect, it } from 'vitest';
import {
  applyWalletMovement,
  comparePromotedPrice,
  decideClickBilling,
  DEFAULT_FLOORS,
  effectiveBid,
  floorFor,
  floorProblem,
  ineligibility,
  isPromotedPlacement,
  parseLeiInput,
  priceBandOf,
  RATE_HOLD,
  runAuction,
  topUpAmounts,
  WalletError,
  type AuctionCandidate,
  type ClickBillingInput,
  type FloorRow,
} from './promoted';

const cand = (over: Partial<AuctionCandidate> & Pick<AuctionCandidate, 'placementId' | 'merchantId'>): AuctionCandidate => ({
  offerId: over.placementId * 10,
  productId: 1,
  bidBani: 100,
  floorBani: 40,
  capBani: 300,
  remainingBani: 10_000,
  totalBani: 150_000,
  ...over,
});

describe('price bands', () => {
  it.each([
    [0, '0-200'],
    [19_999, '0-200'],
    [20_000, '200-1000'],
    [99_999, '200-1000'],
    [100_000, '1000-3000'],
    [299_999, '1000-3000'],
    [300_000, '3000+'],
    [99_999_999, '3000+'],
  ] as const)('%i bani → %s', (bani, band) => {
    expect(priceBandOf(bani)).toBe(band);
  });
});

describe('floors and caps', () => {
  const rows: FloorRow[] = [
    { categoryId: null, band: '200-1000', floorBani: 45, capBani: 200 },
    { categoryId: 10, band: '200-1000', floorBani: 80, capBani: 400 },
    { categoryId: 11, band: '1000-3000', floorBani: 90, capBani: 500 },
  ];
  it('takes the most specific category on the chain, then the site row, then the defaults', () => {
    expect(floorFor(rows, [12, 10, 1], '200-1000')).toEqual({ floorBani: 80, capBani: 400 }); // parent 10
    expect(floorFor(rows, [11, 10, 1], '1000-3000')).toEqual({ floorBani: 90, capBani: 500 }); // leaf 11
    expect(floorFor(rows, [5, 1], '200-1000')).toEqual({ floorBani: 45, capBani: 200 }); // site-wide
    expect(floorFor(rows, [5, 1], '3000+')).toEqual(DEFAULT_FLOORS['3000+']);
    expect(floorFor([], [], '0-200')).toEqual(DEFAULT_FLOORS['0-200']);
  });
  it('validates admin input', () => {
    expect(floorProblem({ floorBani: 40, capBani: 300 })).toBeNull();
    expect(floorProblem({ floorBani: 0, capBani: 300 })).toBe('floor');
    expect(floorProblem({ floorBani: 40, capBani: 39 })).toBe('cap');
    expect(floorProblem({ floorBani: 40, capBani: 10_001 })).toBe('cap');
    expect(floorProblem({ floorBani: 1.5, capBani: 300 })).toBe('floor');
  });
  it('every default floor is below its cap', () => {
    for (const f of Object.values(DEFAULT_FLOORS)) expect(floorProblem(f)).toBeNull();
  });
});

describe('second-price auction', () => {
  it('a single bidder pays its floor', () => {
    const r = runAuction([cand({ placementId: 1, merchantId: 1, bidBani: 120, floorBani: 60 })]);
    expect(r).toMatchObject({ priceBani: 60, secondBidBani: null, bidders: 1, effectiveBidBani: 120 });
    expect(r!.winner.placementId).toBe(1);
  });

  it('the winner pays the second bid + 1 ban', () => {
    const r = runAuction([
      cand({ placementId: 1, merchantId: 1, bidBani: 150 }),
      cand({ placementId: 2, merchantId: 2, bidBani: 90 }),
      cand({ placementId: 3, merchantId: 3, bidBani: 70 }),
    ]);
    expect(r!.winner.placementId).toBe(1);
    expect(r!.priceBani).toBe(91);
    expect(r!.secondBidBani).toBe(90);
    expect(r!.bidders).toBe(3);
  });

  it('the price is never below the winner floor nor above its own bid', () => {
    // runner-up bid below the winner's floor (each offer has its own floor): the floor applies
    expect(runAuction([cand({ placementId: 1, merchantId: 1, bidBani: 200, floorBani: 100 }), cand({ placementId: 2, merchantId: 2, bidBani: 50, floorBani: 40 })])!.priceBani).toBe(100);
    // equal bids: the winner pays its own bid, never bid + 1
    const tie = runAuction([cand({ placementId: 1, merchantId: 1, bidBani: 100 }), cand({ placementId: 2, merchantId: 2, bidBani: 100 })])!;
    expect(tie.priceBani).toBe(100);
  });

  it('caps count: a bid above the cap competes at the cap', () => {
    const r = runAuction([cand({ placementId: 1, merchantId: 1, bidBani: 5000, capBani: 300 }), cand({ placementId: 2, merchantId: 2, bidBani: 299, capBani: 300 })])!;
    expect(r.effectiveBidBani).toBe(300);
    expect(r.priceBani).toBe(300);
    expect(effectiveBid({ bidBani: 5000, capBani: 300 })).toBe(300);
  });

  it('ties go to the cheaper offer, then to the older campaign', () => {
    expect(runAuction([cand({ placementId: 1, merchantId: 1, totalBani: 200_000 }), cand({ placementId: 2, merchantId: 2, totalBani: 190_000 })])!.winner.placementId).toBe(2);
    expect(runAuction([cand({ placementId: 7, merchantId: 1 }), cand({ placementId: 3, merchantId: 2 })])!.winner.placementId).toBe(3);
  });

  it('a merchant never sets its own price: one candidate per merchant', () => {
    const r = runAuction([cand({ placementId: 1, merchantId: 1, bidBani: 150 }), cand({ placementId: 2, merchantId: 1, bidBani: 140 }), cand({ placementId: 3, merchantId: 2, bidBani: 60 })])!;
    expect(r.winner.placementId).toBe(1);
    expect(r.priceBani).toBe(61);
    expect(r.bidders).toBe(2);
  });

  it('bids below the floor and campaigns without budget for their whole bid are out', () => {
    expect(ineligibility(cand({ placementId: 1, merchantId: 1, bidBani: 30, floorBani: 40 }))).toBe('below_floor');
    expect(ineligibility(cand({ placementId: 1, merchantId: 1, bidBani: 100, remainingBani: 99 }))).toBe('budget');
    expect(ineligibility(cand({ placementId: 1, merchantId: 1, bidBani: 100, remainingBani: 100 }))).toBeNull();
    expect(runAuction([cand({ placementId: 1, merchantId: 1, bidBani: 30, floorBani: 40 }), cand({ placementId: 2, merchantId: 2, remainingBani: 0 })])).toBeNull();
    // the budget-starved high bidder drops out; the next one wins at its floor
    const r = runAuction([cand({ placementId: 1, merchantId: 1, bidBani: 250, remainingBani: 200 }), cand({ placementId: 2, merchantId: 2, bidBani: 80 })])!;
    expect(r.winner.placementId).toBe(2);
    expect(r.priceBani).toBe(40);
  });

  it('no candidates, no slot', () => {
    expect(runAuction([])).toBeNull();
  });
});

describe('click billing', () => {
  const auction = runAuction([cand({ placementId: 1, merchantId: 1, offerId: 10, bidBani: 100 })])!;
  const ok: ClickBillingInput = {
    enabled: true,
    bot: false,
    prefetch: false,
    internalReferer: true,
    alreadyBilled: false,
    sessionClicks10Min: 0,
    ipClicksHour: 0,
    auction,
    placementId: 1,
    offerId: 10,
  };

  it('bills a genuine click at the auction price', () => {
    expect(decideClickBilling(ok)).toEqual({ bill: true, priceBani: 40 });
  });

  it.each([
    [{ enabled: false }, 'disabled'],
    [{ bot: true }, 'bot'],
    [{ prefetch: true }, 'prefetch'],
    [{ internalReferer: false }, 'no_referer'],
    [{ alreadyBilled: true }, 'duplicate'],
    [{ sessionClicks10Min: RATE_HOLD.sessionPer10Min }, 'rate_hold'],
    [{ ipClicksHour: RATE_HOLD.ipPerHour }, 'rate_hold'],
    [{ auction: null }, 'ineligible'],
    [{ placementId: 2 }, 'not_winner'],
    [{ offerId: 11 }, 'not_winner'],
  ] as const)('%j → not billed (%s)', (over, reason) => {
    expect(decideClickBilling({ ...ok, ...over })).toEqual({ bill: false, reason });
  });

  it('just under the rate thresholds still bills', () => {
    expect(decideClickBilling({ ...ok, sessionClicks10Min: RATE_HOLD.sessionPer10Min - 1, ipClicksHour: RATE_HOLD.ipPerHour - 1 }).bill).toBe(true);
  });

  it('never bills more than the campaign can spend', () => {
    const starving = { ...auction, winner: { ...auction.winner, remainingBani: 39 } };
    expect(decideClickBilling({ ...ok, auction: starving })).toEqual({ bill: false, reason: 'budget' });
  });

  it('knows the slot placements', () => {
    expect(isPromotedPlacement('promoted_product')).toBe(true);
    expect(isPromotedPlacement('promoted_category')).toBe(true);
    expect(isPromotedPlacement('offers_table')).toBe(false);
    expect(isPromotedPlacement(null)).toBe(false);
  });
});

describe('wallet arithmetic', () => {
  it('credits and debits in bani, never below zero', () => {
    expect(applyWalletMovement(15_000, -60)).toBe(14_940);
    expect(applyWalletMovement(0, 15_000)).toBe(15_000);
    expect(applyWalletMovement(60, -60)).toBe(0);
    expect(() => applyWalletMovement(59, -60)).toThrow(WalletError);
    expect(() => applyWalletMovement(59, -60)).toThrow('below zero');
    expect(() => applyWalletMovement(100, 0)).toThrow('invalid');
    expect(() => applyWalletMovement(100, 0.5)).toThrow('invalid');
    expect(() => applyWalletMovement(-1, 10)).toThrow('invalid');
  });

  it('a long series of clicks adds up exactly (no floats)', () => {
    let b = 15_000;
    for (let i = 0; i < 250; i++) b = applyWalletMovement(b, -60);
    expect(b).toBe(0);
    expect(() => applyWalletMovement(b, -1)).toThrow(WalletError);
  });

  it('top-up amounts with VAT on top, rounded half up', () => {
    expect(topUpAmounts(15_000, 0)).toEqual({ netBani: 15_000, vatBani: 0, grossBani: 15_000 });
    expect(topUpAmounts(15_000, 21)).toEqual({ netBani: 15_000, vatBani: 3_150, grossBani: 18_150 });
    expect(topUpAmounts(1_005, 21)).toEqual({ netBani: 1_005, vatBani: 211, grossBani: 1_216 }); // 211.05 → 211
    expect(topUpAmounts(1_050, 21)).toEqual({ netBani: 1_050, vatBani: 221, grossBani: 1_271 }); // 220.5 → 221
    expect(() => topUpAmounts(0, 21)).toThrow();
    expect(() => topUpAmounts(100, 21.5)).toThrow();
  });
});

describe('parseLeiInput', () => {
  it.each([
    ['150', 15_000],
    ['150,5', 15_050],
    ['150,50', 15_050],
    ['0,40', 40],
    ['0,4 lei', 40],
    ['1.500', 150_000],
    ['1.500,25', 150_025],
    ['1500.25', 150_025],
    ['1.50', 150],
    [' 2 000 ', 200_000],
    ['10.000 RON', 1_000_000],
  ] as const)('%j → %i bani', (input, bani) => {
    expect(parseLeiInput(input)).toBe(bani);
  });
  it.each(['', '-5', '1,234', '1.2.3', 'abc', '1e3', '12,5,0', '0x10', '1.5000'])('refuses %j', (input) => {
    expect(parseLeiInput(input)).toBeNull();
  });
});

describe('comparePromotedPrice', () => {
  it('says by how much a promoted offer costs more than the best organic total', () => {
    expect(comparePromotedPrice(200_400, 189_900)).toEqual({ kind: 'more_expensive', diffBani: 10_500, bestBani: 189_900 });
    expect(comparePromotedPrice(189_900, 189_900)).toEqual({ kind: 'not_more_expensive' });
    expect(comparePromotedPrice(150_000, null)).toEqual({ kind: 'not_more_expensive' });
  });
});
