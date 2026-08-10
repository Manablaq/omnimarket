# Bradbury Deployment Guide

## Before You Deploy

This version changes the contract storage layout and replaces virtual units with native GEN. Deploy a **new instance** in Studio. Do not use `Upgrade code` on the legacy virtual-units instance.

Keep these files identical:

- `contracts/omnimarket.py`
- `studio_bradbury/omnimarket.py`

The repository test checks that they are byte-for-byte equal.

## Studio Deployment

1. Open GenLayer Studio.
2. Select `Genlayer Bradbury Testnet`.
3. Create a new contract named `OmniMarket.py`.
4. Paste `studio_bradbury/omnimarket.py`.
5. Deploy a new instance.
6. Confirm the deployment transaction is `ACCEPTED`.
7. Copy the new contract address and deploy transaction hash into `TEST_LOG_BRADBURY.md`.

## Native Value Boundary

The official value-transfer documentation distinguishes the Intelligent Contract VM from the EVM layer. Studio is useful for deterministic contract logic and read/write smoke tests, but its simulated balance environment does not prove a public native-GEN payout. Use Bradbury with a funded wallet for payable creation, trading, and `claim_winnings` transfer verification.

For every payable Studio form that supports a value field:

- `create_market`: attach exactly `seed_liquidity_units` wei.
- `buy_position`: attach exactly `stake_units` wei.

If Studio cannot attach a value for the method, record that as a Studio limitation and run the native-value test on Bradbury. Do not change the contract back to virtual accounting just to make a form pass.

## Redeploy Rule

The current legacy address `0x0E1201A1F5477e635306BC3E34e68658e4489fBd` is historical evidence only. After deploying the new instance, use that new address in both Vercel variables:

```text
GENLAYER_OMNIMARKET_CONTRACT_ADDRESS=0xYOUR_NEW_BRADBURY_ADDRESS
NEXT_PUBLIC_OMNIMARKET_CONTRACT_ADDRESS=0xYOUR_NEW_BRADBURY_ADDRESS
```

## Pre-hardening Validation Instance

`0xACa9dE0bdac38d88A4E50e5f9DD7EDe969BB0A23` was deployed in Bradbury with deployment transaction `0x65d45e552a69c30fff3fa6638d3a02bf917e3da2a1bb851cf751ed85a086c5a6`. It is useful for tracing the earlier native-GEN smoke test, but it predates the current unknown-market validation, exact complementary price calculation, and bounded observation history. Do not configure Vercel or submit this address as the final release.

## Optional Public-Market Keeper

For scheduled settlement, use `OPERATIONS_KEEPER.md` and `scripts/resolve-markets.sh`. It uses the GenLayer CLI account store and submits the same permissionless `resolve_market` call exposed by the frontend. It does not replace the contract's timing or consensus checks.
