# Security

## Trust boundaries

- The deployed Intelligent Contract is the source of truth for market state, prices, native GEN accounting, evidence receipts, settlement, and claims.
- The Vercel API is a read-only bridge. It does not hold private keys, sign for users, or move funds.
- The browser wallet signs every payable and lifecycle write. Users must inspect the destination, value, method, and receipt in their wallet.
- External reference charts are contextual data only. They never settle an OmniMarket market.

## Known contract boundaries

The current contract is a two-outcome, pool-backed primitive. It has no sell/exit method, LP share accounting, dispute/appeal workflow, immutable content commitment, or emergency pause. These are tracked as explicit gaps in `PRODUCTION_READINESS.md` and must not be implied by the UI.

## Operational rules

1. Never put a private key, seed phrase, or signing secret in Vercel, the repository, an example, or a browser bundle.
2. Keep the server and public contract-address variables equal and point them to the same final Bradbury deployment.
3. Treat a receipt as successful only after both the transaction status and execution result are checked.
4. Verify the network fingerprint, not only the EVM chain ID; Bradbury and other GenLayer networks may share an EVM chain ID.
5. Do not use the legacy address recorded in historical validation notes with the current storage layout.
6. Keep the public read bridge rate-limited and bounded. The app's in-memory limiter is only a per-instance baseline; configure and test a shared edge rate limit before any non-testnet public release. Do not add unauthenticated write proxying.

## Reporting

Do not publish sensitive wallet data or private keys in an issue. For a suspected contract, deployment, wallet-flow, or data-integrity vulnerability, stop the affected release, preserve transaction hashes and timestamps, and contact the project owner privately before public disclosure.
