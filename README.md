# OmniMarket

OmniMarket is a reusable GenLayer Intelligent Contract primitive for two-outcome prediction markets. It stores market definitions, native GEN liquidity, positions, accepted price observations, and evidence-bound settlement state on-chain. The web app is a read-through and wallet-signing client for that contract; it is not the source of truth.

## What Is Real

- Market discovery comes from `get_market_count` and `get_market_id_at`.
- Market data and odds come from accepted Bradbury contract reads.
- The chart uses contract-written `PriceObservation` records, not browser-generated points.
- Creation and trading attach native GEN in wei to payable contract methods.
- Resolution independently evaluates five declared evidence sources inside GenLayer nondeterministic execution and requires an independently reproduced three-source quorum. Validators compare the normalized settlement decision, not volatile raw web digests or LLM confidence wording.
- A winning claim sends native GEN from the contract to the caller.
- A void market lets traders reclaim net positions and its creator reclaim the original seed once.
- Protocol fees are separately accounted and can only be withdrawn by the contract owner up to the accrued balance.
- The server API is read-only. It never signs, simulates success, or holds user funds.

## Important Deployment Boundary

The address previously recorded in this repository, `0x0E1201A1F5477e635306BC3E34e68658e4489fBd`, is a legacy virtual-units deployment. It does not contain the current native-GEN storage layout and must not be used with this version.

The latest recorded Bradbury validation instance, `0xACa9dE0bdac38d88A4E50e5f9DD7EDe969BB0A23` (deployment transaction `0x65d45e552a69c30fff3fa6638d3a02bf917e3da2a1bb851cf751ed85a086c5a6`), was deployed before the current post-audit source hardening. It is pre-hardening evidence only, not the final public-release contract. A final new Bradbury instance must be deployed from the current synchronized source before launch.

Because the current contract adds storage fields and changes payable behavior, deploy a **new instance**. Do not upgrade the legacy instance. After deployment, set the new address in both Vercel variables:

```text
GENLAYER_OMNIMARKET_CONTRACT_ADDRESS=0xYOUR_NEW_BRADBURY_ADDRESS
NEXT_PUBLIC_OMNIMARKET_CONTRACT_ADDRESS=0xYOUR_NEW_BRADBURY_ADDRESS
```

The two values must match exactly. Leaving either value empty or pointing to the old instance is treated as a configuration error.

## Contract Files

- `contracts/omnimarket.py`: canonical Intelligent Contract source.
- `studio_bradbury/omnimarket.py`: byte-for-byte Studio copy.
- `app/api/omnimarket/route.ts`: server-side accepted-state read bridge.
- `app/page.tsx`: browser wallet, market console, portfolio, and lifecycle UI.
- `scripts/resolve-markets.sh`: optional permissionless settlement keeper for scheduled operations.

## Core Lifecycle

1. `create_market` is payable and requires `msg.value == seed_liquidity_units`. The even seed is split between the two outcomes and five unique evidence sources are stored.
2. `buy_position` is payable and requires `msg.value == stake_units`. The fee is recorded and the net amount is added to the selected pool.
3. `get_price_bps` exposes the current pool-derived probability.
4. `lock_market` is permissionless after `close_time`.
5. `resolve_market` runs after the 120-second safety delay, fetches all five sources, and reaches a validator-agreed normalized result.
6. If no accepted result is available after the settlement timeout, anyone can call `void_locked_market` so funds remain recoverable.
7. `claim_winnings` sends the caller's native GEN payout after finalization.
8. `claim_void_seed` returns the creator's seed when resolution is void.
9. `withdraw_protocol_fees` is an owner-only treasury operation; it cannot withdraw more than accrued fees.

## Run Locally

```bash
npm install
npm run dev
```

Use `.env.example` as the starting point. Do not commit real environment files or private keys.

## Checks

```bash
npm run lint
npm test
PYTHONPYCACHEPREFIX=/private/tmp/omni-pycache python3 -m py_compile contracts/omnimarket.py studio_bradbury/omnimarket.py
npm run build
```

The build requires dependencies to be installed first. The repository intentionally does not provide a wallet or signing secret to the server.

## Documentation

- [Contract API](API_MANIFEST.md)
- [Bradbury deployment](DEPLOYMENT_BRADBURY.md)
- [Vercel deployment](VERCEL_DEPLOYMENT.md)
- [Settlement keeper operations](OPERATIONS_KEEPER.md)
- [Public release checklist](RELEASE_CHECKLIST.md)
- [Studio test plan](STUDIO_BRADBURY_TEST_PLAN.md)
- [Testing guide](docs/testing.md)
- [Architecture](docs/architecture.md)
- [Submission brief](SUBMISSION_BRIEF.md)

## Official GenLayer References

- [Intelligent Contract features](https://docs.genlayer.com/developers/intelligent-contracts/features)
- [Value transfers](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers)
- [Web access](https://docs.genlayer.com/developers/intelligent-contracts/features/web-access)
- [Testing](https://docs.genlayer.com/developers/intelligent-contracts/testing)
- [GenLayerJS](https://docs.genlayer.com/api-references/genlayer-js)
- [Upgradability and storage compatibility](https://docs.genlayer.com/developers/intelligent-contracts/features/upgradability)
