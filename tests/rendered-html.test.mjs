import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("omnimarket frontend keeps the public market surface", async () => {
  const page = await source("app/page.tsx");

  assert.match(page, /OmniMarket/);
  assert.match(page, /Markets that settle from live evidence/);
  assert.match(page, /Submit buy_position/);
  assert.match(page, /GenLayer settlement/);
  assert.match(page, /callOmniMarketApi\("snapshot"/);
  assert.match(page, /price0Bps/);
  assert.doesNotMatch(page, /OutcomeAttestationRegistry/);
  assert.doesNotMatch(page, /SemanticPolicyGate/);
});

test("omnimarket api maps frontend actions to contract methods", async () => {
  const route = await source("app/api/omnimarket/route.ts");

  assert.match(route, /GENLAYER_OMNIMARKET_CONTRACT_ADDRESS/);
  assert.match(route, /GENLAYER_RPC_URL/);
  assert.match(route, /functionName: "get_market"/);
  assert.match(route, /functionName: "get_price_bps"/);
  assert.match(route, /writeContract\("create_market"/);
  assert.match(route, /writeContract\("buy_position"/);
  assert.match(route, /writeContract\("admin_resolve_for_studio"/);
});
