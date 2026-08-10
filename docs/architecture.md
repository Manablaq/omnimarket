# Architecture

```mermaid
flowchart LR
    Trader["Trader UI"] --> Create["create_market"]
    Trader --> Buy["buy_position"]
    Buy --> Pools["Native GEN pools"]
    Pools --> Price["get_price_bps"]
    Create --> Rules["Stored rules and five evidence URIs"]
    Rules --> Resolve["resolve_market"]
    Resolve --> Web["GenLayer web access"]
    Resolve --> Sources["Five source observations"]
    Sources --> Consensus["Three-source quorum and validator agreement"]
    Consensus --> State["Resolved market state"]
    State --> Claim["claim_winnings / native GEN transfer"]
```

## Boundaries

The frontend is responsible for visualization, market browsing, wallet signing, and preparing calls. It does not invent markets, prices, chart points, or settlement results.

The Intelligent Contract is responsible for market state, native GEN value checks, positions, market discovery, pricing, contract-written observations, evidence-bound resolution, and payout accounting.

GenLayer validators are responsible for agreeing that the resolver output follows the fetched evidence and stored rules.
