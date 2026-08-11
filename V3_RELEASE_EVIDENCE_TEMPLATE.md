# OmniMarket V3 Release Evidence Template

> Status: template only. Do not mark a V3 release ready until each applicable
> field links to evidence from the exact V3 address and source revision.

This template is deliberately separate from the historical V2 evidence template.
V3 has a different storage schema, collateral model, lifecycle, and public API.
It must be deployed to a **new Bradbury address**; it is never a V2 upgrade.

## Release Identity

| Field | Value |
| --- | --- |
| Release date (UTC) | `YYYY-MM-DD` |
| Source commit | `COMMIT_SHA` |
| Canonical source | `contracts/omnimarket_v3.py` |
| Studio source | `studio_bradbury/omnimarket_v3.py` |
| Source parity command | `cmp -s contracts/omnimarket_v3.py studio_bradbury/omnimarket_v3.py` |
| Network | `GenLayer Bradbury testnet` |
| V3 contract address | `0x...` |
| Deployment transaction | `0x...` |
| Public V3 URL | `https://.../v3` |
| Vercel deployment URL | `https://...` |

## Preconditions

| Gate | Result or retained artifact |
| --- | --- |
| Node 22 lint, tests, build, and audit | `URL_OR_ARTIFACT` |
| V3 Python syntax compilation | `URL_OR_ARTIFACT` |
| V3 canonical/Studio source parity | `URL_OR_ARTIFACT` |
| Python 3.12 Direct Mode suite and `genvm-lint` | `URL_OR_ARTIFACT` |
| Independent economics/security review | `REVIEW_LINK_OR_BLOCKED` |
| Shared production rate limit and monitoring configuration | `CONFIGURATION_ARTIFACT_OR_BLOCKED` |

## Contract Configuration

Record values and read responses only. Never commit private keys, wallet seed
phrases, API tokens, or server secrets.

| Check | Result or retained artifact |
| --- | --- |
| `GENLAYER_OMNIMARKET_V3_CONTRACT_ADDRESS` and browser V3 address match | `TRUE_OR_FALSE_WITH_ARTIFACT` |
| `GENLAYER_RPC_URL` serves Bradbury reads | `URL_OR_ARTIFACT` |
| `GENLAYER_CHAIN_ID=bradbury` | `TRUE_OR_FALSE_WITH_ARTIFACT` |
| `GET /api/omnimarket/v3/health` reports `configured` and address parity | `URL_OR_ARTIFACT` |
| `POST /api/omnimarket/v3` with `action: markets` returns `ok: true` | `URL_OR_ARTIFACT` |
| `scripts/release-smoke-v3.sh` validates the deployed V3 bridge | `URL_OR_ARTIFACT` |
| V3 route cannot sign or submit a write | `CODE_REVIEW_OR_TEST_ARTIFACT` |

## Bradbury Lifecycle Evidence

Every write must carry the exact native GEN value required by the V3 payable
method and must be recorded only after its final Bradbury result. For every
positive case, retain at least one negative case showing the corresponding bound
or lifecycle guard rejects invalid input.

| Scenario | Required methods or reads | Transaction / result | Final status |
| --- | --- | --- | --- |
| Fresh deployment | `get_market_count`, `get_protocol_state` | `RESULT_LINK` | `FINALIZED` |
| Two-outcome creation | `create_market`, 5 unique HTTPS sources, exact 2+ GEN seed | `0x...` | `FINALIZED` |
| Three-outcome creation | `create_market`, distinct 3 outcomes, 5 unique HTTPS sources | `0x...` | `FINALIZED` |
| Discovery and account index | `get_market_id_at`, `get_market`, `get_account_market_id_at` | `RESULT_LINK` | `FINALIZED` |
| Price vector and history | every active `get_price_bps`, `get_price_observation` | `RESULT_LINK` | `FINALIZED` |
| Buy quote and write | `quote_buy`, `buy_outcome` with 1% client minimum | `0x...` | `FINALIZED` |
| Sell quote and write | `quote_sell`, `sell_outcome` with 1% client minimum | `0x...` | `FINALIZED` |
| LP quote and deposit | `quote_add_liquidity`, `add_liquidity` | `0x...` | `FINALIZED` |
| Partial LP withdrawal | `quote_remove_liquidity_outcome`, `remove_liquidity` | `0x...` | `FINALIZED` |
| Backing-cap rejection | create/deposit above 100 GEN cap | `RESULT_LINK` | `FINALIZED` |
| Pause permissions | pause blocks create/buy/sell/LP only; claims and settlement remain callable | `RESULT_LINK` | `FINALIZED` |
| Lock after close | `lock_market` before and after close | `RESULT_LINK` | `FINALIZED` |
| Consensus resolution | `resolve_market`, 5 source observations | `0x...` | `FINALIZED` |
| Provisional finalization | `finalize_market` before and after challenge deadline | `RESULT_LINK` | `FINALIZED` |
| Bonded challenge | `challenge_market`, `resolve_challenge` | `0x...` | `FINALIZED` |
| Timeout void | `void_market`, including unresolved challenge bond return | `RESULT_LINK` | `FINALIZED` |
| Winning claims | `claim_winnings`, `claim_lp_settlement` | `RESULT_LINK` | `FINALIZED` |
| Void claims | `claim_void_position`, `claim_void_lp` | `RESULT_LINK` | `FINALIZED` |
| Protocol fees | `get_protocol_state`, authorized fee withdrawal | `RESULT_LINK` | `FINALIZED` |

## Browser And Wallet Evidence

| Scenario | Result or artifact |
| --- | --- |
| Wallet absent has a recoverable prompt | `PASS_OR_ISSUE` |
| Bradbury wallet connection and chain switch | `PASS_OR_ISSUE` |
| User rejects a wallet signature | `PASS_OR_ISSUE` |
| Pending state is visible; no form clears early | `PASS_OR_ISSUE` |
| Finalized success clears the relevant form and refreshes contract data | `PASS_OR_ISSUE` |
| Failed execution preserves user input and shows an actionable recovery state | `PASS_OR_ISSUE` |
| Account change, chain change, address copy, and local disconnect | `PASS_OR_ISSUE` |
| Refresh preserves the public read experience without displaying stale data as live | `PASS_OR_ISSUE` |

## Sign-Off

| Role | Name | Date (UTC) | Evidence reviewed |
| --- | --- | --- | --- |
| Release operator | `NAME` | `YYYY-MM-DD` | `YES_OR_NO` |
| Independent reviewer | `NAME` | `YYYY-MM-DD` | `YES_OR_NO` |

V3 is a Bradbury testnet release until every applicable gate has evidence and a
separate legal, operational, and security approval authorizes any real-value use.
