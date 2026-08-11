# Submission Brief

## Name

OmniMarket

## Topic

GenLayer prediction market primitive with validator-resolved outcomes.

## Repository

`https://github.com/Manablaq/omnimarket`

## Documentation Site

Public guide: `https://omnimarket-two.vercel.app/docs`

Repository documentation: `https://github.com/Manablaq/omnimarket/tree/main/docs`

Replace the hosted URL if the final Vercel project domain changes.

## Contract Site

Deploy the current `studio_bradbury/omnimarket.py` as a new Bradbury instance before submission. Replace the placeholders below with the new address and explorer URL. The legacy virtual-units address must not be submitted for this version.

Bradbury contract address: `PENDING FINAL POST-HARDENING DEPLOYMENT`

Explorer: `https://explorer-bradbury.genlayer.com/address/<FINAL_BRADBURY_ADDRESS>`

Do not submit the pre-hardening validation address `0xACa9dE0bdac38d88A4E50e5f9DD7EDe969BB0A23`.

## Test Evidence

`https://github.com/Manablaq/omnimarket/blob/main/TEST_LOG_BRADBURY.md`

## Description

OmniMarket is a reusable GenLayer Intelligent Contract primitive for prediction markets that need evidence-bound outcome resolution. Builders create two-outcome markets with explicit rules, five evidence URIs, close timestamps, native GEN seed liquidity, and wallet positions. The contract enforces payable value equality in wei, exposes pool-derived probabilities, indexes markets and account positions without a trusted off-chain indexer, records contract-written price observations for a live history chart, and resolves outcomes through GenLayer nondeterministic web and AI consensus. It stores final outcome, confidence, reason code, summary, per-source receipts, and claim state; winning claims use the documented native GEN transfer path. The permissionless `resolve_market` path is the only settlement mechanism, with no frontend or Studio bypass. The package includes a wallet-backed Bradbury frontend, read-only contract API, live contextual reference feed, Studio deployment copy, API manifest, test plan, and evidence template. It is useful for ecosystem milestones, data-event markets, governance decisions, grants, bounties, and applications that need a reusable on-chain market/resolution pattern.
