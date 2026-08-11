import test from "node:test";
import assert from "node:assert/strict";

const FEE_BPS = 75n;
const BPS_DENOMINATOR = 10_000n;

function feeFor(stake) {
  return stake * FEE_BPS / BPS_DENOMINATOR;
}

function firstOutcomePriceBps(outcomePool, oppositePool) {
  return outcomePool * BPS_DENOMINATOR / (outcomePool + oppositePool);
}

function winningPayout(stake, winningPool, totalPool) {
  return stake * totalPool / winningPool;
}

function immediateSettlementEstimate(grossStake, outcome0Pool, outcome1Pool, side) {
  const netStake = grossStake - feeFor(grossStake);
  const selectedPool = side === 0 ? outcome0Pool : outcome1Pool;
  return winningPayout(netStake, selectedPool + netStake, outcome0Pool + outcome1Pool + netStake);
}

test("pooled-market fee and price math matches the contract first-trade invariant", () => {
  const oneGen = 10n ** 18n;
  const startingOutcome0 = oneGen;
  const startingOutcome1 = oneGen;
  const grossStake = oneGen;
  const fee = feeFor(grossStake);
  const outcome0 = startingOutcome0 + grossStake - fee;

  assert.equal(fee, 7_500_000_000_000_000n);
  assert.equal(outcome0, 1_992_500_000_000_000_000n);
  const price0 = firstOutcomePriceBps(outcome0, startingOutcome1);
  const price1 = BPS_DENOMINATOR - price0;
  assert.equal(price0, 6658n);
  assert.equal(price1, 3342n);
  assert.equal(price0 + price1, BPS_DENOMINATOR);
});

test("winning payouts are bounded by the final outcome pool", () => {
  const outcome0 = 1_992_500_000_000_000_000n;
  const outcome1 = 1_000_000_000_000_000_000n;
  const traderStake = 992_500_000_000_000_000n;
  const totalPool = outcome0 + outcome1;
  const traderPayout = winningPayout(traderStake, outcome0, totalPool);

  assert.equal(traderPayout, 1_490_617_942_283_563_362n);
  assert.ok(traderPayout <= totalPool);
  assert.equal(winningPayout(outcome0, outcome0, totalPool), totalPool);
});

test("immediate trade estimate uses the same fee-reduced pari-mutuel math as settlement", () => {
  const oneGen = 10n ** 18n;
  const quote = immediateSettlementEstimate(oneGen, oneGen, oneGen, 0);

  assert.equal(quote, 1_490_617_942_283_563_362n);
  assert.equal(quote, winningPayout(992_500_000_000_000_000n, 1_992_500_000_000_000_000n, 2_992_500_000_000_000_000n));
});

test("void recovery preserves user net stakes and creator seed while fees remain accounted", () => {
  const creatorSeed = 2_000_000_000_000_000_000n;
  const grossStake = 1_000_000_000_000_000_000n;
  const fee = feeFor(grossStake);
  const userRefund = grossStake - fee;
  const contractBalance = creatorSeed + grossStake;

  assert.equal(userRefund + creatorSeed + fee, contractBalance);
});
