# Submission Brief

## Name

OmniMarket

## Topic

GenLayer prediction market primitive with validator-resolved outcomes.

## Repository

`https://github.com/Manablaq/omnimarket`

## Documentation Site

Use the hosted app or GitHub Pages documentation once the repository is published.

## Contract Site

Bradbury contract address: `0x0E1201A1F5477e635306BC3E34e68658e4489fBd`

Explorer: `https://explorer-bradbury.genlayer.com/address/0x0E1201A1F5477e635306BC3E34e68658e4489fBd`

## Test Evidence

`https://github.com/Manablaq/omnimarket/blob/main/TEST_LOG_BRADBURY.md`

## Description

OmniMarket is a reusable GenLayer Intelligent Contract primitive for prediction markets that need trustless outcome resolution. Builders can create two-outcome markets with explicit rules, evidence URIs, close timestamps, virtual liquidity, and position tracking. The contract exposes live price views in basis points, records wallet positions, supports market locking, resolves outcomes through GenLayer nondeterministic web and AI consensus, and stores final outcome, confidence, reason code, summary, and payout state. For Bradbury Studio compatibility, it uses virtual stake units and includes an owner or creator-controlled deterministic resolution method for smoke testing, while preserving the real `resolve_market` path for validator-agreed web evidence resolution. The package includes a professional live-chart frontend, Studio deployment copy, API manifest, test plan, and submission log. It is useful for ecosystem milestone markets, data-event markets, governance prediction tools, milestone bets, and applications that need a reusable on-chain market/resolution pattern.
