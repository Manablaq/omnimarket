# Guide

## Purpose

`OmniMarket` gives GenLayer builders a reusable prediction-market contract that keeps the market lifecycle on-chain and delegates the hard real-world outcome decision to GenLayer validator consensus.

The frontend can display charts and prepare calls, but it does not decide the winner. The contract stores the evidence source and rules, fetches evidence during resolution, validates the returned JSON shape, and only then writes final state.

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

