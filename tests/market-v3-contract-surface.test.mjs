import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractPath = new URL("../contracts/omnimarket_v3.py", import.meta.url);
const studioPath = new URL("../studio_bradbury/omnimarket_v3.py", import.meta.url);
const bridgePath = new URL("../app/api/omnimarket/v3/route.ts", import.meta.url);
const pagePath = new URL("../app/v3/page.tsx", import.meta.url);
const evidencePath = new URL("../V3_RELEASE_EVIDENCE_TEMPLATE.md", import.meta.url);

function decoratedMethods(source, decorator) {
  return new Set(
    [...source.matchAll(new RegExp(`${decorator}\\n\\s+def\\s+([a-z_][a-z0-9_]*)\\(`, "g"))]
      .map((match) => match[1]),
  );
}

function expectMethods(methods, expected, surface) {
  for (const method of expected) {
    assert.ok(methods.has(method), `${surface} expects ${method}, but OmniMarketV3 does not expose it.`);
  }
}

function methodBody(source, name) {
  const start = source.indexOf(`    def ${name}(`);
  assert.notEqual(start, -1, `OmniMarketV3 is missing ${name}.`);
  const nextDecorator = source.indexOf("\n    @gl.public", start + 1);
  return source.slice(start, nextDecorator === -1 ? source.length : nextDecorator);
}

test("V3 Studio source remains byte-identical to the separately deployed contract source", async () => {
  const [contract, studio] = await Promise.all([readFile(contractPath, "utf8"), readFile(studioPath, "utf8")]);
  assert.equal(studio, contract);
});

test("V3 bridge reads and browser writes map only to declared V3 contract methods", async () => {
  const [contract, bridge, page] = await Promise.all([
    readFile(contractPath, "utf8"),
    readFile(bridgePath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);
  const views = decoratedMethods(contract, "@gl\\.public\\.view");
  const writes = new Set([
    ...decoratedMethods(contract, "@gl\\.public\\.write"),
    ...decoratedMethods(contract, "@gl\\.public\\.write\\.payable"),
  ]);

  expectMethods(views, [
    "get_market_count",
    "get_market_id_at",
    "get_market",
    "get_price_bps",
    "get_price_observation_count",
    "get_price_observation",
    "get_source_observation_count",
    "get_source_observation",
    "get_account_market_count",
    "get_account_market_id_at",
    "get_position_by_account",
    "get_lp_position_by_account",
    "get_protocol_state",
    "quote_buy",
    "quote_sell",
    "quote_add_liquidity",
    "quote_remove_liquidity_outcome",
  ], "V3 read bridge");

  expectMethods(writes, [
    "create_market",
    "buy_outcome",
    "sell_outcome",
    "add_liquidity",
    "remove_liquidity",
    "lock_market",
    "resolve_market",
    "finalize_market",
    "challenge_market",
    "resolve_challenge",
    "void_market",
    "claim_winnings",
    "claim_lp_settlement",
    "claim_void_position",
    "claim_void_lp",
  ], "V3 browser");

  const declaredBridgeReads = new Set([...bridge.matchAll(/read\(client, "([a-z_][a-z0-9_]*)"/g)].map((match) => match[1]));
  for (const method of declaredBridgeReads) {
    assert.ok(views.has(method), `V3 bridge calls ${method}, but it is not a V3 public view.`);
  }

  const signedMethods = new Set([
    ...[...page.matchAll(/sign\("([a-z_][a-z0-9_]*)"/g)].map((match) => match[1]),
    ...[...page.matchAll(/settlement\("([a-z_][a-z0-9_]*)"/g)].map((match) => match[1]),
    ...[...page.matchAll(/claim\("([a-z_][a-z0-9_]*)"/g)].map((match) => match[1]),
  ]);
  for (const method of signedMethods) {
    assert.ok(writes.has(method), `V3 browser signs ${method}, but it is not a V3 public write.`);
  }
});

test("V3 client and bridge are isolated from V2 configuration", async () => {
  const [bridge, page] = await Promise.all([readFile(bridgePath, "utf8"), readFile(pagePath, "utf8")]);
  assert.match(bridge, /GENLAYER_OMNIMARKET_V3_CONTRACT_ADDRESS/);
  assert.match(page, /NEXT_PUBLIC_OMNIMARKET_V3_CONTRACT_ADDRESS/);
  assert.doesNotMatch(bridge, /GENLAYER_OMNIMARKET_CONTRACT_ADDRESS/);
  assert.doesNotMatch(page, /NEXT_PUBLIC_OMNIMARKET_CONTRACT_ADDRESS/);
  assert.doesNotMatch(bridge, /writeContract/);
});

test("V3 safety parameters stay aligned across the contract and browser validation", async () => {
  const [contract, page] = await Promise.all([readFile(contractPath, "utf8"), readFile(pagePath, "utf8")]);
  for (const constant of [
    "FEE_BPS = u256(75)",
    "SOURCE_COUNT = 5",
    "REQUIRED_SOURCE_VOTES = u32(3)",
    "MIN_CREATION_LEAD_TIME = u256(1800)",
    "SETTLEMENT_SAFETY_DELAY = u256(120)",
    "CHALLENGE_WINDOW = u256(3600)",
    "SETTLEMENT_TIMEOUT = u256(86400)",
    "MIN_TRADE_UNITS = u256(10000000000000000)",
    "MIN_SEED_UNITS = u256(2000000000000000000)",
  ]) assert.ok(contract.includes(constant), `Missing frozen V3 contract parameter: ${constant}`);
  assert.match(page, /const MIN_CREATION_LEAD_SECONDS = 1800/);
  assert.match(page, /const SLIPPAGE_BPS = 100/);
  assert.match(page, /Provide five unique HTTPS evidence URLs\./);
});

test("V3 release evidence names the V3 lifecycle rather than the historical V2 surface", async () => {
  const evidence = await readFile(evidencePath, "utf8");
  for (const method of [
    "buy_outcome",
    "sell_outcome",
    "add_liquidity",
    "remove_liquidity",
    "challenge_market",
    "resolve_challenge",
    "claim_void_position",
    "claim_void_lp",
  ]) assert.match(evidence, new RegExp(`\\b${method}\\b`));
  assert.match(evidence, /contracts\/omnimarket_v3\.py/);
  assert.match(evidence, /studio_bradbury\/omnimarket_v3\.py/);
  assert.doesNotMatch(evidence, /claim_void_seed|void_locked_market|buy_position/);
});

test("V3 pause boundaries preserve settlement and user exits", async () => {
  const contract = await readFile(contractPath, "utf8");
  for (const method of ["create_market", "buy_outcome", "sell_outcome", "add_liquidity", "remove_liquidity"]) {
    assert.match(methodBody(contract, method), /self\._require_risk_open\(\)/, `${method} must be stopped by the risk pause.`);
  }
  for (const method of [
    "lock_market",
    "resolve_market",
    "challenge_market",
    "finalize_market",
    "resolve_challenge",
    "void_market",
    "claim_winnings",
    "claim_lp_settlement",
    "claim_void_position",
    "claim_void_lp",
  ]) {
    assert.doesNotMatch(methodBody(contract, method), /self\._require_risk_open\(\)/, `${method} must remain callable while risk is paused.`);
  }
});

test("V3 enforces exact native-value attachment and routes every claim through backing accounting", async () => {
  const contract = await readFile(contractPath, "utf8");
  for (const method of ["create_market", "buy_outcome", "add_liquidity", "challenge_market"]) {
    assert.match(methodBody(contract, method), /gl\.message\.value !=/, `${method} must reject a mismatched attached GEN value.`);
  }
  for (const method of ["claim_winnings", "claim_lp_settlement", "claim_void_position", "claim_void_lp"]) {
    assert.match(methodBody(contract, method), /self\._payout_backing\(/, `${method} must update backing accounting before transferring GEN.`);
  }
});

test("V3 browser wallet flow tracks account, network, and provider disconnect events", async () => {
  const page = await readFile(pagePath, "utf8");
  assert.match(page, /wallet_switchEthereumChain/);
  assert.match(page, /wallet_addEthereumChain/);
  assert.match(page, /wallet_revokePermissions/);
  assert.match(page, /walletProvider\.on\?\.\("accountsChanged", onAccounts\)/);
  assert.match(page, /walletProvider\.on\?\.\("chainChanged", onChain\)/);
  assert.match(page, /walletProvider\.on\?\.\("disconnect", onDisconnect\)/);
  assert.match(page, /Disconnect clears this app session/);
  assert.match(page, /Copy address/);
});
