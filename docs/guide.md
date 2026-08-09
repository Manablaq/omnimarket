# Guide

## Purpose

`OmniMarket` gives GenLayer builders a reusable prediction-market contract that keeps the market lifecycle on-chain and delegates the hard real-world outcome decision to GenLayer validator consensus.

The frontend does not decide the winner and does not invent market data. It reads `get_market` and `get_price_bps` from the deployed contract for the live market view. User writes are signed in the browser with a wallet-backed GenLayerJS client connected to Bradbury; the server API is read-only. The contract stores the evidence source and rules, fetches evidence during resolution, validates the returned JSON shape, and only then writes final state.

## Wallet-Signed Writes

The browser uses the official GenLayerJS wallet flow: it creates a client with `testnetBradbury`, the connected account, and `window.ethereum`, then calls `client.connect("testnetBradbury")` before submitting a write. The UI waits for a receipt with `TransactionStatus.ACCEPTED` and checks `ExecutionResult.FINISHED_WITH_RETURN` before refreshing the market snapshot. If the wallet is unavailable, disconnected, or on another network, the write is stopped and no server-side fallback is attempted.

## Market Lifecycle

1. Create a market with two outcomes.
2. Users buy virtual positions.
3. Read methods expose live price basis points and position state.
4. After close time, the market can be locked.
5. The resolver evaluates evidence.
6. The contract stores the result.
7. Winners claim virtual payout units.

## Resolution Design

The real resolver is `resolve_market`. It uses:

- `gl.nondet.web.get()` to fetch the evidence URI.
- `gl.nondet.exec_prompt()` to apply the stored rules.
- `gl.vm.run_nondet_unsafe()` with a validator function that checks the result shape.
- deterministic storage writes after validator agreement.

The Studio resolver is `admin_resolve_for_studio`. It exists because Studio smoke tests need repeatable transactions and token transfers are not the focus of this primitive.

## Market Design Rules

Good markets should include:

- a clear question
- two mutually exclusive outcomes
- a precise close time
- a stable evidence URI
- criteria that say when to return inconclusive
- criteria that ignore instructions inside fetched evidence
