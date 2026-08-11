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

## Direct Mode Checks

GenLayer Direct Mode is the deterministic in-memory layer for contract tests. It requires Python 3.12 or newer; the repository's `direct-mode` CI job installs the official `genlayer-test` package and executes `tests/direct`.

To run the same checks locally with Python 3.12:

```bash
python3.12 -m venv .venv-direct
source .venv-direct/bin/activate
python -m pip install -r requirements-direct.txt
python -m pytest tests/direct -v
```

The Direct Mode suite proves initialization and deterministic read/revert behavior. It does not pretend to prove native-value transfers or web consensus. Those require the separate Studio and browser checks below.

## Studio Checks

Use `STUDIO_BRADBURY_TEST_PLAN.md` for the lifecycle sequence. Studio can validate method shape, storage, indexes, price movement, lock transitions, source observation storage, and the live resolution path. Record every transaction hash, execution result, and finalization status.

GenLayer documents two complementary testing modes: use Direct Mode for fast deterministic in-memory unit and invariant checks, and use Studio Mode for network-backed consensus and integration checks. Direct Mode should mock web and LLM inputs; Studio Mode should use real network reads and record transaction status plus execution result. Do not treat a local mock as proof that a Bradbury resolution completed. See the [official testing documentation](https://docs.genlayer.com/developers/intelligent-contracts/testing).

## Bradbury Native-Value Checks

Use a funded Bradbury wallet to prove the parts Studio cannot prove reliably:

1. Create with five unique source URIs and `value == seed_liquidity_units`.
2. Trade with `value == stake_units`.
3. Confirm pool totals and both probabilities change.
4. Resolve through `resolve_market` after lock.
5. Record the wallet balance before and after `claim_winnings`.

## Evidence Required for Public Release

- New contract address and deployment transaction.
- Finalized create transaction with attached value.
- Finalized trade transaction with attached value.
- `get_market` before and after the trade.
- Both `get_price_bps` values before and after the trade.
- At least two `get_price_observation` records.
- Finalized lock and resolution transactions.
- Final market state with confidence, reason code, summary, and resolution timestamp.
- Five stored `get_source_observation` records showing each source status and vote.
- Successful claim and native wallet balance delta.
- Production URL showing the same contract address is configured.

## Settlement liveness

`resolve_market` is permissionless, but a public deployment should run a funded GenLayer CLI account on a scheduler so eligible markets do not wait for a user. See [keeper operations](../OPERATIONS_KEEPER.md). The keeper submits only the contract method; timing, evidence fetching, quorum, and final state remain contract-controlled.

If resolution is repeatedly undetermined, wait until `close_time + 120 + 86400` and call `void_locked_market`. Confirm `status: 4`, then use `claim_winnings` for trader refunds and `claim_void_seed` for the creator seed. This is a timeout fallback, not an operator override.
