import { testnetBradbury } from "genlayer-js/chains";

type GenLayerSdk = typeof import("genlayer-js");
type GenLayerClient = ReturnType<GenLayerSdk["createClient"]>;
type ReadContractRequest = Parameters<GenLayerClient["readContract"]>[0];
type ContractAddress = ReadContractRequest["address"];
type ContractArgs = NonNullable<ReadContractRequest["args"]>;

const CONTRACT_ADDRESS = process.env.GENLAYER_OMNIMARKET_V3_CONTRACT_ADDRESS?.trim() ?? "";
const RPC_URL = process.env.GENLAYER_RPC_URL?.trim() ?? "";
const CHAIN_ID = process.env.GENLAYER_CHAIN_ID?.trim().toLowerCase() || "bradbury";
const MAX_MARKETS = 24;
const MAX_POINTS = 120;
const MAX_SOURCE_POINTS = 10;
const MAX_CONCURRENT_READS = 6;
const MAX_SUPPORTED_MARKET_COUNT = 1_000_000;
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_QUOTE_AMOUNT = BigInt("100000000000000000000");
const READ_TIMEOUT_MS = 12_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const MAX_RATE_LIMIT_KEYS = 2_000;

type RateLimitEntry = { count: number; resetAt: number };
const rateLimits = new Map<string, RateLimitEntry>();

export const maxDuration = 30;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function requestKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "anonymous";
}

function rateLimit(request: Request) {
  const now = Date.now();
  for (const [key, entry] of rateLimits) if (entry.resetAt <= now) rateLimits.delete(key);
  while (rateLimits.size >= MAX_RATE_LIMIT_KEYS) {
    const oldestKey = rateLimits.keys().next().value;
    if (typeof oldestKey !== "string") break;
    rateLimits.delete(oldestKey);
  }

  const key = requestKey(request);
  const entry = rateLimits.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    const response = json({ ok: false, error: "Too many requests. Retry shortly." }, 429);
    response.headers.set("retry-after", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
    return response;
  }
  entry.count += 1;
  return null;
}

async function withTimeout<T>(task: Promise<T>, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function recordValue(value: unknown, keys: string[], index: number) {
  if (Array.isArray(value)) return value[index];
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of keys) if (key in record) return record[key];
  }
  return undefined;
}

function requiredNumber(value: unknown, field: string) {
  const numberValue = typeof value === "bigint"
    ? Number(value)
    : typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new Error(`Contract response integrity check failed: invalid ${field}.`);
  }
  return numberValue;
}

function requiredAmount(value: unknown, field: string) {
  try {
    if (typeof value === "bigint" && value >= BigInt(0)) return value.toString();
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
    if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value).toString();
  } catch {
    // Normalize every malformed numeric value into the same safe public error.
  }
  throw new Error(`Contract response integrity check failed: invalid ${field}.`);
}

function toNumber(value: unknown) {
  try {
    if (typeof value === "number" && Number.isSafeInteger(value)) return Math.max(0, value);
    if (typeof value === "string" && /^\d+$/.test(value)) {
      const numberValue = Number(value);
      return Number.isSafeInteger(numberValue) ? numberValue : 0;
    }
    if (typeof value === "bigint") {
      const numberValue = Number(value);
      return Number.isSafeInteger(numberValue) && numberValue >= 0 ? numberValue : 0;
    }
  } catch {
    // Invalid user input becomes zero and is then bounded by the action handler.
  }
  return 0;
}

function normalizeMarket(value: unknown) {
  const outcomeCount = requiredNumber(recordValue(value, ["outcome_count"], 4), "outcome count");
  if (outcomeCount !== 2 && outcomeCount !== 3) {
    throw new Error("Contract response integrity check failed: unsupported outcome count.");
  }
  const status = requiredNumber(recordValue(value, ["status"], 16), "market status");
  if (![1, 2, 3, 4, 5, 6].includes(status)) {
    throw new Error("Contract response integrity check failed: invalid market status.");
  }
  const market = {
    market_id: requiredNumber(recordValue(value, ["market_id"], 0), "market id"),
    creator: String(recordValue(value, ["creator"], 1) ?? ""),
    market_version: requiredNumber(recordValue(value, ["market_version"], 2), "market version"),
    title: String(recordValue(value, ["title"], 3) ?? ""),
    outcome_count: outcomeCount,
    outcomes: [
      String(recordValue(value, ["outcome_0"], 5) ?? ""),
      String(recordValue(value, ["outcome_1"], 6) ?? ""),
      String(recordValue(value, ["outcome_2"], 7) ?? ""),
    ].slice(0, outcomeCount),
    rules: String(recordValue(value, ["rules"], 8) ?? ""),
    source_uris: Array.from({ length: 5 }, (_, sourceIndex) => String(
      recordValue(value, [`source_${sourceIndex}_uri`], 9 + sourceIndex) ?? "",
    )),
    close_time: requiredNumber(recordValue(value, ["close_time"], 14), "close time"),
    created_at: requiredNumber(recordValue(value, ["created_at"], 15), "creation time"),
    status,
    pools: [
      requiredAmount(recordValue(value, ["pool_0"], 17), "outcome 0 pool"),
      requiredAmount(recordValue(value, ["pool_1"], 18), "outcome 1 pool"),
      requiredAmount(recordValue(value, ["pool_2"], 19), "outcome 2 pool"),
    ].slice(0, outcomeCount),
    claim_units_per_outcome: requiredAmount(recordValue(value, ["claim_units_per_outcome"], 20), "claim units"),
    remaining_backing_units: requiredAmount(recordValue(value, ["remaining_backing_units"], 21), "remaining backing"),
    total_lp_shares: requiredAmount(recordValue(value, ["total_lp_shares"], 22), "LP shares"),
    gross_trade_volume_units: requiredAmount(recordValue(value, ["gross_trade_volume_units"], 23), "gross trade volume"),
    gross_liquidity_in_units: requiredAmount(recordValue(value, ["gross_liquidity_in_units"], 24), "gross liquidity"),
    fee_units: requiredAmount(recordValue(value, ["fee_units"], 25), "fee units"),
    pending_outcome: requiredNumber(recordValue(value, ["pending_outcome"], 26), "pending outcome"),
    pending_confidence: requiredNumber(recordValue(value, ["pending_confidence"], 27), "pending confidence"),
    pending_reason_code: String(recordValue(value, ["pending_reason_code"], 28) ?? ""),
    pending_summary: String(recordValue(value, ["pending_summary"], 29) ?? ""),
    challenge_deadline: requiredNumber(recordValue(value, ["challenge_deadline"], 30), "challenge deadline"),
    resolution_round: requiredNumber(recordValue(value, ["resolution_round"], 31), "resolution round"),
    winning_outcome: requiredNumber(recordValue(value, ["winning_outcome"], 32), "winning outcome"),
    confidence: requiredNumber(recordValue(value, ["confidence"], 33), "confidence"),
    reason_code: String(recordValue(value, ["reason_code"], 34) ?? ""),
    summary: String(recordValue(value, ["summary"], 35) ?? ""),
    resolved_at: requiredNumber(recordValue(value, ["resolved_at"], 36), "resolved time"),
    void_remaining_share_units: requiredAmount(recordValue(value, ["void_remaining_share_units"], 37), "void share units"),
  };
  if (market.market_version !== 3 || !market.title || market.outcomes.some((outcome) => !outcome) || market.source_uris.some((uri) => !uri)) {
    throw new Error("Contract response integrity check failed: incomplete V3 market metadata.");
  }
  if (market.confidence > 10_000 || market.pending_confidence > 10_000) {
    throw new Error("Contract response integrity check failed: invalid confidence.");
  }
  return market;
}

function normalizePosition(value: unknown) {
  return {
    owner: String(recordValue(value, ["owner"], 0) ?? ""),
    market_id: requiredNumber(recordValue(value, ["market_id"], 1), "position market id"),
    outcome_units: [
      requiredAmount(recordValue(value, ["outcome_0_units"], 2), "outcome 0 position"),
      requiredAmount(recordValue(value, ["outcome_1_units"], 3), "outcome 1 position"),
      requiredAmount(recordValue(value, ["outcome_2_units"], 4), "outcome 2 position"),
    ],
    claimed_winnings: Boolean(recordValue(value, ["claimed_winnings"], 5)),
    claimed_void: Boolean(recordValue(value, ["claimed_void"], 6)),
  };
}

function normalizeLpPosition(value: unknown) {
  return {
    owner: String(recordValue(value, ["owner"], 0) ?? ""),
    market_id: requiredNumber(recordValue(value, ["market_id"], 1), "LP market id"),
    shares: requiredAmount(recordValue(value, ["shares"], 2), "LP shares"),
    claimed_settlement: Boolean(recordValue(value, ["claimed_settlement"], 3)),
  };
}

function normalizeObservation(value: unknown) {
  const prices = [
    requiredNumber(recordValue(value, ["price_0_bps"], 1), "outcome 0 price"),
    requiredNumber(recordValue(value, ["price_1_bps"], 2), "outcome 1 price"),
    requiredNumber(recordValue(value, ["price_2_bps"], 3), "outcome 2 price"),
  ];
  return {
    observed_at: requiredNumber(recordValue(value, ["observed_at"], 0), "observation time"),
    prices,
    pools: [
      requiredAmount(recordValue(value, ["pool_0"], 4), "outcome 0 pool"),
      requiredAmount(recordValue(value, ["pool_1"], 5), "outcome 1 pool"),
      requiredAmount(recordValue(value, ["pool_2"], 6), "outcome 2 pool"),
    ],
  };
}

function normalizeSourceObservation(value: unknown) {
  return {
    market_id: requiredNumber(recordValue(value, ["market_id"], 0), "source market id"),
    resolution_round: requiredNumber(recordValue(value, ["resolution_round"], 1), "resolution round"),
    source_index: requiredNumber(recordValue(value, ["source_index"], 2), "source index"),
    uri: String(recordValue(value, ["uri"], 3) ?? ""),
    status: String(recordValue(value, ["status"], 4) ?? ""),
    vote: requiredNumber(recordValue(value, ["vote"], 5), "source vote"),
    confidence: requiredNumber(recordValue(value, ["confidence"], 6), "source confidence"),
    evidence_excerpt: String(recordValue(value, ["evidence_excerpt"], 7) ?? ""),
    reason_code: String(recordValue(value, ["reason_code"], 8) ?? ""),
    summary: String(recordValue(value, ["summary"], 9) ?? ""),
    checked_at: requiredNumber(recordValue(value, ["checked_at"], 10), "source check time"),
  };
}

function normalizeProtocol(value: unknown) {
  return {
    accrued_fees: requiredAmount(recordValue(value, ["accrued_fees"], 0), "accrued fees"),
    withdrawn_fees: requiredAmount(recordValue(value, ["withdrawn_fees"], 1), "withdrawn fees"),
    claim_liability: requiredAmount(recordValue(value, ["claim_liability"], 2), "claim liability"),
    outstanding_challenge_bonds: requiredAmount(recordValue(value, ["outstanding_challenge_bonds"], 3), "challenge bonds"),
    risk_paused: Boolean(recordValue(value, ["risk_paused"], 4)),
    paused_at: requiredNumber(recordValue(value, ["paused_at"], 5), "pause time"),
    pause_actor: String(recordValue(value, ["pause_actor"], 6) ?? ""),
  };
}

async function loadClient(): Promise<GenLayerClient> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS)) {
    throw new Error("Set GENLAYER_OMNIMARKET_V3_CONTRACT_ADDRESS to a valid Bradbury address before using V3 reads.");
  }
  if (CHAIN_ID !== "bradbury") throw new Error("GENLAYER_CHAIN_ID must be bradbury for the V3 testnet release.");
  if (!RPC_URL) throw new Error("Set GENLAYER_RPC_URL to the Bradbury RPC before using V3 reads.");
  const sdk = await import("genlayer-js");
  return sdk.createClient({ chain: testnetBradbury, endpoint: RPC_URL } as Parameters<GenLayerSdk["createClient"]>[0]);
}

function contractAddress(): ContractAddress {
  return CONTRACT_ADDRESS as ContractAddress;
}

function contractArgs(values: unknown[]): ContractArgs {
  return values as ContractArgs;
}

async function read(client: GenLayerClient, functionName: string, args: unknown[] = []) {
  return withTimeout(client.readContract({
    address: contractAddress(),
    functionName,
    args: contractArgs(args),
  }), `V3 contract read ${functionName}`);
}

async function mapWithConcurrency<T, R>(items: T[], worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_READS, items.length) }, () => run()));
  return results;
}

async function listMarketIds(client: GenLayerClient, cursor: number, limit: number) {
  const count = requiredNumber(await read(client, "get_market_count"), "market count");
  if (count > MAX_SUPPORTED_MARKET_COUNT) throw new Error("Contract market count is outside the supported range.");
  const size = Math.max(1, Math.min(limit, MAX_MARKETS));
  // Indexes are append-only, so start from the most recent market and paginate
  // backwards. A cursor is the exclusive end index of the next older page.
  const end = cursor > 0 ? Math.min(cursor, count) : count;
  const start = Math.max(0, end - size);
  if (end === 0) return { ids: [] as number[], nextCursor: null as number | null, total: count };
  const offsets = Array.from({ length: end - start }, (_, index) => index + start + 1);
  const rawIds = await mapWithConcurrency(offsets, (index) => read(client, "get_market_id_at", [BigInt(index)]));
  return {
    ids: rawIds.map((id) => requiredNumber(id, "indexed market id")).filter((id) => id > 0),
    nextCursor: start > 0 ? start : null,
    total: count,
  };
}

async function marketSnapshot(client: GenLayerClient, marketId: number) {
  const market = normalizeMarket(await read(client, "get_market", [BigInt(marketId)]));
  if (market.market_id !== marketId) throw new Error("Contract response integrity check failed: market id mismatch.");
  const rawPrices = await Promise.all(
    Array.from({ length: market.outcome_count }, (_, outcomeIndex) => read(client, "get_price_bps", [BigInt(marketId), outcomeIndex])),
  );
  const pricesBps = rawPrices.map((price, outcomeIndex) => requiredNumber(price, `outcome ${outcomeIndex} price`));
  if (pricesBps.some((price) => price > 10_000) || pricesBps.reduce((total, price) => total + price, 0) !== 10_000) {
    throw new Error("Contract response integrity check failed: invalid V3 price vector.");
  }
  return {
    market,
    pricesBps,
    volumeWei: market.gross_trade_volume_units,
    source: "contract" as const,
    updatedAt: Date.now(),
  };
}

async function snapshots(client: GenLayerClient, ids: number[]) {
  const results = await mapWithConcurrency(ids, (marketId) => marketSnapshot(client, marketId));
  return results.sort((left, right) => right.market.created_at - left.market.created_at);
}

async function history(client: GenLayerClient, marketId: number) {
  const total = requiredNumber(await read(client, "get_price_observation_count", [BigInt(marketId)]), "price observation count");
  const start = Math.max(1, total - MAX_POINTS + 1);
  const offsets = Array.from({ length: Math.max(0, total - start + 1) }, (_, index) => start + index);
  const observations = await mapWithConcurrency(offsets, (index) => read(client, "get_price_observation", [BigInt(marketId), BigInt(index)]));
  return observations.map(normalizeObservation);
}

async function sourceEvidence(client: GenLayerClient, marketId: number) {
  const total = requiredNumber(await read(client, "get_source_observation_count", [BigInt(marketId)]), "source observation count");
  const start = Math.max(1, total - MAX_SOURCE_POINTS + 1);
  const offsets = Array.from({ length: Math.max(0, total - start + 1) }, (_, index) => start + index);
  const observations = await mapWithConcurrency(offsets, (index) => read(client, "get_source_observation", [BigInt(marketId), BigInt(index)]));
  return observations.map(normalizeSourceObservation);
}

async function portfolio(client: GenLayerClient, account: string) {
  const total = requiredNumber(await read(client, "get_account_market_count", [account]), "account market count");
  const start = Math.max(1, total - MAX_MARKETS + 1);
  const offsets = Array.from({ length: Math.max(0, total - start + 1) }, (_, index) => start + index);
  const ids = await mapWithConcurrency(offsets, (index) => read(client, "get_account_market_id_at", [account, BigInt(index)]));
  return mapWithConcurrency(ids, async (id) => {
    const marketId = requiredNumber(id, "account market id");
    const [position, lpPosition, snapshot] = await Promise.all([
      read(client, "get_position_by_account", [BigInt(marketId), account]),
      read(client, "get_lp_position_by_account", [BigInt(marketId), account]),
      marketSnapshot(client, marketId),
    ]);
    return { marketId, position: normalizePosition(position), lpPosition: normalizeLpPosition(lpPosition), snapshot };
  });
}

function validMarketId(value: unknown) {
  const marketId = toNumber(value);
  return marketId >= 1 && marketId <= MAX_SUPPORTED_MARKET_COUNT ? marketId : null;
}

function validOutcomeIndex(value: unknown) {
  const outcomeIndex = toNumber(value);
  return outcomeIndex >= 0 && outcomeIndex <= 2 ? outcomeIndex : null;
}

function validQuoteAmount(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,78}$/.test(text)) return null;
  try {
    const amount = BigInt(text);
    return amount > BigInt(0) && amount <= MAX_QUOTE_AMOUNT ? amount : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ ok: false, error: "Request body is too large." }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_REQUEST_BYTES) return json({ ok: false, error: "Request body is too large." }, 413);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ ok: false, error: "A JSON object is required." }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid JSON request." }, 400);
  }

  try {
    const action = String(body.action ?? "").trim();
    if (!/^[a-z_]{1,32}$/.test(action)) return json({ ok: false, error: "A valid API action is required." }, 400);
    const client = await loadClient();
    if (action === "markets") {
      const page = await listMarketIds(client, toNumber(body.cursor), toNumber(body.limit) || MAX_MARKETS);
      return json({ ok: true, markets: await snapshots(client, page.ids), nextCursor: page.nextCursor, total: page.total });
    }
    if (action === "snapshot" || action === "history" || action === "sources") {
      const marketId = validMarketId(body.marketId);
      if (!marketId) return json({ ok: false, error: "Invalid market id." }, 400);
      if (action === "snapshot") return json({ ok: true, snapshot: await marketSnapshot(client, marketId) });
      if (action === "history") return json({ ok: true, history: await history(client, marketId) });
      return json({ ok: true, sources: await sourceEvidence(client, marketId) });
    }
    if (action === "quote_buy" || action === "quote_sell") {
      const marketId = validMarketId(body.marketId);
      const outcomeIndex = validOutcomeIndex(body.outcomeIndex);
      const amount = validQuoteAmount(body.amountWei);
      if (!marketId || outcomeIndex === null || !amount) return json({ ok: false, error: "A valid market, outcome, and positive quote amount are required." }, 400);
      const market = normalizeMarket(await read(client, "get_market", [BigInt(marketId)]));
      if (outcomeIndex >= market.outcome_count) return json({ ok: false, error: "Outcome is not available for this market." }, 400);
      const functionName = action === "quote_buy" ? "quote_buy" : "quote_sell";
      const quote = requiredAmount(await read(client, functionName, [BigInt(marketId), BigInt(outcomeIndex), amount]), "quote");
      return json({ ok: true, action, marketId, outcomeIndex, amountWei: amount.toString(), quoteWei: quote });
    }
    if (action === "quote_add_liquidity" || action === "quote_remove_liquidity") {
      const marketId = validMarketId(body.marketId);
      const amount = validQuoteAmount(body.amountWei);
      if (!marketId || !amount) return json({ ok: false, error: "A valid market and positive quote amount are required." }, 400);
      const market = normalizeMarket(await read(client, "get_market", [BigInt(marketId)]));
      if (market.status !== 1) return json({ ok: false, error: "Liquidity quotes are available only while a market is open." }, 400);
      if (action === "quote_add_liquidity") {
        if (BigInt(market.remaining_backing_units) + amount > MAX_QUOTE_AMOUNT) {
          return json({ ok: false, error: "This deposit exceeds the contract's per-market backing limit." }, 400);
        }
        const quote = requiredAmount(await read(client, "quote_add_liquidity", [BigInt(marketId), amount]), "LP share quote");
        return json({ ok: true, action, marketId, amountWei: amount.toString(), quoteWei: quote });
      }
      const quotes = await Promise.all(
        Array.from({ length: market.outcome_count }, (_, outcomeIndex) => read(client, "quote_remove_liquidity_outcome", [BigInt(marketId), amount, BigInt(outcomeIndex)])),
      );
      return json({ ok: true, action, marketId, amountWei: amount.toString(), quoteWei: quotes.map((quote, outcomeIndex) => requiredAmount(quote, `outcome ${outcomeIndex} claim quote`)) });
    }
    if (action === "portfolio") {
      const account = String(body.account ?? "").trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(account)) return json({ ok: false, error: "A valid wallet address is required." }, 400);
      return json({ ok: true, portfolio: await portfolio(client, account) });
    }
    if (action === "protocol") return json({ ok: true, protocol: normalizeProtocol(await read(client, "get_protocol_state")) });
    return json({ ok: false, error: `Unsupported V3 API action: ${action}. Wallet writes are signed in the browser.` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const knownError = /unknown market|index out of range|no position|outside the supported range/.test(message);
    return json({
      ok: false,
      error: knownError ? message : "V3 contract bridge unavailable. Retry shortly.",
      configured: Boolean(CONTRACT_ADDRESS),
    }, knownError ? 404 : 502);
  }
}
