#!/usr/bin/env bash
set -u

: "${OMNIMARKET_CONTRACT_ADDRESS:?Set OMNIMARKET_CONTRACT_ADDRESS to the deployed Bradbury address}"
: "${OMNIMARKET_MARKET_IDS:?Set OMNIMARKET_MARKET_IDS to comma-separated market ids}"

rpc_args=()
if [[ -n "${GENLAYER_RPC_URL:-}" ]]; then
  rpc_args+=(--rpc "$GENLAYER_RPC_URL")
fi

IFS=',' read -r -a market_ids <<< "$OMNIMARKET_MARKET_IDS"
for market_id in "${market_ids[@]}"; do
  market_id="${market_id//[[:space:]]/}"
  if [[ ! "$market_id" =~ ^[1-9][0-9]*$ ]]; then
    printf 'Skipping invalid market id: %s\n' "$market_id" >&2
    continue
  fi

  printf 'Submitting permissionless resolution for market %s\n' "$market_id"
  if ! genlayer write "$OMNIMARKET_CONTRACT_ADDRESS" resolve_market "${rpc_args[@]}" --args "$market_id"; then
    printf 'Market %s was not submitted; it may be before the safety window or already finalized.\n' "$market_id" >&2
  fi
done
