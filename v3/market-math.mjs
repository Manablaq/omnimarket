import { createHash } from "node:crypto";

export const BPS_DENOMINATOR = 10_000n;
export const FEE_BPS = 75n;
export const MAX_OUTCOMES = 3;

export function ceilDiv(numerator, denominator) {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  return (numerator + denominator - 1n) / denominator;
}

export function feeFor(amount) {
  if (amount < 0n) throw new Error("amount must not be negative");
  return amount * FEE_BPS / BPS_DENOMINATOR;
}

export function assertPools(pools) {
  if (!Array.isArray(pools) || pools.length < 2 || pools.length > MAX_OUTCOMES) {
    throw new Error("V3 supports two or three outcomes");
  }
  if (pools.some((pool) => typeof pool !== "bigint" || pool <= 0n)) {
    throw new Error("all outcome reserves must be positive");
  }
}

export function product(pools) {
  assertPools(pools);
  return pools.reduce((total, pool) => total * pool, 1n);
}

export function priceVectorBps(pools) {
  assertPools(pools);
  const weights = pools.map((_, outcomeIndex) =>
    pools.reduce((weight, pool, poolIndex) => poolIndex === outcomeIndex ? weight : weight * pool, 1n),
  );
  const denominator = weights.reduce((total, weight) => total + weight, 0n);
  let assigned = 0n;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return BPS_DENOMINATOR - assigned;
    const price = weight * BPS_DENOMINATOR / denominator;
    assigned += price;
    return price;
  });
}

export function quoteBuy(pools, outcomeIndex, collateralIn) {
  assertPools(pools);
  if (!Number.isInteger(outcomeIndex) || outcomeIndex < 0 || outcomeIndex >= pools.length) {
    throw new Error("invalid outcome index");
  }
  if (collateralIn <= 0n) throw new Error("collateral input must be positive");

  const fee = feeFor(collateralIn);
  const netCollateral = collateralIn - fee;
  if (netCollateral <= 0n) throw new Error("trade is too small after fees");

  const invariant = product(pools);
  const mintedPools = pools.map((pool) => pool + netCollateral);
  const otherProduct = mintedPools.reduce(
    (total, pool, index) => index === outcomeIndex ? total : total * pool,
    1n,
  );
  const remainingOutcomeReserve = ceilDiv(invariant, otherProduct);
  const outcomeSharesOut = mintedPools[outcomeIndex] - remainingOutcomeReserve;
  if (outcomeSharesOut <= 0n) throw new Error("trade produces no outcome shares");

  const nextPools = mintedPools.map((pool, index) =>
    index === outcomeIndex ? remainingOutcomeReserve : pool,
  );
  return { fee, netCollateral, outcomeSharesOut, nextPools };
}

export function quoteSell(pools, outcomeIndex, outcomeSharesIn) {
  assertPools(pools);
  if (!Number.isInteger(outcomeIndex) || outcomeIndex < 0 || outcomeIndex >= pools.length) {
    throw new Error("invalid outcome index");
  }
  if (outcomeSharesIn <= 0n) throw new Error("outcome shares must be positive");

  const invariant = product(pools);
  let upperBound = pools[outcomeIndex] + outcomeSharesIn;
  for (let index = 0; index < pools.length; index += 1) {
    if (index !== outcomeIndex && pools[index] < upperBound) upperBound = pools[index];
  }
  // A zero reserve makes a future quote undefined, so retain at least one unit.
  upperBound -= 1n;
  let low = 0n;
  let high = upperBound;
  while (low < high) {
    const candidate = (low + high + 1n) / 2n;
    const candidateProduct = pools.reduce(
      (total, pool, index) => total * (index === outcomeIndex
        ? pool + outcomeSharesIn - candidate
        : pool - candidate),
      1n,
    );
    if (candidateProduct >= invariant) low = candidate;
    else high = candidate - 1n;
  }
  if (low <= 0n) throw new Error("position is too small to exit");
  const fee = feeFor(low);
  const collateralOut = low - fee;
  if (collateralOut <= 0n) throw new Error("exit is too small after fees");
  const nextPools = pools.map((pool, index) => index === outcomeIndex
    ? pool + outcomeSharesIn - low
    : pool - low);
  return { grossCollateralOut: low, fee, collateralOut, nextPools };
}

export function quoteAddLiquidity(pools, totalLpShares, collateralIn) {
  assertPools(pools);
  if (totalLpShares <= 0n || collateralIn <= 0n) throw new Error("positive LP values are required");
  const largestReserve = pools.reduce((largest, pool) => pool > largest ? pool : largest, 0n);
  const lpSharesOut = collateralIn * totalLpShares / largestReserve;
  if (lpSharesOut <= 0n) throw new Error("deposit is too small for one LP share unit");
  const poolAdds = pools.map((pool) => pool * lpSharesOut / totalLpShares);
  const userOutcomeShares = poolAdds.map((poolAdd) => collateralIn - poolAdd);
  return { lpSharesOut, poolAdds, userOutcomeShares, nextPools: pools.map((pool, index) => pool + poolAdds[index]) };
}

export function quoteRemoveLiquidity(pools, totalLpShares, lpSharesIn) {
  assertPools(pools);
  // Open-market liquidity must retain a non-zero LP supply. This matches the
  // contract guard and preserves a priceable reserve until settlement.
  if (totalLpShares <= 0n || lpSharesIn <= 0n || lpSharesIn >= totalLpShares) {
    throw new Error("invalid LP share amount");
  }
  return pools.map((pool) => pool * lpSharesIn / totalLpShares);
}

export function quoteVoidClaim(remainingBacking, remainingShareUnits, accountShareUnits) {
  if (remainingBacking < 0n || remainingShareUnits <= 0n || accountShareUnits <= 0n || accountShareUnits > remainingShareUnits) {
    throw new Error("invalid void claim");
  }
  if (accountShareUnits === remainingShareUnits) return remainingBacking;
  return accountShareUnits * remainingBacking / remainingShareUnits;
}

export function canonicalMarketPayload({ title, outcomes, rules, sourceUris, closeTime }) {
  if (!Array.isArray(outcomes) || outcomes.length < 2 || outcomes.length > MAX_OUTCOMES) {
    throw new Error("two or three outcomes are required");
  }
  if (!Array.isArray(sourceUris) || sourceUris.length !== 5) {
    throw new Error("exactly five source URIs are required");
  }
  return JSON.stringify({
    market_version: 3,
    title: String(title).normalize("NFC"),
    outcomes: outcomes.map((outcome) => String(outcome).normalize("NFC")),
    rules: String(rules).normalize("NFC"),
    source_uris: sourceUris.map((uri) => String(uri).normalize("NFC")),
    close_time: BigInt(closeTime).toString(),
  });
}

export function marketReferenceDigest(input) {
  return createHash("sha256").update(canonicalMarketPayload(input), "utf8").digest("hex");
}
