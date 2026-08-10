# Bradbury Test Log

## Status

The historical entries below belong to the retired virtual-units contract and are **not evidence for the current native-GEN contract**. A new Bradbury instance must be deployed and this log must be replaced with fresh transaction data before public launch or submission.

## Retired Historical Instance

- Legacy address: `0x0E1201A1F5477e635306BC3E34e68658e4489fBd`
- Legacy deployment transaction: `0x4929c8b25c27d97e4029bd39a383a5c97a46fa6ddd3f5e5b2ed46bc6ef92f228`
- Legacy model: virtual numeric stake units
- Current model: native GEN wei and payable writes

The old results such as `10000`, `2482`, and `4470` must not be copied into the new evidence log. They demonstrate the earlier prototype only.

## Current Pre-hardening Validation Instance

- Address: `0xACa9dE0bdac38d88A4E50e5f9DD7EDe969BB0A23`
- Deployment transaction: `0x65d45e552a69c30fff3fa6638d3a02bf917e3da2a1bb851cf751ed85a086c5a6`
- Deployment timestamp: `1786350265`
- Scope: native-GEN deployment and initial market lifecycle validation before the current post-audit source hardening.
- Release status: not final. A new deployment and fresh lifecycle evidence are required after the current source revision.

This entry is retained for provenance only. It must not be used as the production contract address in Vercel, the public submission, or the final evidence claim.

## Fresh Evidence Template

Fill this table from GenLayer Studio/Bradbury after the new deployment. Do not mark a row complete from a UI screenshot alone; include the transaction hash or exact accepted read response.

| Step | Method | Required evidence | Result |
| --- | --- | --- | --- |
| 1 | Deploy | New address and accepted deployment transaction | pending |
| 2 | `get_market_count` | `0` on the new instance | pending |
| 3 | `create_market` | Accepted transaction with five unique sources, `value == seed_liquidity_units`, and returned id | pending |
| 4 | `get_market(1)` | Open state and two seeded wei totals | pending |
| 5 | `get_market_id_at(1)` | Returns `1` | pending |
| 6 | `get_price_observation_count(1)` | At least `1` | pending |
| 7 | `buy_position(1, 0, stake)` | Accepted transaction with matching attached value | pending |
| 8 | `get_price_bps` | Outcome 0 rises and outcome 1 falls | pending |
| 9 | `get_price_observation(1, latest)` | Totals and both prices reflect the trade | pending |
| 10 | `get_position_by_account` | Net stake reflects the 75 bps fee | pending |
| 11 | `lock_market(1)` | Accepted after close and status `2` | pending |
| 12 | `resolve_market(1)` | Accepted/undetermined five-source consensus transaction after the safety delay | pending |
| 13 | `get_market(1)` | Resolved or void state with resolution metadata | pending |
| 14 | `get_source_observation` | Five source receipts expose URI, status, vote, digest, reason, and timestamp | pending |
| 15 | `claim_winnings(1)` | Accepted Bradbury native transfer | pending |
| 16 | Wallet balance | Native GEN balance delta matches payout minus network costs | pending |
| 17 | Position read | `claimed: true`; second claim rejected | pending |
| 18 | `preview_void_seed` | Void-market creator seed is refundable | pending |
| 19 | `claim_void_seed` | Accepted creator seed refund; second claim rejected | pending |
| 20 | `get_protocol_fee_state` | Accrued, withdrawn, and available values are coherent | pending |
| 21 | `withdraw_protocol_fees` | Owner-only native fee transfer within accrued limit | pending |

## Test Variables

Use a newly funded test wallet and record it only if appropriate for public evidence:

```text
seed_liquidity_units: 2000000000000000000
attached value:       2000000000000000000
stake_units:          1000000000000000000
attached value:       1000000000000000000
```

These values are `2 GEN` and `1 GEN`, respectively. Native transfer verification must be performed on Bradbury; a Studio returned number is not sufficient proof of an EVM-layer balance change.
