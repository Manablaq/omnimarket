import { testnetBradbury } from "genlayer-js/chains";

type GenLayerSdk = typeof import("genlayer-js");
type GenLayerClient = ReturnType<GenLayerSdk["createClient"]>;
type ReadContractRequest = Parameters<GenLayerClient["readContract"]>[0];
type ContractAddress = ReadContractRequest["address"];
type ContractArgs = NonNullable<ReadContractRequest["args"]>;

const CONTRACT_ADDRESS = process.env.GENLAYER_OMNIMARKET_CONTRACT_ADDRESS ?? "";
const MAX_MARKETS = 50;
const MAX_POINTS = 120;
const MAX_SOURCE_POINTS = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return 0;
}

function toAmount(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value).toString();
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return "0";
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
    market_id: toNumber(recordValue(value, ["market_id"], 0)),
    creator: String(recordValue(value, ["creator"], 1) ?? ""),
    title: String(recordValue(value, ["title"], 2) ?? ""),
    outcome_0: String(recordValue(value, ["outcome_0"], 3) ?? ""),
    outcome_1: String(recordValue(value, ["outcome_1"], 4) ?? ""),
    rules: String(recordValue(value, ["rules"], 5) ?? ""),
    source_uris: [0, 1, 2, 3, 4].map((sourceIndex) => String(
      recordValue(value, [`source_${sourceIndex}_uri`, "source_uri"], 6 + sourceIndex) ?? "",
    )),
    close_time: toNumber(recordValue(value, ["close_time"], 11)),
    status: toNumber(recordValue(value, ["status"], 12)),
    created_at: toNumber(recordValue(value, ["created_at"], 13)),
    liquidity_units: toAmount(recordValue(value, ["liquidity_units"], 14)),
    total_0: toAmount(recordValue(value, ["total_0"], 15)),
    total_1: toAmount(recordValue(value, ["total_1"], 16)),
    fee_units: toAmount(recordValue(value, ["fee_units"], 17)),
    winning_outcome: toNumber(recordValue(value, ["winning_outcome"], 18)),
    confidence: toNumber(recordValue(value, ["confidence"], 19)),
    reason_code: String(recordValue(value, ["reason_code"], 20) ?? ""),
    summary: String(recordValue(value, ["summary"], 21) ?? ""),
    resolved_at: toNumber(recordValue(value, ["resolved_at"], 22)),
  };
}

function normalizePosition(value: unknown) {
  return {
    owner: String(recordValue(value, ["owner"], 0) ?? ""),
    market_id: toNumber(recordValue(value, ["market_id"], 1)),
    stake_0: toAmount(recordValue(value, ["stake_0"], 2)),
    stake_1: toAmount(recordValue(value, ["stake_1"], 3)),
    gross_stake: toAmount(recordValue(value, ["gross_stake"], 4)),
    claimed: Boolean(recordValue(value, ["claimed"], 5)),
  };
}

function normalizeObservation(value: unknown) {
  return {
    observed_at: toNumber(recordValue(value, ["observed_at"], 0)),
    price_0_bps: toNumber(recordValue(value, ["price_0_bps"], 1)),
    price_1_bps: toNumber(recordValue(value, ["price_1_bps"], 2)),
    total_0: toAmount(recordValue(value, ["total_0"], 3)),
    total_1: toAmount(recordValue(value, ["total_1"], 4)),
  };
}

function normalizeSourceObservation(value: unknown) {
  return {
    market_id: toNumber(recordValue(value, ["market_id"], 0)),
    source_index: toNumber(recordValue(value, ["source_index"], 1)),
    uri: String(recordValue(value, ["uri"], 2) ?? ""),
    status: String(recordValue(value, ["status"], 3) ?? ""),
    vote: toNumber(recordValue(value, ["vote"], 4)),
    confidence: toNumber(recordValue(value, ["confidence"], 5)),
    digest: String(recordValue(value, ["digest"], 6) ?? ""),
    reason_code: String(recordValue(value, ["reason_code"], 7) ?? ""),
    summary: String(recordValue(value, ["summary"], 8) ?? ""),
    checked_at: toNumber(recordValue(value, ["checked_at"], 9)),
  };
}

async function loadClient(): Promise<GenLayerClient> {
  if (!CONTRACT_ADDRESS) throw new Error("Set GENLAYER_OMNIMARKET_CONTRACT_ADDRESS before using live contract reads.");
  const sdk = await import("genlayer-js");
  return sdk.createClient({ chain: testnetBradbury } as Parameters<GenLayerSdk["createClient"]>[0]);
}

function contractAddress(): ContractAddress {
  return CONTRACT_ADDRESS as ContractAddress;
}

function contractArgs(values: unknown[]): ContractArgs {
  return values as ContractArgs;
}

async function read(client: GenLayerClient, functionName: string, args: unknown[] = []) {
  return client.readContract({
    address: contractAddress(),
    functionName,
    args: contractArgs(args),
  });
}

async function listMarketIds(client: GenLayerClient, cursor = 0, limit = MAX_MARKETS) {
  const count = toNumber(await read(client, "get_market_count"));
  const start = Math.max(0, Math.min(cursor, count));
  const pageSize = Math.max(1, Math.min(limit, MAX_MARKETS));
  const end = Math.min(count, start + pageSize);
  if (start >= end) return { ids: [], nextCursor: null as number | null, total: count };
  const ids = await Promise.all(Array.from({ length: end - start }, (_, index) => read(client, "get_market_id_at", [BigInt(start + index + 1)])));
  return { ids: ids.map((value: unknown) => toNumber(value)).filter((id: number) => id > 0), nextCursor: end < count ? end : null, total: count };
}

async function marketSnapshot(client: GenLayerClient, marketId: number) {
  const [marketRaw, price0Raw, price1Raw] = await Promise.all([
    read(client, "get_market", [BigInt(marketId)]),
    read(client, "get_price_bps", [BigInt(marketId), 0]),
    read(client, "get_price_bps", [BigInt(marketId), 1]),
  ]);
  const market = normalizeMarket(marketRaw);
  return {
    market,
    price0Bps: toNumber(price0Raw),
    price1Bps: toNumber(price1Raw),
    volumeWei: (BigInt(market.total_0) + BigInt(market.total_1)).toString(),
    source: "contract" as const,
    updatedAt: Date.now(),
  };
}

async function snapshots(client: GenLayerClient, ids: number[]) {
  const results = await Promise.all(ids.map((id) => marketSnapshot(client, id)));
  return results.sort((a, b) => a.market.market_id - b.market.market_id);
}

async function portfolio(client: GenLayerClient, account: string) {
  const count = Math.min(toNumber(await read(client, "get_account_market_count", [account])), MAX_MARKETS);
  const ids = await Promise.all(Array.from({ length: count }, (_, index) => read(client, "get_account_market_id_at", [account, BigInt(index + 1)])));
  return Promise.all(ids.map(async (rawId: unknown) => {
    const marketId = toNumber(rawId);
    const [positionRaw, payoutRaw, snapshot] = await Promise.all([
      read(client, "get_position_by_account", [BigInt(marketId), account]),
      read(client, "preview_payout_by_account", [BigInt(marketId), account]),
      marketSnapshot(client, marketId),
    ]);
    return { marketId, position: normalizePosition(positionRaw), payoutWei: toAmount(payoutRaw), snapshot };
  }));
}

async function history(client: GenLayerClient, marketId: number) {
  const count = Math.min(toNumber(await read(client, "get_price_observation_count", [BigInt(marketId)])), MAX_POINTS);
  if (count === 0) return [];
  const start = Math.max(1, count - MAX_POINTS + 1);
  const points = await Promise.all(Array.from({ length: count - start + 1 }, (_, offset) => read(client, "get_price_observation", [BigInt(marketId), BigInt(start + offset)])));
  return points.map(normalizeObservation);
}

async function sourceEvidence(client: GenLayerClient, marketId: number) {
  const count = Math.min(toNumber(await read(client, "get_source_observation_count", [BigInt(marketId)])), MAX_SOURCE_POINTS);
  if (count === 0) return [];
  const points = await Promise.all(Array.from({ length: count }, (_, index) => read(client, "get_source_observation", [BigInt(marketId), BigInt(index + 1)])));
  return points.map(normalizeSourceObservation);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid JSON request." }, 400);
  }

  try {
    const client = await loadClient();
    const action = String(body.action ?? "");
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
    return json({ ok: false, error: error instanceof Error ? error.message : "Contract bridge failed.", configured: Boolean(CONTRACT_ADDRESS) }, 500);
  }
}
