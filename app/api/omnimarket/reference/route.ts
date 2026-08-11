const SUPPORTED_ASSETS = new Set(["BTC", "ETH", "BNB", "SOL"]);
const MAX_CANDLES = 120;
const REFERENCE_TIMEOUT_MS = 8000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const MAX_RATE_LIMIT_KEYS = 2_000;

type RateLimitEntry = { count: number; resetAt: number };

const rateLimits = new Map<string, RateLimitEntry>();

export const maxDuration = 12;

function response(body: unknown, status = 200, cacheControl = status >= 400 ? "no-store" : "s-maxage=10, stale-while-revalidate=20") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": cacheControl,
    },
  });
}

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "anonymous";
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

function rateLimitRetryAfter(request: Request) {
  const now = Date.now();
  const key = clientKey(request);
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.delete(key);
    makeRateLimitCapacity(now);
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return 0;
  }
  current.count += 1;
  if (current.count <= RATE_LIMIT_MAX_REQUESTS) return 0;
  return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
}

function number(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchWithTimeout(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REFERENCE_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const retryAfter = rateLimitRetryAfter(request);
  if (retryAfter) {
    return new Response(JSON.stringify({ ok: false, error: "Too many reference-data requests. Try again shortly." }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "retry-after": String(retryAfter),
      },
    });
  }
  const url = new URL(request.url);
  const asset = (url.searchParams.get("asset") ?? "BTC").trim().toUpperCase();
  const interval = url.searchParams.get("interval") ?? "1m";
  const limit = Math.max(1, Math.min(MAX_CANDLES, Math.trunc(number(url.searchParams.get("limit"), 60))));
  if (!SUPPORTED_ASSETS.has(asset)) return response({ ok: false, error: "Unsupported reference asset." }, 400);
  if (!["1m", "5m", "15m", "1h"].includes(interval)) return response({ ok: false, error: "Unsupported reference interval." }, 400);

  const symbol = `${asset}USDT`;
  try {
    const [tickerResponse, candlesResponse] = await Promise.all([
      fetchWithTimeout(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, { cache: "no-store" }),
      fetchWithTimeout(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, { cache: "no-store" }),
    ]);
    if (!tickerResponse.ok || !candlesResponse.ok) throw new Error("Reference venue did not return a successful response.");
    const ticker = (await tickerResponse.json()) as { lastPrice?: string; priceChangePercent?: string };
    const rawCandles = (await candlesResponse.json()) as unknown[][];
    const candles = rawCandles.map((candle) => ({
      time: Number(candle[0]),
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: Number(candle[5]),
    }));
    if (!candles.length || candles.some((candle) => Object.values(candle).some((value) => !Number.isFinite(value)))) {
      throw new Error("Reference venue returned invalid candle data.");
    }
    const price = Number(ticker.lastPrice ?? NaN);
    const change24h = Number(ticker.priceChangePercent ?? NaN);
    if (!Number.isFinite(price) || !Number.isFinite(change24h)) throw new Error("Reference venue returned invalid ticker data.");
    return response({
      ok: true,
      source: "Binance public market data",
      settlement: "Reference data only. Settlement is determined by the five on-chain evidence sources and GenLayer consensus.",
      symbol,
      interval,
      price,
      change24h,
      candles,
      updatedAt: Date.now(),
    });
  } catch {
    return response({ ok: false, error: "Reference data temporarily unavailable." }, 502);
  }
}
