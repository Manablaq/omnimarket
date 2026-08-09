# API Manifest

## Contract

`OmniMarket`

## Write Methods

### `create_market(title, outcome_0, outcome_1, rules, evidence_uri, close_time, seed_liquidity_units) -> u256`

Creates a two-outcome market and returns `market_id`.

- `title`: human-readable question.
- `outcome_0`: first outcome label.
- `outcome_1`: second outcome label.
- `rules`: strict resolution criteria.
- `evidence_uri`: web source used by `resolve_market`.
- `close_time`: Unix timestamp in seconds.
- `seed_liquidity_units`: virtual starting liquidity. If `0`, the contract seeds `1000`.

### `buy_position(market_id, outcome_index, stake_units)`

Adds virtual stake units to an outcome pool and records the caller's position.

- `outcome_index`: `0` or `1`.
- `stake_units`: positive integer.

### `lock_market(market_id)`

Locks an open market after `close_time`.

### `resolve_market(market_id)`

Runs the GenLayer web/AI resolver after market close. The nondeterministic block fetches `evidence_uri`, applies the stored rules, returns normalized JSON, and stores the validator-agreed result.

### `admin_resolve_for_studio(market_id, winning_outcome, confidence, reason_code, summary)`

Studio-safe deterministic resolver for smoke tests. Only the market creator or contract owner can call it.

### `claim_winnings(market_id) -> u256`

Marks the caller's position as claimed and returns the virtual payout units.

## Read Methods

### `get_market(market_id) -> Market`

Returns the market record.

### `get_position(market_id, account) -> Position`

Returns an account's position.

### `get_position_by_account(market_id, account) -> Position`

Returns an account's position using a plain string address. This is the recommended Studio/frontend read path when an Address form field cannot resolve contract state.

### `get_price_bps(market_id, outcome_index) -> u32`

Returns outcome probability in basis points. `6200` means `62.00%`.

### `preview_payout(market_id, account) -> u256`

Returns the current payout estimate for an account without claiming.

### `preview_payout_by_account(market_id, account) -> u256`

Returns the current payout estimate using a plain string address.

## Storage Types

### `Market`

Stores creator, question, outcomes, rules, evidence URI, close timestamp, status, pool totals, fees, winning outcome, confidence, reason code, summary, and resolution timestamp.

### `Position`

Stores owner, market id, outcome stakes, and claim status.
