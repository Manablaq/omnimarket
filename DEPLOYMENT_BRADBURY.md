# Bradbury Deployment Guide

## Target

Deploy `studio_bradbury/omnimarket.py` in GenLayer Studio.

## Network

Select `Genlayer Bradbury Testnet`.

## Deployment Steps

1. Open GenLayer Studio.
2. Create a new contract named `OmniMarket.py`.
3. Paste the full contents of `studio_bradbury/omnimarket.py`.
4. Deploy a new instance.
5. Confirm the deploy transaction is `ACCEPTED`.
6. Copy the deployed contract address.
7. Record the address in `TEST_LOG_BRADBURY.md`.

## Important Notes

- Studio currently works best with virtual stake units for this type of demo.
- Do not use token-transfer assumptions for the Studio smoke test.
- Use `admin_resolve_for_studio` for deterministic proof that positions, pricing, resolution state, and payout preview work.
- Use `resolve_market` for the true GenLayer web/AI resolution path after the market close timestamp has passed.

