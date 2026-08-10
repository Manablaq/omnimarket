# OmniMarket Keeper

OmniMarket settlement is permissionless: the contract accepts `resolve_market` from any account after close, lock, and the 120-second safety delay. The web app exposes that action for users. For public markets, an operator can also run the included CLI worker from cron or another scheduler.

## Requirements

- GenLayer CLI installed and configured with a funded Bradbury account.
- The account key stored in the CLI account store, never in this repository or Vercel.
- `OMNIMARKET_CONTRACT_ADDRESS` set to the current Bradbury deployment.
- `OMNIMARKET_MARKET_IDS` set to comma-separated ids, for example `1,2,3`.
- Optional `GENLAYER_RPC_URL` set to the Bradbury RPC. If omitted, the CLI's configured network is used.

## Run

```bash
export OMNIMARKET_CONTRACT_ADDRESS=0xYOUR_NEW_BRADBURY_ADDRESS
export OMNIMARKET_MARKET_IDS=1,2,3
export GENLAYER_RPC_URL=https://rpc-bradbury.genlayer.com
bash scripts/resolve-markets.sh
```

The worker intentionally submits only `resolve_market`. The contract remains the authority for timing, lifecycle, source fetching, quorum, and final state. A too-early or already-finalized market is rejected safely and the worker continues to the next id. If a market remains locked after the settlement timeout, an operator or any other account may submit `void_locked_market` to make refunds available; this method is permissionless and does not choose a winner.

The command and argument format follow the GenLayer CLI `write` interface. The worker does not hold user funds, does not bypass consensus, and does not perform a frontend or operator-side resolution.
