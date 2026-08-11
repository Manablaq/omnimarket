# OmniMarket V3 API Manifest

## Release Boundary

This manifest applies only to `contracts/omnimarket_v3.py` and a future fresh
Bradbury deployment. It does not describe the V2 address or its frontend API.
Until a V3 address, source revision, Studio evidence, direct-mode evidence, and
independent review are published, V3 is a release candidate and not a public
financial product.

All amounts are unsigned wei-sized integer units. `1 GEN = 10^18` units. Every
payable call verifies that `gl.message.value` exactly equals its stated amount.
The V3 HTTP bridge is read-only; wallet writes are signed by the user's browser
wallet and must be observed as finalized before the UI reports success.

## Lifecycle

`OPEN (1)` -> `LOCKED (2)` -> `PROVISIONAL (3)` -> `CHALLENGED (4)` ->
`RESOLVED (5)` or `VOID (6)`.

- Anyone can lock after the stored close time.
- Anyone can request consensus settlement 120 seconds after lock.
- A provisional outcome has a one-hour challenge window.
- Anyone can finalize when that window ends.
- A challenged market is re-evaluated by GenLayer consensus, not an operator.
- Inconclusive consensus or the 24-hour timeout path is refund-safe: the market
  becomes void and users recover their defined claims.

## Payable Writes

### `create_market(...) -> u256`

The full signature is:

```text
create_market(
  title, outcome_count, outcome_0, outcome_1, outcome_2, rules,
  source_0_uri, source_1_uri, source_2_uri, source_3_uri, source_4_uri,
  close_time, seed_liquidity_units
)
```

Creates a two- or three-outcome market with five distinct HTTPS evidence
sources. Creation attaches exactly `seed_liquidity_units`; the bounded minimum
is 2 GEN and the close time must be at least 30 minutes ahead. The complete
validated market definition is stored in the immutable V3 market record.

### `buy_outcome(market_id, outcome_index, collateral_in, min_outcome_units) -> u256`

Attaches exactly `collateral_in` native GEN and buys collateral-backed
conditional claim units. The caller sets `min_outcome_units` as slippage
protection. The method is unavailable while risk is paused.

### `sell_outcome(market_id, outcome_index, outcome_units, min_collateral_out) -> u256`

Sells already-owned conditional claim units. The contract burns only complete
claim sets allowed by the fixed-product invariant and transfers native GEN less
the published 75 bps fee. `min_collateral_out` is mandatory slippage protection.

### `add_liquidity(market_id, collateral_in, min_lp_shares) -> u256`

Attaches exactly `collateral_in`, mints a defined pro-rata LP share position,
and records the account in the market's on-chain discovery index.

### `challenge_market(market_id, reason, bond_units)`

Attaches exactly the bounded challenge bond during the stored challenge window.
A changed second consensus outcome refunds the bond. An unchanged outcome accrues
the bond to protocol fees. A timeout-to-void refunds an outstanding bond first.

## Nonpayable Writes

- `remove_liquidity(market_id, lp_shares, min_claim_units_each)`: exchanges LP
  shares for equal conditional claim units while a market is open. It never
  releases backing collateral directly.
- `lock_market(market_id)`: permissionless after close.
- `resolve_market(market_id)`: permissionless consensus settlement after lock.
- `finalize_market(market_id)`: permissionless after the challenge window.
- `resolve_challenge(market_id)`: permissionless fresh consensus settlement.
- `void_market(market_id)`: permissionless timeout recovery.
- `claim_winnings(market_id)`, `claim_lp_settlement(market_id)`,
  `claim_void_position(market_id)`, and `claim_void_lp(market_id)`: user claims.
- `pause_risk()` and `unpause_risk()`: owner-only controls that stop creation,
  trading, and liquidity changes, but never settlement or claims.
- `withdraw_protocol_fees(recipient, amount)`: owner-only withdrawal of
  separately accounted, unwithdrawn fees.

## Read Methods

| Method | Purpose |
| --- | --- |
| `get_market_count`, `get_market_id_at` | One-based global market discovery. |
| `get_account_market_count`, `get_account_market_id_at` | One-based, deduplicated on-chain portfolio discovery. |
| `get_market` | Complete V3 lifecycle, reserve, LP, fee, and settlement record. |
| `get_position_by_account` | Per-outcome conditional claims and claim status. |
| `get_lp_position_by_account` | LP shares and settlement-claim status. |
| `quote_buy`, `quote_sell` | Integer trade quote outputs for wallet slippage limits. |
| `quote_add_liquidity` | Exact integer LP-share quote using the same largest-reserve arithmetic as `add_liquidity`. |
| `quote_remove_liquidity_outcome` | Exact integer conditional-claim output for one outcome in an LP withdrawal. The client queries every active outcome and protects the lowest quoted claim. |
| `get_price_bps` | Per-outcome probability vector; active outcomes sum exactly to 10,000 bps. |
| `get_price_observation_count`, `get_price_observation` | Bounded on-chain chart history. |
| `get_source_observation_count`, `get_source_observation` | Consensus evidence receipts for each round. |
| `get_challenge` | Current bounded challenge record. |
| `get_protocol_state` | Fees, claim liability, challenge bonds, and pause state. |

## V3 Read Bridge

`POST /api/omnimarket/v3` accepts `markets`, `snapshot`, `history`, `sources`,
`portfolio`, `protocol`, `quote_buy`, `quote_sell`, `quote_add_liquidity`, and
`quote_remove_liquidity`. It reads only:

```text
GENLAYER_OMNIMARKET_V3_CONTRACT_ADDRESS
GENLAYER_RPC_URL
GENLAYER_CHAIN_ID=bradbury
```

The route validates V3 field order and types, limits response size and
concurrency, applies request timeouts and a bounded in-memory rate limit, and
rejects price vectors that do not sum to exactly 10,000 bps. It never calls
`writeContract` and cannot sign for a user. Quote actions validate the market,
outcome, and bounded amount before making the matching read-only contract call.
Browser wallet transactions carry the returned quote less the published 1%
slippage limit; the bridge never constructs or relays a signed write.

`GET /api/omnimarket/v3/health` reports only release configuration parity: V3
server/browser address validity and match, Bradbury chain selection, and whether
an RPC URL is configured. It does not reveal the RPC URL, call the contract, or
sign a transaction.
