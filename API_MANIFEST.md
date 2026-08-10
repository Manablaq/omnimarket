# OmniMarket API Manifest

All amounts are `u256` wei. `1 GEN = 10^18 wei`. Payable methods require the transaction value to equal the amount in calldata.

## Write Methods

### `create_market(title, outcome_0, outcome_1, rules, source_0_uri, source_1_uri, source_2_uri, source_3_uri, source_4_uri, close_time, seed_liquidity_units) -> u256`

Creates and indexes a market. The caller must attach exactly `seed_liquidity_units` native GEN, which must be at least 2 GEN and even. Half is assigned to each outcome pool. Five unique HTTP(S) evidence sources are stored with the market.

Validation includes non-empty bounded text, distinct outcomes, a close time at least 30 minutes ahead, a maximum ten-year lifetime, and five unique source URIs. Market creation is public.

### `buy_position(market_id, outcome_index, stake_units)`

Attaches exactly `stake_units` native GEN, charges the 75 bps protocol fee into market accounting, and records the net position. `outcome_index` is `0` or `1`.

### `lock_market(market_id)`

Permissionless transition from open to locked after the stored close time.

### `resolve_market(market_id)`

Permissionless GenLayer resolution after locking and a 120-second safety delay. Five declared sources are independently fetched and evaluated. A three-source quorum is required for an outcome; unavailable, ambiguous, or contradictory evidence finalizes the market as void/refundable. The validator reruns the source evaluation independently before storage writes.

### `void_locked_market(market_id)`

Permissionlessly marks a locked market void after the 120-second safety delay plus the 24-hour settlement timeout. This fallback is available when repeated consensus attempts remain undetermined, and makes trader positions and creator seed recoverable.

### `claim_winnings(market_id) -> u256`

Pays the caller's finalized position in native GEN using the documented EVM recipient interface. The contract checks balance before marking the position claimed.

### `claim_void_seed(market_id) -> u256`

Refunds the original market creator's seed after a market is void. Trader positions are claimed separately through `claim_winnings`; the creator can claim the seed once.

### `withdraw_protocol_fees(recipient, amount) -> u256`

Owner-only withdrawal of accrued 75 bps fees. The amount cannot exceed the contract's unwithdrawn fee accounting, and the transfer uses the documented native-GEN recipient interface.

## Read Methods

### `get_market(market_id) -> Market`

Returns the complete market state.

### `get_market_count() -> u256`

Returns the number of created markets.

### `get_protocol_fee_state() -> FeeState`

Returns accrued, withdrawn, and currently available protocol fees.

### `get_market_id_at(index) -> u256`

Returns the one-based market index entry. Use `1..get_market_count()` for discovery.

### `get_position(market_id, account) -> Position`

Returns a position using an `Address` account.

### `get_position_by_account(market_id, account) -> Position`

Returns a position using a string address, which is convenient for Studio and the frontend bridge.

### `get_account_market_count(account) -> u256`

Returns the number of markets in the account's on-chain position index.

### `get_account_market_id_at(account, index) -> u256`

Returns a one-based account position index entry.

### `get_price_bps(market_id, outcome_index) -> u32`

Returns the pool-derived probability in basis points. `6200` means `62.00%`.

### `get_price_observation_count(market_id) -> u256`

Returns the number of contract-written price observations.

### `get_price_observation(market_id, index) -> PriceObservation`

Returns the one-based observation containing timestamp, both prices, and both pool totals.

### `preview_payout(market_id, account) -> u256`

Calculates a finalized or current payout estimate without claiming.

### `preview_payout_by_account(market_id, account) -> u256`

String-address variant used by the frontend bridge.

### `preview_void_seed(market_id) -> u256`

Returns the creator seed still refundable for a void market, or zero for an open, locked, or resolved market.

## Storage Types

`Market` stores creator, question, outcomes, rules, five evidence URIs, close timestamp, lifecycle status, native pool totals, fees, resolution result, confidence, reason code, summary, and resolution timestamp.

`Position` stores owner, market id, net outcome stakes, gross stake, and claim status. A wallet may hold only one outcome and no more than 10 GEN gross stake per market; each trade is at least 1 GEN.

`SourceObservation` stores the source URI, availability status, normalized vote, confidence, evidence digest, reason code, summary, and the settlement check timestamp. Resolution validators independently rerun the five sources and compare the normalized winning decision plus quorum validity. Volatile evidence digests and LLM confidence values are stored for audit but are not byte-for-byte equivalence requirements.

`PriceObservation` stores `observed_at`, both basis-point prices, and both pool totals. These observations are the source of the live chart.

`FeeState` stores aggregate accrued, withdrawn, and available protocol fee accounting.
