# Vercel Deployment

## Required Contract Configuration

Deploy a new native-GEN OmniMarket instance on Bradbury first. Then add both variables in Vercel for **Production and Preview**:

```text
GENLAYER_CHAIN_ID=bradbury
GENLAYER_RPC_URL=https://rpc-bradbury.genlayer.com
GENLAYER_OMNIMARKET_CONTRACT_ADDRESS=0xYOUR_NEW_BRADBURY_ADDRESS
NEXT_PUBLIC_OMNIMARKET_CONTRACT_ADDRESS=0xYOUR_NEW_BRADBURY_ADDRESS
```

The server variable powers accepted-state reads. `GENLAYER_RPC_URL` is an optional explicit Bradbury endpoint; when omitted, the SDK's official Bradbury chain configuration supplies its default. The public variable powers browser wallet writes. They must identify the same new contract. There is no legacy address fallback.

## Import Settings

- Repository: `https://github.com/Manablaq/omnimarket`
- Framework: `Next.js`
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: Vercel default
- Node.js: `22.x`

## What the API Reads

The read-only route at `/api/omnimarket` uses GenLayerJS `testnetBradbury` and accepted state reads. If `GENLAYER_RPC_URL` is set, it is passed as the SDK endpoint override. It discovers all markets from `get_market_count` and `get_market_id_at`, then reads `get_market` and both `get_price_bps` values. The history action reads contract-written `get_price_observation` records. The portfolio action reads the account index, positions, and payout previews.

If the configured address is a legacy contract or the variables are missing, the route returns a visible error. It does not silently substitute market 1.

## What the Browser Signs

The browser creates a wallet-backed GenLayerJS client and signs:

- `create_market` with native GEN value equal to seed liquidity.
- `buy_position` with native GEN value equal to the stake.
- `lock_market` after close.
- `resolve_market` after locking.
- `claim_winnings` for finalized positions.

The app waits for an `ACCEPTED` receipt and checks `FINISHED_WITH_RETURN` before refreshing. No private key is stored in Vercel and the API never signs for a user.

## Launch Checklist

1. Deploy the new contract and record the address and transaction hash.
2. Set all three variables above in Vercel.
3. Redeploy after saving variables.
4. Open the production URL and confirm the market index loads from the new instance.
5. Create a small market with a future close time and an even native-GEN seed.
6. Verify the first chart observation appears from the contract.
7. Trade from a second funded wallet and verify both pool totals and both chart lines change.
8. After close, lock and resolve through the actual consensus path.
9. Claim from a winning wallet on Bradbury and verify the native balance change.

There is no frontend bypass resolver. Both Studio and production use the same `resolve_market` path; source receipts and the final state must be produced by the deployed Intelligent Contract.
