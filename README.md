# OmniMarket

An advanced prediction market built around a reusable GenLayer Intelligent Contract primitive. The contract manages market creation, virtual liquidity, positions, live price views, evidence-bound resolution, and Studio-safe payout accounting while leaving the consensus-critical outcome decision on GenLayer.

This is not a copied frontend market. The frontend is a live chart and trading-console companion for the Intelligent Contract in `contracts/omnimarket.py`.

## Why This Matters

Most prediction markets depend on a centralized operator or external oracle to decide the final answer. GenLayer changes that shape: the market can declare its evidence source and resolution rules, then validators agree on the outcome through nondeterministic web access and AI-assisted comparison.

`OmniMarket` is designed as a primitive that other builders can reuse for:

- event markets with explicit evidence URIs
- ecosystem milestone markets
- macro and crypto data markets
- grant, bounty, and governance decision markets
- experimental resolver UIs that need on-chain decision state

## Intelligent Contract Features

- Market creation with title, outcomes, rules, evidence URI, close time, and seed liquidity.
- Virtual stake units for Bradbury Studio testing while token transfer support matures in Studio.
- Live on-chain price basis points from market pools.
- Position tracking by wallet and market.
- Market locking after close time.
- Web and semantic resolution through GenLayer nondeterministic execution.
- Validator-side result validation before deterministic state writes.
- Studio admin resolution for repeatable smoke tests.
- Claimable virtual payouts after resolution or refund on void markets.

## Contract

Primary contract:

```text
contracts/omnimarket.py
```

Studio copy:

```text
studio_bradbury/omnimarket.py
```

Deploy the Studio copy on GenLayer Studio with the Bradbury Testnet selected.

## Frontend

The app in `app/page.tsx` is a production-facing market console:

- live implied-probability chart powered by contract reads through `/api/omnimarket`
- multi-market selector
- browser wallet connection and Bradbury network validation
- market creation form
- trade action mapped to `buy_position`
- Studio resolution control mapped to `admin_resolve_for_studio`
- pool depth visualization
- GenLayer resolver panel
- evidence source panel
- contract method guide

Run locally:

```bash
npm install
npm run dev
```

`genlayer-js` is listed as a runtime dependency for Bradbury reads and wallet-backed writes. Vercel installs dependencies with `npm install` during deployment.

### What Is Live

The production UI does not ship sample markets or synthetic prices. The server route reads `get_market` and both `get_price_bps` values from the configured deployed contract. The chart is populated only from successful contract snapshots, and refreshes every 12 seconds.

Writes are signed by the visitor's browser wallet. The app creates a wallet-backed GenLayerJS client on `testnetBradbury`, calls `client.connect("testnetBradbury")`, submits the selected contract method, and waits for an `ACCEPTED` receipt. The API route is intentionally read-only; it never signs or submits a transaction on behalf of a user.

The current Bradbury deployment is `0x0E1201A1F5477e635306BC3E34e68658e4489fBd`. A wallet must be connected to Bradbury before a user can create a market, trade, or run the Studio resolver action.

Build:

```bash
npm run build
```

## Core Flow

1. `create_market` creates a two-outcome market.
2. `buy_position` records virtual stake units on outcome 0 or outcome 1.
3. `get_price_bps` exposes live odds from the current pool distribution.
4. `lock_market` moves a closed market into the resolution state.
5. `resolve_market` fetches the evidence URI and asks GenLayer validators to agree on a JSON outcome.
6. `claim_winnings` returns the virtual payout amount for the caller.

## Resolution Codes

| Code | Meaning |
| --- | --- |
| `0` | unknown |
| `1` | outcome 0 won |
| `2` | outcome 1 won |
| `3` | inconclusive |
| `4` | resolver error |

## Status Codes

| Code | Meaning |
| --- | --- |
| `0` | draft |
| `1` | open |
| `2` | locked |
| `3` | resolved |
| `4` | void |

## Documentation

- `docs/guide.md`
- `docs/testing.md`
- `docs/architecture.md`
- `DEPLOYMENT_BRADBURY.md`
- `VERCEL_DEPLOYMENT.md`
- `STUDIO_BRADBURY_TEST_PLAN.md`
- `API_MANIFEST.md`
- `SUBMISSION_BRIEF.md`

## Environment

Copy `.env.example` and set:

```text
GENLAYER_RPC_URL=
GENLAYER_CHAIN_ID=bradbury
GENLAYER_OMNIMARKET_CONTRACT_ADDRESS=
```

The app is not linked to `OutcomeAttestationRegistry` or `SemanticPolicyGate`.

## Source References

This implementation follows GenLayer's documented model for Intelligent Contracts: deterministic storage and views, nondeterministic web/LLM operations inside nondeterministic blocks, and deterministic state writes after validator agreement.

- GenLayer Intelligent Contract features: https://docs.genlayer.com/developers/intelligent-contracts/features
- Non-determinism: https://docs.genlayer.com/developers/intelligent-contracts/features/non-determinism
- Web data access: https://docs.genlayer.com/understand-genlayer-protocol/core-concepts/web-data-access
- When to use GenLayer: https://docs.genlayer.com/developers/intelligent-contracts/when-to-use-genlayer
