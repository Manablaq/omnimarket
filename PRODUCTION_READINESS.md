# OmniMarket Production Readiness Matrix

This is the release gate for a public prediction-market product. A code check is not the same thing as a deployed-chain proof. Statuses are intentionally explicit:

- **Implemented**: enforced by the current repository and covered by a local check or documented source invariant.
- **Evidence required**: the implementation exists, but the final Bradbury deployment or public deployment still needs fresh proof.
- **Candidate implemented**: present in the separate V3 source, but not available in
  the current V2 deployment and blocked on the V3 deployment and evidence gates.
- **Gap**: the current contract does not provide this capability. It must not be advertised as available.
- **External gate**: it requires operational, security, legal, or user-acceptance work outside this repository.

## 54 gates

| # | Gate | Status | Proof or remaining action |
|---:|---|---|---|
| 1 | Final Bradbury contract identity | Evidence required | Deploy the current byte-identical source pair and record the address. |
| 2 | Deployment transaction and revision record | Evidence required | Add the final deployment transaction and source revision to `TEST_LOG_BRADBURY.md`. |
| 3 | Canonical/Studio source parity | Implemented | CI compares `contracts/omnimarket.py` and `studio_bradbury/omnimarket.py`. |
| 4 | Storage-compatible upgrade policy | Implemented | Release docs require a new instance when storage or payable behavior changes. |
| 5 | Server contract-address configuration | Implemented | Health endpoint validates the server address format. |
| 6 | Browser/server address parity | Implemented | Health endpoint checks the public and server addresses match. |
| 7 | Bradbury chain configuration | Implemented | SDK client and health endpoint require Bradbury configuration. |
| 8 | Live RPC availability | Evidence required | Run the public health check plus a live market read against the final deployment. |
| 9 | Native GEN creation funding | Implemented | `create_market` is payable and the browser attaches exact seed value. |
| 10 | Native GEN trading funding | Implemented | `buy_position` is payable and the browser attaches exact stake value. |
| 11 | Minimum and maximum stake bounds | Implemented | Contract enforces the documented stake range and position cap. |
| 12 | Even minimum seed liquidity | Implemented | Contract enforces the documented minimum and even split. |
| 13 | Bounded market text and URI inputs | Implemented | Contract validates lengths, schemes, and non-empty required fields. |
| 14 | Five unique evidence sources | Implemented | Contract rejects duplicate source URIs and stores five sources. |
| 15 | Explicit market lifecycle | Implemented | Draft, open, locked, resolved, and void states are stored and checked. |
| 16 | Permissionless post-close lock | Implemented | Anyone may call `lock_market` after the stored close time. |
| 17 | Resolution safety delay | Implemented | Resolution is blocked until the documented 120-second delay. |
| 18 | Permissionless consensus resolution | Implemented | Anyone may call `resolve_market` after eligibility checks. |
| 19 | Void fallback for unresolved locks | Implemented | Anyone may call `void_locked_market` after the timeout. |
| 20 | Trader recovery on void | Implemented | Void positions are claimable through the documented claim path. |
| 21 | Creator seed recovery on void | Implemented | `claim_void_seed` is one-time and creator-only. |
| 22 | Winning-position payout | Implemented | `claim_winnings` transfers native GEN after finalization. |
| 23 | Protocol fee accounting | Implemented | Fees are tracked separately from outcome pools. |
| 24 | Owner fee withdrawal bound | Implemented | Withdrawal cannot exceed accrued available fees. |
| 25 | Price complement invariant | Implemented | Contract and API require outcome prices to sum to 10,000 bps. |
| 26 | Bounded price-observation history | Implemented | Contract caps observations and the API caps reads. |
| 27 | On-chain market discovery | Implemented | UI/API use the contract count and index, with no hard-coded market fallback. |
| 28 | Browser-signed wallet writes | Implemented | Server route is read-only; writes use the connected wallet client. |
| 29 | Receipt status and execution-result checks | Implemented | Browser waits for a finalized receipt and `FINISHED_WITH_RETURN` before reporting success or clearing a form. |
| 30 | Wallet network fingerprint | Implemented | Same-chain-ID network ambiguity is checked against the configured RPC. |
| 31 | Wallet controls | Implemented | Connect, disconnect session, copy, switch, and revoke controls exist. |
| 32 | Loading, retry, and public error recovery | Implemented | App shell, read states, retry actions, and bounded browser requests exist. |
| 33 | Source-observation audit | Implemented | Source receipts, votes, confidence, status, and reason are readable. |
| 34 | Declared evidence links | Implemented | Stored source URIs are exposed and rendered as links. |
| 35 | External reference-data boundary | Implemented | Binance data is labeled contextual and cannot settle a market. |
| 36 | Honest pool-total vocabulary | Implemented | UI/API call pool balances `poolTotalWei`, not cumulative volume. |
| 37 | Cumulative trade-volume accounting | Candidate implemented | V3 stores `gross_trade_volume_units`; deploy and verify it on a fresh V3 address. V2 stores only current pool totals. |
| 38 | Sell or exit positions before settlement | Candidate implemented | V3 provides collateral-backed `quote_sell` and `sell_outcome`; V2 has no position exit method. |
| 39 | LP deposit and withdrawal lifecycle | Candidate implemented | V3 provides LP shares, liquidity quotes, deposits, partial withdrawals, and solvency accounting; it still needs full Bradbury evidence. |
| 40 | More than two outcomes | Candidate implemented | V3 supports bounded two- and three-outcome vectors that sum to 10,000 bps; V2 is intentionally binary. |
| 41 | Dispute, appeal, or challenge workflow | Candidate implemented | V3 has a bonded, time-bounded challenge and consensus re-resolution path; it needs Studio lifecycle evidence. |
| 42 | Immutable content commitment | Candidate implemented | V3 validates and freezes its complete market definition with canonical digest coverage; deployment and independent review remain required. |
| 43 | Emergency pause or circuit breaker | Candidate implemented | V3 pauses only new risk while keeping settlement, voids, and claims permissionless; it needs Bradbury permission evidence. |
| 44 | API request-size and action validation | Implemented | Body size, JSON shape, action format, addresses, and IDs are bounded. |
| 45 | Server RPC read timeout | Implemented | Contract reads are bounded and return a generic public recovery error. |
| 46 | Public API rate limiting | Evidence required | Both public read routes apply bounded, best-effort per-instance limits. Before a non-testnet public launch, configure and test a shared Vercel Firewall or equivalent edge rate limit; in-memory state alone is not global serverless protection. |
| 47 | Baseline web security headers | Implemented | Next response headers include framing, MIME, referrer, and permissions controls. |
| 48 | Configuration health endpoint | Implemented | `/api/omnimarket/health` reports configuration parity without secrets. |
| 49 | Continuous integration | Implemented | CI runs lint, tests, Webpack build, audit, Python syntax, parity, and whitespace checks. |
| 50 | Dependency audit gate | Implemented | CI fails on high-severity npm audit findings. |
| 51 | Direct Mode contract tests | Evidence required | The documented Python 3.12 Direct Mode suite and CI job cover deterministic deployment and storage-boundary behavior; obtain a passing CI run and broaden it alongside future contract features. |
| 52 | Studio consensus integration evidence | Evidence required | Run the full lifecycle in Studio, retain its accepted-to-finalized lifecycle evidence, and only mark user actions complete after finalization. |
| 53 | Browser E2E with a real wallet | External gate | Test connect, network switch, native-value writes, receipts, claims, and recovery in a real browser wallet. |
| 54 | Monitoring, incident, legal, and release sign-off | External gate | Configure monitoring/alerts, rehearse incident response, complete legal review, and approve the final release checklist. |

## Release decision

The current V2 deployment is **public-testnet ready only**. V3 remains a release
candidate until gates 1, 2, 8, 37-43, 46, and 51-54 have V3-specific evidence
or an explicit project-owner acceptance. The repository must not describe V3
candidate features as deployed V2 features. See [security](SECURITY.md),
[incident response](INCIDENT_RESPONSE.md), and [release checklist](RELEASE_CHECKLIST.md).

Gates 37-43 are a single V3 protocol release, not seven independent UI changes. The
required economic architecture, state boundary, and release sequence are recorded
in [V3_PROTOCOL_DESIGN.md](V3_PROTOCOL_DESIGN.md).

## Verification model

The testing split follows GenLayer's documented model: Direct Mode is appropriate for fast deterministic unit and CI checks, while Studio Mode uses the network path and is appropriate for consensus and integration evidence. See the [official Intelligent Contract testing documentation](https://docs.genlayer.com/developers/intelligent-contracts/testing).
