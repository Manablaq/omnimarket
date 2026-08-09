# Vercel Deployment

This project is intended to become a public prediction market app after the `OmniMarket` contract is deployed on Bradbury.

## Required Environment Variables

Set these in Vercel before public launch:

```text
GENLAYER_CHAIN_ID=bradbury
GENLAYER_OMNIMARKET_CONTRACT_ADDRESS=0x0E1201A1F5477e635306BC3E34e68658e4489fBd
```

## Vercel Import Settings

- Repository: `https://github.com/Manablaq/omnimarket`
- Framework preset: `Next.js`
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: leave as Vercel default
- Node.js version: `22.x`

## Contract Read Flow

The frontend polls:

- `get_market(market_id)`
- `get_price_bps(market_id, 0)`
- `get_price_bps(market_id, 1)`

Those reads power the live chart, pool depth, market status, and current odds.

## Contract Write Flow

The write controls map to:

- `create_market`
- `buy_position`
- `admin_resolve_for_studio`

Public production writes require a wallet-backed GenLayer client or a configured write relay. The app does not fake write success when signing is unavailable.

## Public Launch Checklist

1. Deploy `studio_bradbury/omnimarket.py` on Bradbury.
2. Record the contract address in `TEST_LOG_BRADBURY.md`.
3. Set `GENLAYER_OMNIMARKET_CONTRACT_ADDRESS` in Vercel to `0x0E1201A1F5477e635306BC3E34e68658e4489fBd`.
4. Create at least one live market from Studio or the app.
5. Confirm the app chart changes after `buy_position`.
6. Confirm `get_market` reflects pool totals after trade.
7. Confirm the production URL has no unconfigured contract warning.
