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
  assert.match(page, /Sign buy_position/);
  assert.match(page, /GenLayer settlement/);
  assert.match(page, /callOmniMarketApi\("snapshot"/);
  assert.match(page, /price0Bps/);
  assert.doesNotMatch(page, /OutcomeAttestationRegistry/);
  assert.doesNotMatch(page, /SemanticPolicyGate/);
});

test("omnimarket api maps frontend actions to contract methods", async () => {
  const page = await source("app/page.tsx");
  const route = await source("app/api/omnimarket/route.ts");

  assert.match(route, /GENLAYER_OMNIMARKET_CONTRACT_ADDRESS/);
  assert.match(route, /GENLAYER_RPC_URL/);
  assert.match(route, /functionName: "get_market"/);
  assert.match(route, /functionName: "get_price_bps"/);
  assert.doesNotMatch(route, /writeContract/);
  assert.match(page, /provider: provider/);
  assert.match(page, /testnetBradbury/);
  assert.match(page, /TransactionStatus\.ACCEPTED/);
  assert.match(page, /ExecutionResult\.FINISHED_WITH_RETURN/);
  assert.match(page, /waitForTransactionReceipt/);
  assert.doesNotMatch(page, /featuredFallback/);
  assert.doesNotMatch(page, /initialSnapshots/);
});
