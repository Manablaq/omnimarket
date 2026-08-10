# Studio and Bradbury Test Plan

The current legacy deployment and its old numeric results are historical evidence only. Use a new contract instance for this sequence.

## Contract Setup

Deploy `studio_bradbury/omnimarket.py` as a new instance on Bradbury. Copy the new address into both Vercel environment variables.

## Discovery and Creation

1. Call `get_market_count`. A new instance returns `0`.
2. Call `create_market` with:

```text
title: Will genlayerlabs/genlayer-project-boilerplate exist on GitHub?
outcome_0: Yes
outcome_1: No
rules: Outcome 0 wins only if the evidence clearly identifies an existing GitHub repository at genlayerlabs/genlayer-project-boilerplate. Outcome 1 wins if the repository is missing. Return inconclusive if the source cannot be fetched or is ambiguous.
source_0_uri: https://api.github.com/repos/genlayerlabs/genlayer-project-boilerplate
source_1_uri: https://github.com/genlayerlabs/genlayer-project-boilerplate
source_2_uri: https://raw.githubusercontent.com/genlayerlabs/genlayer-project-boilerplate/main/README.md
source_3_uri: https://api.github.com/repos/genlayerlabs/genlayer-project-boilerplate/contents
source_4_uri: https://github.com/genlayerlabs/genlayer-project-boilerplate/blob/main/README.md
close_time: 1790000000
seed_liquidity_units: 2000000000000000000
attached value: 2000000000000000000
```

This is `2 GEN` total and `1 GEN` per outcome. Expected return: market id `1`, transaction `ACCEPTED`.

3. Call `get_market(1)`. Confirm `status: 1`, `total_0: 1000000000000000000`, `total_1: 1000000000000000000`.
4. Call `get_market_id_at(1)`. Confirm `1`.
5. Call `get_price_observation_count(1)`. Confirm at least `1`.

## Trading and Chart History

6. Call `buy_position(1, 0, 1000000000000000000)` with attached value `1000000000000000000`.
7. Confirm `get_price_bps(1, 0)` is above `5000` and outcome 1 is below `5000`.
8. Call `get_position_by_account(1, your_wallet_address)` and confirm the net stake is lower than the gross stake by the 75 bps fee.
9. Call `get_price_observation_count(1)` again and read the latest observation. Confirm both totals and both prices reflect the trade.

## Lifecycle

10. After the close time, call `lock_market(1)` and confirm `status: 2`.
11. Wait at least 120 seconds after close, then call `resolve_market(1)`. Record the accepted/undetermined result and inspect the final state.
12. Read `get_source_observation_count(1)` and indexes `1..5`. Confirm each source receipt contains the declared URI, status, vote, digest, reason, and timestamp.

If resolution remains undetermined, the production-safe fallback is `void_locked_market(1)` after `close_time + 120 + 86400`. Confirm the market becomes `status: 4` and that trader and creator refund paths remain available.

## Payout

13. Call `preview_payout_by_account(1, your_wallet_address)`.
14. On a funded Bradbury deployment, call `claim_winnings(1)` and verify the native GEN balance changes. A Studio result or returned number alone does not prove an EVM-layer transfer.
15. Read the position again and confirm `claimed: true`. A second claim must fail.

## Treasury and Void Paths

16. After a separate market resolves as void, call `preview_void_seed` as the creator and confirm it equals the original seed.
17. Call `claim_void_seed` from the creator and verify the native GEN transfer on Bradbury. A second call must fail.
18. Call `get_protocol_fee_state` and confirm accrued, withdrawn, and available values are coherent.
19. Call `withdraw_protocol_fees` only from the owner with an amount no greater than available fees. Verify the native GEN transfer and that the available amount decreases.

## Negative Tests

- Create with odd seed liquidity: must fail.
- Create with attached value different from seed: must fail.
- Buy with attached value different from stake: must fail.
- Use equal outcome labels: must fail.
- Lock before close: must fail.
- Resolve before lock: must fail.
- Resolve an open market: must fail.
- Claim a losing or already claimed position: must fail.
- Resolve before the 120-second safety delay: must fail.
- Claim a void seed from a non-creator: must fail.
- Withdraw more fees than accrued or withdraw as a non-owner: must fail.
