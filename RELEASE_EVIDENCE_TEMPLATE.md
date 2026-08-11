# OmniMarket Release Evidence Template

> Status: template only. This file is not evidence until every applicable field is replaced with a verifiable value from the exact release being published.

Use one completed copy of this template for every public Bradbury testnet release. Keep links and transaction hashes in the repository so an independent reviewer can connect the contract, Vercel deployment, source revision, and lifecycle results without relying on screenshots alone.

## Release identity

| Field | Value |
| --- | --- |
| Release date (UTC) | `YYYY-MM-DD` |
| Git commit | `COMMIT_SHA` |
| Public application URL | `https://...` |
| Vercel deployment URL | `https://...` |
| Network | `GenLayer Bradbury testnet` |
| Chain setting | `bradbury` |
| Contract address | `0x...` |
| Contract deployment transaction | `0x...` |
| Studio source filename | `studio_bradbury/omnimarket.py` |
| Canonical source filename | `contracts/omnimarket.py` |

## Configuration parity

Record the JSON responses or a permanent text artifact for each probe. Do not include environment-variable values other than the public contract address.

| Check | Result or link |
| --- | --- |
| `/api/omnimarket/health` reports `configured` | `URL_OR_ARTIFACT` |
| Server and browser contract addresses match | `TRUE_OR_FALSE_WITH_ARTIFACT` |
| Market discovery API returns `ok: true` | `URL_OR_ARTIFACT` |
| `OMNIMARKET_PUBLIC_URL=... bash scripts/release-smoke.sh` | `CI_LOG_OR_ARTIFACT` |

## Bradbury lifecycle evidence

Every transaction must target the contract address in the release-identity table. Record its final state and link to GenLayer Explorer or retain the full accepted/finalized result in `TEST_LOG_BRADBURY.md`.

| Lifecycle check | Method or read | Transaction / result | Final status |
| --- | --- | --- | --- |
| Deployment | deploy | `0x...` | `FINALIZED` |
| Empty registry | `get_market_count` | `0` | `FINALIZED` |
| Create market | `create_market` with exact native GEN value | `0x...` | `FINALIZED` |
| Indexed discovery | `get_market_id_at`, `get_market` | `RESULT_LINK` | `FINALIZED` |
| Initial odds | `get_price_bps(1, 0/1)` | `RESULT_LINK` | `FINALIZED` |
| First trade | `buy_position` | `0x...` | `FINALIZED` |
| Second trade | `buy_position` on the other outcome | `0x...` | `FINALIZED` |
| Observation history | `get_price_observation_count`, `get_price_observation` | `RESULT_LINK` | `FINALIZED` |
| Position record | `get_position_by_account` | `RESULT_LINK` | `FINALIZED` |
| Close transition | `lock_market` | `0x...` | `FINALIZED` |
| Settlement | `resolve_market` or documented void path | `0x...` | `FINALIZED` |
| Source receipts | `get_source_observation` | `RESULT_LINK` | `FINALIZED` |
| Funds recovery | `claim_winnings`, `claim_void_seed`, or refund path | `0x...` | `FINALIZED` |
| Fee accounting | `get_protocol_fee_state` and authorized withdrawal test, if applicable | `RESULT_LINK` | `FINALIZED` |

## Browser and wallet evidence

| Scenario | Result or artifact |
| --- | --- |
| Wallet absent | `PASS_OR_ISSUE` |
| Supported Bradbury wallet connects | `PASS_OR_ISSUE` |
| Unsupported network is rejected | `PASS_OR_ISSUE` |
| Signature rejection leaves forms intact and displays an actionable message | `PASS_OR_ISSUE` |
| Pending transaction state is visible | `PASS_OR_ISSUE` |
| Success is shown only after `FINALIZED` and `FINISHED_WITH_RETURN` | `PASS_OR_ISSUE` |
| Create form clears only after finalized success | `PASS_OR_ISSUE` |
| Position form clears only after finalized success | `PASS_OR_ISSUE` |
| Account change, chain change, local disconnect, and address copy behave correctly | `PASS_OR_ISSUE` |

## Automated checks

| Check | Run URL or retained output |
| --- | --- |
| Node 22 CI: lint, tests, build, audit | `URL_OR_ARTIFACT` |
| Python syntax and canonical/Studio parity | `URL_OR_ARTIFACT` |
| Python 3.12 Direct Mode suite | `URL_OR_ARTIFACT` |
| Public release smoke script | `URL_OR_ARTIFACT` |

## Scope declaration

This evidence package applies to the V2 **Bradbury testnet** primitive only. It does not establish production readiness for real-value financial use. The unimplemented V3 requirements, including liquidity-provider accounting, exits, multi-outcome logic, challenge handling, pause controls, and a cryptographic market-content commitment, remain in [V3_PROTOCOL_DESIGN.md](V3_PROTOCOL_DESIGN.md) and [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Sign-off

| Role | Name | Date (UTC) | Evidence reviewed |
| --- | --- | --- | --- |
| Release operator | `NAME` | `YYYY-MM-DD` | `YES_OR_NO` |
| Independent reviewer | `NAME` | `YYYY-MM-DD` | `YES_OR_NO` |

Never put wallet seed phrases, private keys, API secrets, or unredacted personal data in this file.
