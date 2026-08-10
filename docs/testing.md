# Testing

## Local Checks

```bash
npm install
npm run lint
npm test
PYTHONPYCACHEPREFIX=/private/tmp/omni-pycache python3 -m py_compile contracts/omnimarket.py studio_bradbury/omnimarket.py
npm run build
```

The contract and Studio copy must remain identical. The source test asserts that invariant.

## Studio Checks

Use `STUDIO_BRADBURY_TEST_PLAN.md` for the lifecycle sequence. Studio can validate method shape, storage, indexes, price movement, lock transitions, source observation storage, and the live resolution path. Record every transaction hash and accepted result.

## Bradbury Native-Value Checks

Use a funded Bradbury wallet to prove the parts Studio cannot prove reliably:

1. Create with five unique source URIs and `value == seed_liquidity_units`.
2. Trade with `value == stake_units`.
3. Confirm pool totals and both probabilities change.
4. Resolve through `resolve_market` after lock.
5. Record the wallet balance before and after `claim_winnings`.

## Evidence Required for Public Release

- New contract address and deployment transaction.
- Accepted create transaction with attached value.
- Accepted trade transaction with attached value.
- `get_market` before and after the trade.
- Both `get_price_bps` values before and after the trade.
- At least two `get_price_observation` records.
- Accepted lock and resolution transactions.
- Final market state with confidence, reason code, summary, and resolution timestamp.
- Five stored `get_source_observation` records showing each source status and vote.
- Successful claim and native wallet balance delta.
- Production URL showing the same contract address is configured.

## Settlement liveness

`resolve_market` is permissionless, but a public deployment should run a funded GenLayer CLI account on a scheduler so eligible markets do not wait for a user. See [keeper operations](../OPERATIONS_KEEPER.md). The keeper submits only the contract method; timing, evidence fetching, quorum, and final state remain contract-controlled.

If resolution is repeatedly undetermined, wait until `close_time + 120 + 86400` and call `void_locked_market`. Confirm `status: 4`, then use `claim_winnings` for trader refunds and `claim_void_seed` for the creator seed. This is a timeout fallback, not an operator override.
