# OmniMarket V3 Bradbury Deployment Runbook

## Status

**Do not deploy V3 until every pre-deployment gate below is complete.** V2 stays
live at its historical address as a separate public-testnet primitive. V3 uses a
fresh Studio deployment and a fresh environment-variable namespace.

## Required Local Gates

Run from the repository root with the project dependencies installed:

```bash
npm run lint
npm test
npm run build
PYTHONPYCACHEPREFIX=/private/tmp/omnimarket-v3-pycache python3 -m py_compile contracts/omnimarket_v3.py studio_bradbury/omnimarket_v3.py
python3.12 -m venv .venv-genlayer
. .venv-genlayer/bin/activate
python -m pip install -r requirements-direct.txt
genvm-lint check contracts/omnimarket_v3.py
pytest tests/direct/test_omnimarket_v3_direct.py -v
```

The Direct Mode dependencies require Python 3.12 or newer. `genvm-lint check`
is the GenLayer static safety and semantic validation gate. A missing supported
Python runtime, package, linter result, or Direct Mode result is a blocked test,
not a passing result. Do not install these dependencies into macOS's protected
system Python; the local virtual environment above keeps this test tooling
isolated from the host.

## Studio Deployment

1. Confirm `cmp -s contracts/omnimarket_v3.py studio_bradbury/omnimarket_v3.py`.
2. In GenLayer Studio select **GenLayer Bradbury Testnet**.
3. Create a new file named `OmniMarketV3.py` and paste
   `studio_bradbury/omnimarket_v3.py` exactly.
4. Deploy a **new instance**. Do not use `Upgrade code` on V2.
5. Record the deployed address, deployment transaction, source commit, and
   `ACCEPTED` status in [V3_RELEASE_EVIDENCE_TEMPLATE.md](V3_RELEASE_EVIDENCE_TEMPLATE.md).
6. Before any frontend switch, run the lifecycle evidence below with a funded
   Bradbury wallet and wait for `FINALIZED`/`FINISHED_WITH_RETURN` where relevant.

## Minimum Bradbury Evidence

- Initial `get_market_count()` returns zero.
- A 2-outcome market and a 3-outcome market are created with exact native GEN
  attachments and five unique sources each.
- `get_market`, all active `get_price_bps` calls, and the observation history
  show a valid 10,000-bps vector after creation, buy, sell, and LP operations.
- `quote_buy`, `quote_sell`, and `quote_add_liquidity` match the exact integer
  result of the succeeding write. Every signed buy, sell, and LP deposit carries
  a minimum output reduced by no more than the documented 1% client tolerance.
- `quote_remove_liquidity` returns one claim quote per active outcome. A partial
  LP withdrawal succeeds with the lowest quote protected by the same 1% limit;
  attempts to remove the final LP share are rejected before signing and by the
  contract.
- A deposit above the 100 GEN per-market backing cap is rejected by the bridge
  and by the contract. Record both results.
- An account index returns the creator, trader, and LP market ids exactly once.
- Slippage rejection, pause restrictions, lock timing, challenge timing,
  settlement, void, every claim path, and fee withdrawal all have recorded
  positive and negative evidence.
- Browser wallet evidence covers rejected signatures, accepted transactions,
  finalization, refresh, account change, and network change.

## V3 Vercel Configuration

Only after the address passes the evidence gates, set:

```text
GENLAYER_OMNIMARKET_V3_CONTRACT_ADDRESS=0xYOUR_FRESH_V3_ADDRESS
NEXT_PUBLIC_OMNIMARKET_V3_CONTRACT_ADDRESS=0xYOUR_FRESH_V3_ADDRESS
GENLAYER_RPC_URL=https://rpc-bradbury.genlayer.com
GENLAYER_CHAIN_ID=bradbury
```

Redeploy after changing variables. The V2 variables remain untouched until an
explicit reviewed release decision changes the public default. Verify the V3
bridge before connecting it to a public trading route:

```bash
curl -sS -X POST https://YOUR_DOMAIN/api/omnimarket/v3 \
  -H 'content-type: application/json' \
  --data '{"action":"markets","cursor":0,"limit":24}'
```

The expected result is `{"ok":true,...}` with only data from the fresh V3
address. A configured route is not proof of payable writes or consensus
settlement; those require the recorded wallet and Studio evidence above.

`GET /api/omnimarket/v3/health` must return `status: "configured"` and confirm
the server/browser V3 address match before this public read route is announced.

Run the checked release smoke command against the production domain as well:

```bash
OMNIMARKET_V3_PUBLIC_URL=https://YOUR_DOMAIN bash scripts/release-smoke-v3.sh
```

It validates server/browser address parity, the Bradbury RPC and chain setting,
and that the deployed read bridge returns V3-only markets with exactly five
stored evidence URLs and a 10,000-bps outcome-price vector. It permits an empty
fresh deployment, but it never treats malformed market data as healthy.
