# Architecture

```mermaid
flowchart LR
    Trader["Trader UI"] --> Create["create_market"]
    Trader --> Buy["buy_position"]
    Buy --> Pools["Virtual liquidity pools"]
    Pools --> Price["get_price_bps"]
    Create --> Rules["Stored rules and evidence URI"]
    Rules --> Resolve["resolve_market"]
    Resolve --> Web["GenLayer web access"]
    Resolve --> Consensus["Validator agreement"]
    Consensus --> State["Resolved market state"]
    State --> Claim["claim_winnings"]
```

## Boundaries

The frontend is responsible for visualization, market browsing, and preparing calls.

The Intelligent Contract is responsible for market state, positions, pricing, evidence-bound resolution, and payout accounting.

GenLayer validators are responsible for agreeing that the resolver output follows the fetched evidence and stored rules.

