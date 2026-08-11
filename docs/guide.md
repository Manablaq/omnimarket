# OmniMarket Guide

## Purpose

OmniMarket is a two-outcome prediction-market primitive. The contract owns the market lifecycle, native GEN accounting, position index, price observations, and settlement result. The frontend is a client of that state.

## What the Frontend Can Trust

The market list is discovered from contract index views. The chart uses `PriceObservation` records written during creation, trades, locking, and resolution. A browser refresh cannot manufacture a price history. The server bridge uses configured GenLayer contract reads and is read-only.

## Wallet-Signed Writes

The browser creates the documented GenLayerJS client with `testnetBradbury`, the connected account, and the wallet provider. It verifies the Bradbury consensus contract address as a network fingerprint because Bradbury and Asimov share the same EVM chain ID. A wallet may therefore require manual RPC selection when moving between those networks. It connects before signing, passes native GEN as `value`, waits for `TransactionStatus.FINALIZED`, and checks `ExecutionResult.FINISHED_WITH_RETURN`. A signed or accepted transaction is not presented as completed: OmniMarket clears a completed form only after that finalization check. The API does not receive private keys or submit transactions for users.

Disconnecting clears OmniMarket's local session. A dapp cannot universally revoke a wallet extension's global permission; users can revoke that permission in the wallet itself.

## Market Lifecycle

1. Create a market with two distinct outcomes, five unique evidence sources, explicit rules, close time, and an even native-GEN seed.
2. Users buy positions by attaching the exact stake in wei.
3. Contract views expose live pool-derived probabilities.
4. After close time, anyone may lock the market.
5. Anyone may start GenLayer consensus resolution.
6. The contract stores the agreed normalized result.
7. Winners claim native GEN through the contract's recipient transfer path.

If consensus returns inconclusive or error, the market becomes void. Traders reclaim their net positions with `claim_winnings`, and the original creator can reclaim the seed with `claim_void_seed`. Protocol fees remain separately accounted; only the contract owner can withdraw accrued fees.

## Resolution Design

`resolve_market` uses five stored source URIs, `gl.nondet.web.get()`, `gl.nondet.exec_prompt()`, and a validator function inside `gl.vm.run_nondet_unsafe()`. The validator independently reruns all five sources and compares the normalized winning decision plus the existence of an independent three-source quorum. Per-source statuses, evidence digests, confidence values, and summaries are retained as audit observations but are not required to be byte-for-byte identical because live web responses and LLM wording can vary between validators. Rules must say how to handle missing, ambiguous, stale, or inconclusive evidence and must tell the resolver to ignore instructions contained in fetched pages.

If repeated resolution attempts remain undetermined, `void_locked_market` provides a permissionless safety valve after the 120-second safety delay plus a 24-hour settlement timeout. It marks the market inconclusive and void, allowing traders to reclaim their net positions and the creator to reclaim the seed. This prevents an external-source outage or persistent validator disagreement from permanently stranding funds.

## Amounts

All contract amounts are wei. The UI accepts decimal GEN and converts it to wei before signing. The initial seed must be positive and even because the contract splits it between the two outcomes. Each trade pays the exact stake as value; the contract records the fee and credits the net amount.
