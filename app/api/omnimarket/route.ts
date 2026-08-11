import { testnetBradbury } from "genlayer-js/chains";

type GenLayerSdk = typeof import("genlayer-js");
type GenLayerClient = ReturnType<GenLayerSdk["createClient"]>;
type ReadContractRequest = Parameters<GenLayerClient["readContract"]>[0];
type ContractAddress = ReadContractRequest["address"];
type ContractArgs = NonNullable<ReadContractRequest["args"]>;

const CONTRACT_ADDRESS = process.env.GENLAYER_OMNIMARKET_CONTRACT_ADDRESS ?? "";
const RPC_URL = process.env.GENLAYER_RPC_URL?.trim() ?? "";
const CHAIN_ID = process.env.GENLAYER_CHAIN_ID?.trim().toLowerCase() || "bradbury";
const MAX_MARKETS = 24;
const MAX_POINTS = 120;
const MAX_SOURCE_POINTS = 5;
const MAX_CONCURRENT_READS = 6;
const MAX_SUPPORTED_MARKET_COUNT = 1_000_000;
const MAX_REQUEST_BYTES = 32 * 1024;
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

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "anonymous";
}

function makeRateLimitCapacity(now: number) {
  for (const [entryKey, entry] of rateLimits) {
    if (entry.resetAt <= now) rateLimits.delete(entryKey);
  }
  while (rateLimits.size >= MAX_RATE_LIMIT_KEYS) {
    const oldestKey = rateLimits.keys().next().value;
    if (typeof oldestKey !== "string") break;
    rateLimits.delete(oldestKey);
  }
}

function rateLimitResponse(request: Request) {
  const now = Date.now();
  const key = clientKey(request);
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.delete(key);
    makeRateLimitCapacity(now);
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    const response = json({ ok: false, error: "Too many requests. Retry shortly." }, 429);
    response.headers.set("retry-after", String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
    return response;
  }
  current.count += 1;
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

function toNumber(value: unknown) {
  const parsed = typeof value === "bigint"
    ? Number(value)
    : typeof value === "number"
      ? value
      : typeof value === "string" && /^-?\d+$/.test(value)
        ? Number(value)
        : 0;
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function toAmount(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value).toString();
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return "0";
}

function requiredNumber(value: unknown, field: string) {
  const parsed = typeof value === "bigint"
    ? Number(value)
    : typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Contract response integrity check failed: invalid ${field}.`);
  return parsed;
}

function requiredAmount(value: unknown, field: string) {
  try {
    if (typeof value === "bigint" && value >= BigInt("0")) return value.toString();
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
    if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value).toString();
  } catch {
    // Fall through to the same integrity error for malformed numeric values.
  }
  throw new Error(`Contract response integrity check failed: invalid ${field}.`);
}

function recordValue(value: unknown, keys: string[], index: number) {
  if (Array.isArray(value)) return value[index];
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of keys) if (key in object) return object[key];
  }
  return undefined;
}

function normalizeMarket(value: unknown) {
  return {
    market_id: requiredNumber(recordValue(value, ["market_id"], 0), "market id"),
    creator: String(recordValue(value, ["creator"], 1) ?? ""),
    title: String(recordValue(value, ["title"], 2) ?? ""),
    outcome_0: String(recordValue(value, ["outcome_0"], 3) ?? ""),
    outcome_1: String(recordValue(value, ["outcome_1"], 4) ?? ""),
    rules: String(recordValue(value, ["rules"], 5) ?? ""),
    source_uris: [0, 1, 2, 3, 4].map((sourceIndex) => String(
      recordValue(value, [`source_${sourceIndex}_uri`, "source_uri"], 6 + sourceIndex) ?? "",
    )),
    close_time: requiredNumber(recordValue(value, ["close_time"], 11), "close time"),
    status: requiredNumber(recordValue(value, ["status"], 12), "market status"),
    created_at: requiredNumber(recordValue(value, ["created_at"], 13), "creation time"),
    liquidity_units: requiredAmount(recordValue(value, ["liquidity_units"], 14), "liquidity amount"),
    total_0: requiredAmount(recordValue(value, ["total_0"], 15), "outcome 0 pool total"),
    total_1: requiredAmount(recordValue(value, ["total_1"], 16), "outcome 1 pool total"),
    fee_units: requiredAmount(recordValue(value, ["fee_units"], 17), "fee amount"),
    winning_outcome: requiredNumber(recordValue(value, ["winning_outcome"], 18), "winning outcome"),
    confidence: requiredNumber(recordValue(value, ["confidence"], 19), "confidence"),
    reason_code: String(recordValue(value, ["reason_code"], 20) ?? ""),
    summary: String(recordValue(value, ["summary"], 21) ?? ""),
    resolved_at: requiredNumber(recordValue(value, ["resolved_at"], 22), "resolution time"),
  };
}

function normalizePosition(value: unknown) {
  return {
    owner: String(recordValue(value, ["owner"], 0) ?? ""),
    market_id: requiredNumber(recordValue(value, ["market_id"], 1), "position market id"),
    stake_0: requiredAmount(recordValue(value, ["stake_0"], 2), "outcome 0 position"),
    stake_1: requiredAmount(recordValue(value, ["stake_1"], 3), "outcome 1 position"),
    gross_stake: requiredAmount(recordValue(value, ["gross_stake"], 4), "gross position"),
    claimed: Boolean(recordValue(value, ["claimed"], 5)),
  };
}

function normalizeObservation(value: unknown) {
  return {
    observed_at: requiredNumber(recordValue(value, ["observed_at"], 0), "observation time"),
    price_0_bps: requiredNumber(recordValue(value, ["price_0_bps"], 1), "observation outcome 0 price"),
    price_1_bps: requiredNumber(recordValue(value, ["price_1_bps"], 2), "observation outcome 1 price"),
    total_0: requiredAmount(recordValue(value, ["total_0"], 3), "observation outcome 0 total"),
    total_1: requiredAmount(recordValue(value, ["total_1"], 4), "observation outcome 1 total"),
  };
}

function normalizeSourceObservation(value: unknown) {
  return {
    market_id: requiredNumber(recordValue(value, ["market_id"], 0), "source market id"),
    source_index: requiredNumber(recordValue(value, ["source_index"], 1), "source index"),
    uri: String(recordValue(value, ["uri"], 2) ?? ""),
    status: String(recordValue(value, ["status"], 3) ?? ""),
    vote: requiredNumber(recordValue(value, ["vote"], 4), "source vote"),
    confidence: requiredNumber(recordValue(value, ["confidence"], 5), "source confidence"),
    digest: String(recordValue(value, ["digest"], 6) ?? ""),
    reason_code: String(recordValue(value, ["reason_code"], 7) ?? ""),
    summary: String(recordValue(value, ["summary"], 8) ?? ""),
    checked_at: requiredNumber(recordValue(value, ["checked_at"], 9), "source check time"),
  };
}

async function loadClient(): Promise<GenLayerClient> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS)) {
    throw new Error("Set GENLAYER_OMNIMARKET_CONTRACT_ADDRESS to a valid Bradbury address before using live contract reads.");
  }
  if (CHAIN_ID !== "bradbury") throw new Error("GENLAYER_CHAIN_ID must be bradbury for this deployment.");
  if (!RPC_URL) throw new Error("Set GENLAYER_RPC_URL to the Bradbury RPC before using live contract reads.");
  const sdk = await import("genlayer-js");
  const config = { chain: testnetBradbury, endpoint: RPC_URL };
  return sdk.createClient(config as Parameters<GenLayerSdk["createClient"]>[0]);
}

function contractAddress(): ContractAddress {
  return CONTRACT_ADDRESS as ContractAddress;
}

function contractArgs(values: unknown[]): ContractArgs {
  return values as ContractArgs;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

async function read(client: GenLayerClient, functionName: string, args: unknown[] = []) {
  return withTimeout(client.readContract({
    address: contractAddress(),
    functionName,
    args: contractArgs(args),
  }), `Contract read ${functionName}`);
}

async function listMarketIds(client: GenLayerClient, cursor = 0, limit = MAX_MARKETS) {
  const count = requiredNumber(await read(client, "get_market_count"), "market count");
  if (count < 0 || count > MAX_SUPPORTED_MARKET_COUNT) throw new Error("Contract market count is outside the supported range.");
  const start = Math.max(0, Math.min(cursor, count));
  const pageSize = Math.max(1, Math.min(limit, MAX_MARKETS));
  const end = Math.min(count, start + pageSize);
  if (start >= end) return { ids: [], nextCursor: null as number | null, total: count };
  const indexes = Array.from({ length: end - start }, (_, index) => index);
  const ids = await mapWithConcurrency(indexes, MAX_CONCURRENT_READS, (index) => read(client, "get_market_id_at", [BigInt(start + index + 1)]));
  return { ids: ids.map((value: unknown) => requiredNumber(value, "indexed market id")).filter((id: number) => id > 0), nextCursor: end < count ? end : null, total: count };
}

async function marketSnapshot(client: GenLayerClient, marketId: number) {
  const [marketRaw, price0Raw, price1Raw] = await Promise.all([
    read(client, "get_market", [BigInt(marketId)]),
    read(client, "get_price_bps", [BigInt(marketId), 0]),
    read(client, "get_price_bps", [BigInt(marketId), 1]),
  ]);
  const market = normalizeMarket(marketRaw);
  const price0Bps = requiredNumber(price0Raw, "outcome 0 price");
  const price1Bps = requiredNumber(price1Raw, "outcome 1 price");
  if (market.market_id !== marketId) throw new Error("Contract response integrity check failed: market id mismatch.");
  if (!market.title || !market.outcome_0 || !market.outcome_1 || market.source_uris.length !== 5) {
    throw new Error("Contract response integrity check failed: incomplete market metadata.");
  }
  if (![0, 1, 2, 3, 4].includes(market.status)) throw new Error("Contract response integrity check failed: invalid market status.");
  if (market.confidence > 10000) throw new Error("Contract response integrity check failed: invalid confidence.");
  if (market.winning_outcome > 4) throw new Error("Contract response integrity check failed: invalid winning outcome.");
  if (price0Bps < 0 || price0Bps > 10000 || price1Bps < 0 || price1Bps > 10000 || price0Bps + price1Bps !== 10000) {
    throw new Error("Contract response integrity check failed: invalid price complement.");
  }
  try {
    if (BigInt(market.total_0) < BigInt("0") || BigInt(market.total_1) < BigInt("0")) throw new Error("negative pool total");
  } catch {
    throw new Error("Contract response integrity check failed: invalid pool total.");
  }
  return {
    market,
    price0Bps,
    price1Bps,
    poolTotalWei: (BigInt(market.total_0) + BigInt(market.total_1)).toString(),
    source: "contract" as const,
    updatedAt: Date.now(),
  };
}

async function snapshots(client: GenLayerClient, ids: number[]) {
  const results = await mapWithConcurrency(ids, MAX_CONCURRENT_READS, (id) => marketSnapshot(client, id));
  return results.sort((a, b) => a.market.market_id - b.market.market_id);
}

async function portfolio(client: GenLayerClient, account: string) {
  const count = Math.min(requiredNumber(await read(client, "get_account_market_count", [account]), "account market count"), MAX_MARKETS);
  const indexes = Array.from({ length: count }, (_, index) => index);
  const ids = await mapWithConcurrency(indexes, MAX_CONCURRENT_READS, (index) => read(client, "get_account_market_id_at", [account, BigInt(index + 1)]));
  return mapWithConcurrency(ids, MAX_CONCURRENT_READS, async (rawId: unknown) => {
    const marketId = requiredNumber(rawId, "account market id");
    const [positionRaw, payoutRaw, snapshot] = await Promise.all([
      read(client, "get_position_by_account", [BigInt(marketId), account]),
      read(client, "preview_payout_by_account", [BigInt(marketId), account]),
      marketSnapshot(client, marketId),
    ]);
    return { marketId, position: normalizePosition(positionRaw), payoutWei: toAmount(payoutRaw), snapshot };
  });
}

async function history(client: GenLayerClient, marketId: number) {
  const count = Math.min(requiredNumber(await read(client, "get_price_observation_count", [BigInt(marketId)]), "price observation count"), MAX_POINTS);
  if (count === 0) return [];
  const start = Math.max(1, count - MAX_POINTS + 1);
  const offsets = Array.from({ length: count - start + 1 }, (_, offset) => offset);
  const points = await mapWithConcurrency(offsets, MAX_CONCURRENT_READS, (offset) => read(client, "get_price_observation", [BigInt(marketId), BigInt(start + offset)]));
  return points.map(normalizeObservation).map((point) => {
    if (point.price_0_bps > 10000 || point.price_1_bps > 10000 || point.price_0_bps + point.price_1_bps !== 10000) {
      throw new Error("Contract response integrity check failed: invalid historical price complement.");
    }
    return point;
  });
}

async function sourceEvidence(client: GenLayerClient, marketId: number) {
  const count = Math.min(requiredNumber(await read(client, "get_source_observation_count", [BigInt(marketId)]), "source observation count"), MAX_SOURCE_POINTS);
  if (count === 0) return [];
  const indexes = Array.from({ length: count }, (_, index) => index);
  const points = await mapWithConcurrency(indexes, MAX_CONCURRENT_READS, (index) => read(client, "get_source_observation", [BigInt(marketId), BigInt(index + 1)]));
  return points.map(normalizeSourceObservation);
}

export async function POST(request: Request) {
  const limited = rateLimitResponse(request);
  if (limited) return limited;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ ok: false, error: "Request body is too large." }, 413);
  }
  let body: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_REQUEST_BYTES) return json({ ok: false, error: "Request body is too large." }, 413);
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ ok: false, error: "A JSON object is required." }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid JSON request." }, 400);
  }

  try {
    const client = await loadClient();
    const action = String(body.action ?? "").trim();
    if (!/^[a-z_]{1,32}$/.test(action)) return json({ ok: false, error: "A valid API action is required." }, 400);
    if (action === "markets") {
      const page = await listMarketIds(client, toNumber(body.cursor), toNumber(body.limit) || MAX_MARKETS);
      return json({ ok: true, markets: await snapshots(client, page.ids), nextCursor: page.nextCursor, total: page.total });
    }
    if (action === "snapshot") {
      const marketId = toNumber(body.marketId);
      if (marketId < 1 || marketId > 1000000) return json({ ok: false, error: "Invalid market id." }, 400);
      return json({ ok: true, snapshot: await marketSnapshot(client, marketId) });
    }
    if (action === "history") {
      const marketId = toNumber(body.marketId);
      if (marketId < 1 || marketId > 1000000) return json({ ok: false, error: "Invalid market id." }, 400);
      return json({ ok: true, history: await history(client, marketId) });
    }
    if (action === "sources") {
      const marketId = toNumber(body.marketId);
      if (marketId < 1 || marketId > 1000000) return json({ ok: false, error: "Invalid market id." }, 400);
      return json({ ok: true, sources: await sourceEvidence(client, marketId) });
    }
    if (action === "portfolio") {
      const account = String(body.account ?? "").trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(account)) return json({ ok: false, error: "A valid wallet address is required." }, 400);
      return json({ ok: true, portfolio: await portfolio(client, account) });
    }
    return json({ ok: false, error: `Unsupported API action: ${action}. Wallet writes are signed in the browser.` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const knownError = /unknown market|index out of range|invalid outcome|no position/.test(message);
    return json({
      ok: false,
      error: knownError ? message : "Contract bridge unavailable. Retry shortly.",
      configured: Boolean(CONTRACT_ADDRESS),
    }, knownError ? 404 : 502);
  }
}
