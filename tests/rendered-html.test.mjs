import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("omnimarket frontend keeps the public market surface", async () => {
  const page = await source("app/page.tsx");

  assert.match(page, /OmniMarket/);
  assert.match(page, /Markets that settle from/);
  assert.match(page, /yes-line/);
  assert.match(page, /no-line/);
  assert.match(page, /Sign GEN position/);
  assert.match(page, /GenLayer web consensus/);
  assert.match(page, /Five-source audit/);
  assert.match(page, /External reference feed/);
  assert.match(page, /claim_void_seed/);
  assert.match(page, /Reclaim void-market seed/);
  assert.match(page, /marketForm\.sources/);
  assert.match(page, /Load more/);
  assert.match(page, /marketFilter/);
  assert.match(page, /marketSort/);
  assert.match(page, /callOmniMarketApi\("markets"/);
  assert.match(page, /price0Bps/);
  assert.doesNotMatch(page, /OutcomeAttestationRegistry/);
  assert.doesNotMatch(page, /SemanticPolicyGate/);
});

test("omnimarket api maps frontend actions to contract methods", async () => {
  const page = await source("app/page.tsx");
  const route = await source("app/api/omnimarket/route.ts");

  assert.match(route, /GENLAYER_OMNIMARKET_CONTRACT_ADDRESS/);
  assert.match(route, /testnetBradbury/);
  assert.doesNotMatch(route, /endpoint: RPC_URL/);
  assert.match(route, /read\(client, "get_market"/);
  assert.match(route, /read\(client, "get_price_bps"/);
  assert.match(route, /get_market_count/);
  assert.match(route, /get_price_observation/);
  assert.match(route, /get_source_observation/);
  assert.match(route, /nextCursor/);
  assert.match(route, /readContract/);
  assert.doesNotMatch(route, /stateStatus/);
  assert.doesNotMatch(route, /FALLBACK_MARKET_ID/);
  assert.doesNotMatch(page, /0x0E1201A1F5477e635306BC3E34e68658e4489fBd/);
  assert.doesNotMatch(route, /writeContract/);
  assert.match(page, /provider: provider/);
  assert.match(page, /testnetBradbury/);
  assert.match(page, /TransactionStatus\.ACCEPTED/);
  assert.match(page, /ExecutionResult\.FINISHED_WITH_RETURN/);
  assert.match(page, /waitForTransactionReceipt/);
  assert.match(page, /Pool estimate/);
  assert.doesNotMatch(page, /featuredFallback/);
  assert.doesNotMatch(page, /initialSnapshots/);
});

test("omnimarket contract keeps native value and on-chain indexing invariants", async () => {
  const contract = await source("contracts/omnimarket.py");
  const studio = await source("studio_bradbury/omnimarket.py");

  assert.match(contract, /@gl\.public\.write\.payable/);
  assert.match(contract, /gl\.message\.value != liquidity/);
  assert.match(contract, /gl\.message\.value != stake_units/);
  assert.match(contract, /get_market_count/);
  assert.match(contract, /get_account_market_count/);
  assert.match(contract, /get_price_observation_count/);
  assert.match(contract, /emit_transfer\(value=payout\)/);
  assert.match(contract, /claim_void_seed/);
  assert.match(contract, /withdraw_protocol_fees/);
  assert.match(contract, /get_protocol_fee_state/);
  assert.match(contract, /source_uri must use http or https/);
  assert.match(contract, /source_0_uri/);
  assert.match(contract, /REQUIRED_SOURCE_VOTES/);
  assert.match(contract, /SETTLEMENT_SAFETY_DELAY/);
  assert.match(contract, /LOCKED_SETTLEMENT_TIMEOUT/);
  assert.match(contract, /void_locked_market/);
  assert.match(contract, /get_source_observation_count/);
  assert.match(contract, /run_nondet_unsafe/);
  assert.match(contract, /source_digests/);
  assert.match(contract, /source_confidences/);
  assert.match(contract, /normalized_winning_outcome/);
  assert.doesNotMatch(contract, /leader_data\["source_digests"\] == validator_data\["source_digests"\]/);
  assert.doesNotMatch(contract, /leader_data\["source_confidences"\] == validator_data\["source_confidences"\]/);
  assert.doesNotMatch(contract, /admin_resolve_for_studio/);
  assert.equal(studio, contract);
});

test("omnimarket exposes separate contextual reference data", async () => {
  const route = await source("app/api/omnimarket/reference/route.ts");
  assert.match(route, /api\.binance\.com/);
  assert.match(route, /Reference data only/);
  assert.match(route, /SUPPORTED_ASSETS/);
});

test("public documentation routes explain contract trust boundaries", async () => {
  const docs = await source("app/docs/page.tsx");
  const how = await source("app/how-it-works/page.tsx");
  const portfolio = await source("app/portfolio/page.tsx");
  assert.match(docs, /Trust boundaries/);
  assert.match(docs, /five evidence sources/);
  assert.match(how, /120-second safety delay/);
  assert.match(portfolio, /private key/);
});

test("omnimarket has explicit loading and recovery surfaces", async () => {
  const loading = await source("app/loading.tsx");
  const error = await source("app/error.tsx");
  assert.match(loading, /Reading Bradbury state/);
  assert.match(error, /Try again/);
  assert.match(error, /No wallet funds were moved/);
});

test("omnimarket includes a permissionless settlement keeper", async () => {
  const keeper = await source("scripts/resolve-markets.sh");
  const operations = await source("OPERATIONS_KEEPER.md");
  assert.match(keeper, /genlayer write/);
  assert.match(keeper, /resolve_market/);
  assert.match(operations, /permissionless/);
  assert.doesNotMatch(keeper, /PRIVATE_KEY/);
});
