#!/usr/bin/env bash
set -euo pipefail

: "${OMNIMARKET_V3_PUBLIC_URL:?Set OMNIMARKET_V3_PUBLIC_URL to the V3 Vercel production URL}"

base_url="${OMNIMARKET_V3_PUBLIC_URL%/}"

health="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 20 "${base_url}/api/omnimarket/v3/health")"
node -e '
const response = JSON.parse(process.argv[1]);
if (!response.ok || response.status !== "configured" || !response.addressMatch || !response.rpcConfigured || response.chain !== "bradbury") {
  throw new Error("V3 health check did not confirm a configured Bradbury deployment.");
}
console.log(`V3 health configured for ${response.chain}; address parity confirmed.`);
' "$health"

markets="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
  -X POST "${base_url}/api/omnimarket/v3" \
  -H 'content-type: application/json' \
  --data '{"action":"markets","cursor":0,"limit":24}')"

node -e '
const response = JSON.parse(process.argv[1]);
if (!response.ok || !Array.isArray(response.markets) || !Number.isSafeInteger(response.total) || response.total < 0) {
  throw new Error("V3 live market discovery did not return a valid contract response.");
}

for (const item of response.markets) {
  const market = item && typeof item === "object" ? item.market : null;
  const prices = item && typeof item === "object" ? item.pricesBps : null;
  if (!market || typeof market !== "object" || market.market_version !== 3 ||
      !Number.isSafeInteger(market.market_id) || ![2, 3].includes(market.outcome_count) ||
      !Array.isArray(market.source_uris) || market.source_uris.length !== 5 ||
      !Array.isArray(prices) || prices.length !== market.outcome_count ||
      prices.some((price) => !Number.isSafeInteger(price) || price < 0 || price > 10000) ||
      prices.reduce((sum, price) => sum + price, 0) !== 10000) {
    throw new Error("V3 live market response failed its release integrity checks.");
  }
}

console.log(`V3 live contract discovery succeeded: ${response.markets.length} market(s) in this page, ${response.total} total.`);
' "$markets"
