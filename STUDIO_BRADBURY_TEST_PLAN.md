# Studio Bradbury Test Plan

Use this exact sequence after deployment.

## 1. Create Market

Call `create_market`.

```text
title:
Will genlayerlabs/genlayer-project-boilerplate exist on GitHub?

outcome_0:
Yes

outcome_1:
No

rules:
Outcome 0 wins only if the evidence clearly identifies an existing GitHub repository at genlayerlabs/genlayer-project-boilerplate. Outcome 1 wins if the repository is missing. Return inconclusive if the source cannot be fetched or is ambiguous.

evidence_uri:
https://api.github.com/repos/genlayerlabs/genlayer-project-boilerplate

close_time:
9999999999

seed_liquidity_units:
10000
```

Expected return:

```text
1
```

## 2. Read Market

Call `get_market`.

```text
market_id:
1
```

Expected:

- `status: 1`
- `outcome_0: Yes`
- `outcome_1: No`
- `total_0: 10000`
- `total_1: 10000`

## 3. Buy Yes Position

Call `buy_position`.

```text
market_id:
1

outcome_index:
0

stake_units:
2500
```

Expected transaction status:

```text
ACCEPTED
```

## 4. Check Price

Call `get_price_bps`.

```text
market_id:
1

outcome_index:
0
```

Expected:

```text
value above 5000
```

This proves the live odds moved after a trade.

## 5. Check Position

Call `get_position_by_account`.

```text
market_id:
1

account:
your wallet address
```

Expected:

- `stake_0: 2482`
- `stake_1: 0`
- `claimed: false`

## 6. Resolve for Studio

Call `admin_resolve_for_studio`.

```text
market_id:
1

winning_outcome:
0

confidence:
9500

reason_code:
github_repo_verified

summary:
The evidence identifies the GitHub repository as existing.
```

Expected transaction status:

```text
ACCEPTED
```

## 7. Read Resolved Market

Call `get_market`.

```text
market_id:
1
```

Expected:

- `status: 3`
- `winning_outcome: 1`
- `confidence: 9500`
- `reason_code: github_repo_verified`

## 8. Preview Payout

Call `preview_payout_by_account`.

```text
market_id:
1

account:
your wallet address
```

Expected:

```text
4470
```

## 9. Claim Winnings

Call `claim_winnings`.

```text
market_id:
1
```

Expected:

```text
virtual payout units returned
```

## 10. Verify Claim Lock

Call `get_position_by_account`.

```text
market_id:
1

account:
your wallet address
```

Expected:

```text
claimed: true
```
