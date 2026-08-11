import assert from "node:assert/strict";
import test from "node:test";

import {
  BPS_DENOMINATOR,
  canonicalMarketPayload,
  marketReferenceDigest,
  priceVectorBps,
  product,
  quoteAddLiquidity,
  quoteBuy,
  quoteRemoveLiquidity,
  quoteSell,
  quoteVoidClaim,
} from "../v3/market-math.mjs";

const GEN = 10n ** 18n;

test("V3 buy mints only collateral-backed conditional claims", () => {
  const pools = [2n * GEN, 2n * GEN];
  const quote = quoteBuy(pools, 0, GEN);

  assert.equal(quote.fee, 7_500_000_000_000_000n);
  assert.equal(quote.netCollateral, 992_500_000_000_000_000n);
  assert.equal(quote.outcomeSharesOut, 1_655_824_979_114_452_798n);
  assert.ok(product(quote.nextPools) >= product(pools));
  assert.deepEqual(priceVectorBps(quote.nextPools), [6912n, 3088n]);
});

test("V3 sell burns complete claims before releasing collateral", () => {
  const buy = quoteBuy([2n * GEN, 2n * GEN], 0, GEN);
  const sell = quoteSell(buy.nextPools, 0, buy.outcomeSharesOut / 2n);

  assert.equal(sell.grossCollateralOut, 536_153_054_941_146_313n);
  assert.equal(sell.collateralOut, 532_131_907_029_087_716n);
  assert.ok(product(sell.nextPools) >= product(buy.nextPools));
  assert.equal(priceVectorBps(sell.nextPools).reduce((sum, value) => sum + value, 0n), BPS_DENOMINATOR);
});

test("V3 supports a bounded three-outcome price vector that sums exactly to 10,000 bps", () => {
  const quote = quoteBuy([2n * GEN, 2n * GEN, 2n * GEN], 2, GEN);
  const prices = priceVectorBps(quote.nextPools);

  assert.equal(prices.length, 3);
  assert.equal(prices.reduce((sum, value) => sum + value, 0n), BPS_DENOMINATOR);
  assert.ok(prices[2] > prices[0]);
  assert.ok(prices[2] > prices[1]);
});

test("V3 LP quotes preserve existing pool claims and issue surplus claims to the depositor", () => {
  const buy = quoteBuy([2n * GEN, 2n * GEN], 0, GEN);
  const deposit = quoteAddLiquidity(buy.nextPools, 2n * GEN, GEN);
  const withdrawal = quoteRemoveLiquidity(deposit.nextPools, 2n * GEN + deposit.lpSharesOut, deposit.lpSharesOut);

  assert.ok(deposit.lpSharesOut > 0n);
  assert.equal(deposit.userOutcomeShares.length, 2);
  assert.ok(deposit.userOutcomeShares.every((value) => value >= 0n));
  assert.deepEqual(withdrawal, deposit.poolAdds);
});

test("V3 LP math refuses to quote removal of the final open-market share", () => {
  assert.throws(
    () => quoteRemoveLiquidity([2n * GEN, 2n * GEN], 2n * GEN, 2n * GEN),
    /invalid LP share amount/,
  );
});

test("V3 resolved trader and LP claims partition the complete winner supply", () => {
  const openingPools = [2n * GEN, 2n * GEN];
  const buy = quoteBuy(openingPools, 0, GEN);
  const totalWinnerClaims = buy.nextPools[0] + buy.outcomeSharesOut;

  assert.equal(totalWinnerClaims, 2n * GEN + buy.netCollateral);
  assert.equal(buy.outcomeSharesOut + buy.nextPools[0], totalWinnerClaims);
  assert.equal(totalWinnerClaims - buy.outcomeSharesOut, buy.nextPools[0]);
});

test("V3 randomized buy and sell paths preserve collateral accounting and valid reserves", () => {
  for (const outcomeCount of [2, 3]) {
    let pools = Array.from({ length: outcomeCount }, () => 2n * GEN);
    let traderClaims = Array.from({ length: outcomeCount }, () => 0n);
    let backing = BigInt(outcomeCount) * 2n * GEN;
    let claimLiability = backing;
    let accruedFees = 0n;
    let state = BigInt(outcomeCount * 17);

    for (let step = 0; step < 80; step += 1) {
      state = (state * 1_103_515_245n + 12_345n) % 2_147_483_648n;
      const outcomeIndex = Number(state % BigInt(outcomeCount));
      const canSell = traderClaims[outcomeIndex] > 1_000_000_000_000_000n;
      const shouldSell = canSell && state % 3n === 0n;
      const priorProduct = product(pools);

      if (shouldSell) {
        const sharesIn = traderClaims[outcomeIndex] / 3n;
        const quote = quoteSell(pools, outcomeIndex, sharesIn);
        pools = quote.nextPools;
        traderClaims[outcomeIndex] -= sharesIn;
        backing -= quote.collateralOut;
        claimLiability -= quote.grossCollateralOut;
        accruedFees += quote.fee;
      } else {
        const collateralIn = GEN / 10n + state % (GEN / 3n);
        const quote = quoteBuy(pools, outcomeIndex, collateralIn);
        pools = quote.nextPools;
        traderClaims[outcomeIndex] += quote.outcomeSharesOut;
        backing += collateralIn;
        claimLiability += quote.netCollateral;
        accruedFees += quote.fee;
      }

      assert.ok(product(pools) >= priorProduct);
      assert.ok(pools.every((pool) => pool > 0n));
      assert.equal(priceVectorBps(pools).reduce((sum, value) => sum + value, 0n), BPS_DENOMINATOR);
      assert.equal(backing, claimLiability + accruedFees);
    }
  }
});

test("V3 void payouts use a shrinking shared denominator so the final claimant receives all remaining collateral", () => {
  let backing = 10n;
  let shares = 30n;
  const first = quoteVoidClaim(backing, shares, 7n);
  backing -= first;
  shares -= 7n;
  const second = quoteVoidClaim(backing, shares, 11n);
  backing -= second;
  shares -= 11n;
  const last = quoteVoidClaim(backing, shares, shares);

  assert.equal(first + second + last, 10n);
  assert.equal(last, backing);
});

test("V3 market reference digest is canonical, NFC-normalized, and insensitive to equivalent Unicode input", () => {
  const input = {
    title: "Will Cafe\u0301 exist?",
    outcomes: ["yes", "no"],
    rules: "Use the declared evidence.",
    sourceUris: ["https://one.example", "https://two.example", "https://three.example", "https://four.example", "https://five.example"],
    closeTime: 1_790_000_000n,
  };
  const composed = { ...input, title: "Will Caf\u00e9 exist?" };

  assert.equal(marketReferenceDigest(input), marketReferenceDigest(composed));
  assert.equal(canonicalMarketPayload(input), canonicalMarketPayload(composed));
  assert.equal(marketReferenceDigest(input).length, 64);
});
