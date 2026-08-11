#!/usr/bin/env bash
set -euo pipefail

: "${OMNIMARKET_PUBLIC_URL:?Set OMNIMARKET_PUBLIC_URL to the Vercel production URL}"

base_url="${OMNIMARKET_PUBLIC_URL%/}"

health="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 20 "${base_url}/api/omnimarket/health")"
node -e '
const response = JSON.parse(process.argv[1]);
if (!response.ok || response.status !== "configured" || !response.addressMatch || !response.rpcConfigured || response.chain !== "bradbury") {
  throw new Error("Health check did not confirm a configured Bradbury deployment.");
}
console.log(`Health configured for ${response.chain}; address parity confirmed.`);
' "$health"

markets="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
  -X POST "${base_url}/api/omnimarket" \
  -H 'content-type: application/json' \
  --data '{"action":"markets","cursor":0,"limit":24}')"
node -e '
const response = JSON.parse(process.argv[1]);
if (!response.ok || !Array.isArray(response.markets) || !Number.isSafeInteger(response.total) || response.total < 0) {
  throw new Error("Live market discovery did not return a valid contract response.");
}
console.log(`Live contract discovery succeeded: ${response.markets.length} market(s) in this page, ${response.total} total.`);
' "$markets"
