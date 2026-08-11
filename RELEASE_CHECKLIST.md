# OmniMarket Public Release Checklist

This checklist is the release gate for the public OmniMarket app. A green local build is necessary but does not prove that the deployed contract, Vercel environment, wallet flow, and public evidence all refer to the same release.

## 1. Final Bradbury deployment

- [ ] Deploy a new Bradbury instance from the byte-identical pair `contracts/omnimarket.py` and `studio_bradbury/omnimarket.py`.
- [ ] Record the final Bradbury address and deployment transaction in `TEST_LOG_BRADBURY.md`.
- [ ] Treat `0xACa9dE0bdac38d88A4E50e5f9DD7EDe969BB0A23` and its deployment transaction as pre-hardening validation only. It is not the final release address because the contract source changed afterward.
- [ ] Do not use `Upgrade code` for a deployment with an incompatible prior storage layout.

## 2. Vercel configuration

- [ ] Set `GENLAYER_OMNIMARKET_CONTRACT_ADDRESS` to the final Bradbury address.
- [ ] Set `NEXT_PUBLIC_OMNIMARKET_CONTRACT_ADDRESS` to the same final address.
- [ ] Set `GENLAYER_RPC_URL` to the Bradbury RPC and `GENLAYER_CHAIN_ID` to `bradbury`.
- [ ] Redeploy after changing environment variables.
- [ ] Verify `/api/omnimarket/health` returns `status: "configured"` and confirms the server/public contract addresses match before testing the app.
- [ ] Verify the public `/api/omnimarket` route returns `ok: true`, discovers markets from the final contract, and exposes the stored five source URLs.
- [ ] Run `OMNIMARKET_PUBLIC_URL=https://your-production-url bash scripts/release-smoke.sh` and retain its output with the release evidence.
- [ ] Copy [RELEASE_EVIDENCE_TEMPLATE.md](RELEASE_EVIDENCE_TEMPLATE.md) to the final release evidence record and populate its release identity and configuration-parity fields before announcing the URL.

## 3. Browser smoke test

- [ ] Refresh the app and confirm the loading shell is intentional and contains no raw exception text or blank state.
- [ ] Confirm the first contract read completes or presents a bounded retry state.
- [ ] Connect a wallet, confirm Bradbury fingerprint verification, copy the address, switch networks, and disconnect the OmniMarket session.
- [ ] Confirm an Asimov wallet is rejected even though Asimov and Bradbury share the EVM chain ID.
- [ ] Create a market with five unique HTTP(S) sources and the exact native value equal to `seed_liquidity_units`.
- [ ] Buy both outcomes in separate transactions and confirm the contract-derived chart records both lines.
- [ ] Lock after close, resolve after the safety delay, inspect source receipts, and claim or void-reclaim through the documented lifecycle.
- [ ] Confirm every public error is actionable without exposing server internals.

## 4. Contract evidence

- [ ] Fresh evidence covers deployment, initial count, creation, indexed discovery, prices, observations, positions, locking, resolution, source receipts, claims, void recovery, and protocol fee accounting.
- [ ] Include transaction hashes or exact accepted/finalized read responses. Screenshots alone are not sufficient.
- [ ] Complete the Bradbury lifecycle and browser sections of the release evidence record. A completed template must identify the same contract address and git commit as this release.
- [ ] Confirm unknown market IDs fail cleanly and do not return a zero-value record.
- [ ] Confirm outcome prices sum to exactly 10,000 basis points.
- [ ] Confirm observation history remains bounded with no unbounded storage growth; the chart remains available through the configured observation cap.

## 4a. Test-mode evidence

- [ ] Run the Python 3.12 Direct Mode suite with `python -m pytest tests/direct -v` and retain the passing CI run. Keep its scope explicit: deterministic storage-boundary checks belong in Direct Mode; native-value, consensus, and browser-wallet proof still require the separate checks below.
- [ ] Run Studio Mode for consensus-dependent web reads and the full accepted/finalized lifecycle. Direct Mode is for fast in-memory checks; Studio Mode is for network-backed consensus evidence. See `docs/testing.md` and the [official GenLayer testing documentation](https://docs.genlayer.com/developers/intelligent-contracts/testing).
- [ ] Run browser E2E against the deployed Vercel URL with a real Bradbury wallet, including rejected-network, rejected-signature, pending, accepted, finalization wait, execution-failure, retry, and claim states. A form must clear only after a finalized `FINISHED_WITH_RETURN` receipt.

## 5. Local validation

Run from the repository root:

```bash
npm install
npm run lint
npm test
npm audit
PYTHONPYCACHEPREFIX=/private/tmp/omni-pycache python3 -m py_compile contracts/*.py studio_bradbury/*.py
bash -n scripts/resolve-markets.sh
bash -n scripts/release-smoke.sh
npx next build --webpack
git diff --check
```

## 6. Submission gate

- [ ] Replace placeholders in `SUBMISSION_BRIEF.md` with the final address, explorer URL, public app URL, and fresh evidence URL.
- [ ] Update `TEST_LOG_BRADBURY.md` with the final deployment, not the pre-hardening validation instance.
- [ ] Confirm documentation explains that the API is read-only, wallet writes are user-signed, external reference data is contextual only, and settlement comes from the Intelligent Contract.
- [ ] Confirm the repository, docs, frontend, contract source, Studio copy, and deployment variables all describe the same final address and release revision.
