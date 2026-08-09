type GenLayerSdk = typeof import("genlayer-js");
type GenLayerClient = ReturnType<GenLayerSdk["createClient"]>;
type ReadContractRequest = Parameters<GenLayerClient["readContract"]>[0];
type WriteContractRequest = Parameters<GenLayerClient["writeContract"]>[0];
type ContractAddress = ReadContractRequest["address"];
type ContractArgs = NonNullable<ReadContractRequest["args"]>;

type MarketTuple = {
  market_id?: unknown;
  creator?: unknown;
  title?: unknown;
  outcome_0?: unknown;
  outcome_1?: unknown;
  rules?: unknown;
  evidence_uri?: unknown;
  close_time?: unknown;
  status?: unknown;
  created_at?: unknown;
  liquidity_units?: unknown;
  total_0?: unknown;
  total_1?: unknown;
  fee_units?: unknown;
  winning_outcome?: unknown;
  confidence?: unknown;
  reason_code?: unknown;
  summary?: unknown;
  resolved_at?: unknown;
};

const CONTRACT_ADDRESS = process.env.GENLAYER_OMNIMARKET_CONTRACT_ADDRESS ?? "";
const RPC_URL = process.env.GENLAYER_RPC_URL ?? "";
const CHAIN_ID = process.env.GENLAYER_CHAIN_ID ?? "bradbury";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function normalizeMarket(value: unknown) {
  const raw = (Array.isArray(value) ? {} : value ?? {}) as MarketTuple;
  return {
    market_id: toNumber(raw.market_id),
    creator: String(raw.creator ?? ""),
    title: String(raw.title ?? ""),
    outcome_0: String(raw.outcome_0 ?? ""),
    outcome_1: String(raw.outcome_1 ?? ""),
    rules: String(raw.rules ?? ""),
    evidence_uri: String(raw.evidence_uri ?? ""),
    close_time: toNumber(raw.close_time),
    status: toNumber(raw.status),
    created_at: toNumber(raw.created_at),
    liquidity_units: toNumber(raw.liquidity_units),
    total_0: toNumber(raw.total_0),
    total_1: toNumber(raw.total_1),
    fee_units: toNumber(raw.fee_units),
    winning_outcome: toNumber(raw.winning_outcome),
    confidence: toNumber(raw.confidence),
    reason_code: String(raw.reason_code ?? ""),
    summary: String(raw.summary ?? ""),
    resolved_at: toNumber(raw.resolved_at),
  };
}

async function loadClient(): Promise<GenLayerClient> {
  if (!CONTRACT_ADDRESS || !RPC_URL) {
    throw new Error("Set GENLAYER_OMNIMARKET_CONTRACT_ADDRESS and GENLAYER_RPC_URL before using live contract reads.");
  }

  const sdk = await import("genlayer-js");
  return sdk.createClient({
    endpoint: RPC_URL,
    chainId: CHAIN_ID,
  } as Parameters<GenLayerSdk["createClient"]>[0]);
}

function contractAddress(): ContractAddress {
  return CONTRACT_ADDRESS as ContractAddress;
}

function contractArgs(values: unknown[]): ContractArgs {
  return values as ContractArgs;
}

async function snapshot(marketId: number) {
  const client = await loadClient();
  const [marketRaw, price0Raw, price1Raw] = await Promise.all([
    client.readContract({
      address: contractAddress(),
      functionName: "get_market",
      args: contractArgs([BigInt(marketId)]),
    }),
    client.readContract({
      address: contractAddress(),
      functionName: "get_price_bps",
      args: contractArgs([BigInt(marketId), 0]),
    }),
    client.readContract({
      address: contractAddress(),
      functionName: "get_price_bps",
      args: contractArgs([BigInt(marketId), 1]),
    }),
  ]);

  const market = normalizeMarket(marketRaw);
  return {
    market,
    price0Bps: toNumber(price0Raw),
    price1Bps: toNumber(price1Raw),
    volumeUnits: market.total_0 + market.total_1,
    source: "contract",
    updatedAt: Date.now(),
  };
}

async function writeContract(functionName: string, args: unknown[]) {
  const client = await loadClient();
  const request: WriteContractRequest = {
    address: contractAddress(),
    functionName,
    args: contractArgs(args),
    value: BigInt(0),
  };
  const result = await client.writeContract(request);
  if (typeof result === "string") return result;
  return JSON.stringify(result);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Invalid JSON request." }, 400);
  }

  const action = String(body.action ?? "");
  try {
    if (action === "snapshot") {
      return json({
        ok: true,
        snapshot: await snapshot(toNumber(body.marketId || 1)),
      });
    }

    if (action === "buy_position") {
      const txHash = await writeContract("buy_position", [
        BigInt(toNumber(body.marketId)),
        toNumber(body.outcomeIndex),
        BigInt(toNumber(body.stakeUnits)),
      ]);
      return json({ ok: true, txHash });
    }

    if (action === "create_market") {
      const txHash = await writeContract("create_market", [
        String(body.title ?? ""),
        String(body.outcome0 ?? ""),
        String(body.outcome1 ?? ""),
        String(body.rules ?? ""),
        String(body.evidenceUri ?? ""),
        BigInt(toNumber(body.closeTime)),
        BigInt(toNumber(body.liquidityUnits)),
      ]);
      return json({ ok: true, txHash });
    }

    if (action === "admin_resolve_for_studio") {
      const txHash = await writeContract("admin_resolve_for_studio", [
        BigInt(toNumber(body.marketId)),
        toNumber(body.winningOutcome),
        toNumber(body.confidence),
        String(body.reasonCode ?? ""),
        String(body.summary ?? ""),
      ]);
      return json({ ok: true, txHash });
    }

    return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "Contract bridge failed.",
      configured: Boolean(CONTRACT_ADDRESS && RPC_URL),
    });
  }
}
