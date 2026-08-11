# Incident Response

This runbook covers the current Bradbury public-testnet architecture. It does not claim that the contract has an emergency pause; the current contract does not.

## Triage

1. Record the public URL, deployment commit, contract address, chain, UTC time, wallet address if voluntarily provided, and transaction hash.
2. Classify the issue as read availability, wallet/network mismatch, rejected transaction, incorrect displayed state, settlement liveness, or suspected contract loss.
3. Compare the UI with `get_market`, `get_price_bps`, `get_price_observation`, `get_source_observation`, and the transaction receipt. The contract state wins over cached UI text.

## Read bridge outage

- Check `/api/omnimarket/health` and Vercel runtime logs without exposing environment values.
- Confirm both contract-address variables, `GENLAYER_CHAIN_ID`, and the RPC endpoint.
- If traffic is abusive, use the configured edge firewall/rate-limit control first. The in-process limiter is only a bounded fallback and is not shared across serverless instances.
- Redeploy only after configuration is corrected; the bridge must fail closed rather than invent a market.

## Wallet or transaction issue

- Ask the user to confirm Bradbury, the contract address, method, native GEN value, and receipt status.
- Never ask for a private key or seed phrase.
- A rejected, reverted, undetermined, or timed-out transaction is not a successful trade or claim. Re-read accepted contract state before retrying.

## Settlement liveness issue

- Check whether the market is past close, locked, and past the safety delay.
- Retry permissionless `resolve_market` through the documented keeper path.
- If the settlement timeout has elapsed without a finalized resolution result, use `void_locked_market`; then verify trader and creator recovery paths.
- Because there is no pause or appeal mechanism in this version, escalate suspected contract-state defects and stop advertising the affected market.

## Suspected funds or integrity issue

- Stop new public promotion and preserve all evidence.
- Do not attempt an undocumented admin method or upgrade.
- Compare the canonical and Studio source files, the deployment address, the deployment transaction, and the release commit.
- Notify affected users with factual transaction-level information only. Complete the security and legal review before resuming.
