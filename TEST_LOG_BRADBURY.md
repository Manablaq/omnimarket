# Bradbury Test Log

Deployment recorded from GenLayer Studio on Bradbury.

## Deployment

- Network: Genlayer Bradbury Testnet
- Contract: `OmniMarket`
- Address: `0x0E1201A1F5477e635306BC3E34e68658e4489fBd`
- Deploy transaction: `0x4929c8b25c27d97e4029bd39a383a5c97a46fa6ddd3f5e5b2ed46bc6ef92f228`
- Status: `ACCEPTED`
- Previous validated deployment: `0x66F55539E8446551e987Dc8a31492162E100aD75`
- Previous deployment with first-buy bug: `0xcb5ceEdD54969247B17cD3ED9eFf87BE9ed1ddDE`

## Smoke Test

| Step | Method | Expected | Actual |
| --- | --- | --- | --- |
| 1 | `create_market` | returns `1` | `ACCEPTED`; `FINISHED_WITH_RETURN`; tx `0xb945812adc4bbe43ebf6baadbb1df5eda1ffe4646311a979aec52ea131de8150`; market id `1` |
| 2 | `get_market(1)` | status `1`, seeded pools | `status: 1`; `total_0: 10000`; `total_1: 10000`; `fee_units: 0`; `reason_code: unresolved` |
| 3 | `get_price_bps(1, 0)` | initial price `5000` | `5000` |
| 4 | `buy_position(1, 0, 2500)` | accepted | `ACCEPTED`; `FINISHED_WITH_RETURN`; tx `0x8d71ffbc173015f68d3436502fb6ff1e1a8a6abe94d0574d14e6e92c613945cc` |
| 5 | `get_price_bps(1, 0)` and `get_price_bps(1, 1)` | `5551` / `4448` after trade | `5551` / `4448`; chart source moved from contract state |
| 6 | `get_position_by_account(1, wallet_string)` | `stake_0: 2482`, `claimed: false` | `stake_0: 2482`; `stake_1: 0`; `claimed: false`; owner `0x5bb49021001200fe8156a81c7fcf097e535e7181` |
| 7 | `admin_resolve_for_studio` | accepted | `ACCEPTED`; `FINISHED_WITH_RETURN`; tx `0x1af681db294cdb7347835fdf6b7989c32e8fb752ba2bbda5c9a368a347fc547a` |
| 8 | `get_market(1)` | status `3`, winning outcome `1` | `status: 3`; `winning_outcome: 1`; `confidence: 9500`; `reason_code: github_repo_verified`; `fee_units: 18`; `total_0: 12482`; `total_1: 10000` |
| 9 | `preview_payout_by_account(1, wallet_string)` | `4470` | `4470` |
| 10 | `claim_winnings(1)` | returns payout | `ACCEPTED`; `FINISHED_WITH_RETURN`; tx `0x679f811c17d976885545e65dc1b65634470480738cb790c7f68aa873d957722c` |
| 11 | `get_position_by_account(1, wallet_string)` | `claimed: true` | `stake_0: 2482`; `stake_1: 0`; `claimed: true`; owner `0x5bb49021001200fe8156a81c7fcf097e535e7181` |

## Previous Validated Evidence

The previous validated instance at `0x66F55539E8446551e987Dc8a31492162E100aD75` proved create, buy, price movement, resolution, and claim:

- `create_market`: tx `0xba7c577ca30434849c40e9a82aab3f965f8e92890d197c5399048c4e71d45da6`
- `buy_position(1, 0, 2500)`: tx `0xb39d7e14d33cac3291a8e4034812a5f8f058e5bb177188c2969de4ea61bc6ce7`
- Post-trade prices: `get_price_bps(1, 0) = 5551`, `get_price_bps(1, 1) = 4448`
- Post-trade pools: `total_0 = 12482`, `total_1 = 10000`, `fee_units = 18`
- `admin_resolve_for_studio`: tx `0x2c522bf0cbfce5111e94cf7fda0a1ec4391196c05cc543186038a2b641547092`
- `claim_winnings(1)`: tx `0xbfc7bbf20c7e13866dff62c6ad414f944e388b189904eb9d7b6874117fccfcbf`

## Evidence Notes

Use screenshots or transaction data from GenLayer Studio and Bradbury Explorer.

Test wallet:

- `0x5bB49021001200fE8156a81c7fcF097e535e7181`

Initial price baseline:

- `get_price_bps(1, 0)`: `5000`
- `get_price_bps(1, 1)`: `5000`

Post-trade pool state:

- `total_0`: `12482`
- `total_1`: `10000`
- `fee_units`: `18`
