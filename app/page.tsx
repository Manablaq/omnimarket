"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "genlayer-js";
import { testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

type MarketStatus = 0 | 1 | 2 | 3 | 4;
type NetworkName = "testnetBradbury" | "testnetAsimov";
type MarketFilter = "all" | "trading" | "settled";
type MarketSort = "newest" | "pool" | "closing";

type MarketRecord = {
  market_id: number;
  creator: string;
  title: string;
  outcome_0: string;
  outcome_1: string;
  rules: string;
  source_uris: string[];
  close_time: number;
  status: MarketStatus;
  created_at: number;
  liquidity_units: string;
  total_0: string;
  total_1: string;
  fee_units: string;
  winning_outcome: number;
  confidence: number;
  reason_code: string;
  summary: string;
  resolved_at: number;
};

type MarketSnapshot = {
  market: MarketRecord;
  price0Bps: number;
  price1Bps: number;
  poolTotalWei: string;
  source: "contract";
  updatedAt: number;
};

type PricePoint = {
  observed_at: number;
  price_0_bps: number;
  price_1_bps: number;
  total_0: string;
  total_1: string;
};

type Position = {
  owner: string;
  market_id: number;
  stake_0: string;
  stake_1: string;
  gross_stake: string;
  claimed: boolean;
};

type SourceObservation = {
  market_id: number;
  source_index: number;
  uri: string;
  status: string;
  vote: number;
  confidence: number;
  digest: string;
  reason_code: string;
  summary: string;
  checked_at: number;
};

type ReferenceCandle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type ReferenceData = {
  ok: true;
  source: string;
  settlement: string;
  symbol: string;
  interval: string;
  price: number;
  change24h: number;
  candles: ReferenceCandle[];
  updatedAt: number;
};

type PortfolioItem = {
  marketId: number;
  position: Position;
  payoutWei: string;
  snapshot: MarketSnapshot;
};

type ActivityItem = { label: string; detail: string; tone: "good" | "warn" | "info" };
type ApiResponse =
  | { ok: true; markets?: MarketSnapshot[]; snapshot?: MarketSnapshot; history?: PricePoint[]; sources?: SourceObservation[]; portfolio?: PortfolioItem[]; nextCursor?: number | null; total?: number }
  | { ok: false; error: string; configured?: boolean };

const OMNIMARKET_ADDRESS = (process.env.NEXT_PUBLIC_OMNIMARKET_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const WEI_PER_GEN = BigInt("1000000000000000000");
const MIN_STAKE_WEI = WEI_PER_GEN;
const MAX_STAKE_WEI = BigInt("10000000000000000000");
const MIN_SEED_WEI = BigInt("2000000000000000000");
const SETTLEMENT_SAFETY_DELAY_SECONDS = 120;
const LOCKED_SETTLEMENT_TIMEOUT_SECONDS = 86400;

function createEmptyMarketForm() {
  return {
    title: "",
    outcome0: "",
    outcome1: "",
    rules: "",
    sources: ["", "", "", "", ""],
    closeTime: "",
    liquidity: "",
  };
}

function statusLabel(status: MarketStatus) {
  if (status === 1) return "Trading";
  if (status === 2) return "Locked";
  if (status === 3) return "Resolved";
  if (status === 4) return "Void";
  return "Draft";
}

function statusTone(status: MarketStatus) {
  return status === 1 ? "good" : status === 4 ? "warn" : "info";
}

function sourceTone(source: SourceObservation) {
  if (source.status !== "valid") return "unavailable";
  if (source.vote === 1) return "outcome-0";
  if (source.vote === 2) return "outcome-1";
  return "inconclusive";
}

function formatBps(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

function formatGen(value: string | number | bigint, precision = 4) {
  try {
    const amount = typeof value === "bigint" ? value : BigInt(String(value));
    const whole = amount / WEI_PER_GEN;
    const fraction = (amount % WEI_PER_GEN).toString().padStart(18, "0").slice(0, precision);
    return `${whole.toString()}.${fraction} GEN`;
  } catch {
    return "0.0000 GEN";
  }
}

function parseGen(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,18})?$/.test(normalized)) throw new Error("Enter a valid GEN amount with up to 18 decimals.");
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * WEI_PER_GEN + BigInt(fraction.padEnd(18, "0") || "0");
}

function estimateImmediatePayout(stakeWei: bigint, outcome0Wei: bigint, outcome1Wei: bigint, side: 0 | 1) {
  // Mirrors V2: the fee is removed before a position enters its selected pool.
  const feeWei = stakeWei * BigInt(75) / BigInt(10_000);
  const netStakeWei = stakeWei - feeWei;
  if (netStakeWei <= BigInt(0)) return BigInt(0);

  const selectedPoolWei = side === 0 ? outcome0Wei : outcome1Wei;
  const finalSelectedPoolWei = selectedPoolWei + netStakeWei;
  const finalTotalPoolWei = outcome0Wei + outcome1Wei + netStakeWei;
  return netStakeWei * finalTotalPoolWei / finalSelectedPoolWei;
}

function formatDate(seconds: number) {
  if (!seconds) return "Not set";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(seconds * 1000));
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function networkLabel(network: NetworkName) {
  return network === "testnetBradbury" ? "Bradbury" : "Asimov";
}

function chartPath(points: number[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M 0 ${(100 - points[0] / 100).toFixed(2)} L 100 ${(100 - points[0] / 100).toFixed(2)}`;
  return points.map((point, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = 100 - point / 100;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function referenceChartPath(points: number[]) {
  const finite = points.filter(Number.isFinite);
  if (finite.length === 0) return "";
  const minimum = Math.min(...finite);
  const maximum = Math.max(...finite);
  const range = maximum - minimum;
  const normalized = points.map((point) => {
    if (!Number.isFinite(point)) return 5000;
    return range === 0 ? 5000 : ((point - minimum) / range) * 10000;
  });
  return chartPath(normalized);
}

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};
type EthereumWindow = Window & { ethereum?: WalletProvider };

function walletProvider() {
  return (window as EthereumWindow).ethereum;
}

const walletChains = { testnetBradbury, testnetAsimov };

function expectedChainId(network: NetworkName) {
  return `0x${walletChains[network].id.toString(16)}`;
}

function consensusAddress(network: NetworkName) {
  return walletChains[network].consensusMainContract?.address ?? "";
}

async function networkMatches(provider: WalletProvider, network: NetworkName) {
  const chainId = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  if (chainId !== expectedChainId(network)) return false;
  const address = consensusAddress(network);
  if (!address) return false;
  const code = await provider.request({ method: "eth_getCode", params: [address, "latest"] });
  return typeof code === "string" && code !== "0x" && code.length > 2;
}

async function detectWalletNetwork(provider: WalletProvider): Promise<NetworkName | null> {
  for (const network of ["testnetBradbury", "testnetAsimov"] as NetworkName[]) {
    if (await networkMatches(provider, network)) return network;
  }
  return null;
}

function walletErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: number }).code : undefined;
  if (code === 4001) return "The wallet request was rejected.";
  if (code === 4900) return "The wallet provider is disconnected. Reconnect it, then try again.";
  if (code === 4901) return "The wallet is disconnected from the selected GenLayer network.";
  if (code === 4902) return "Bradbury is not configured in this wallet yet.";
  if (error instanceof Error && error.message) return error.message;
  return "The wallet did not approve the request.";
}

async function ensureWalletNetwork(provider: WalletProvider, network: NetworkName) {
  const chain = walletChains[network];
  const chainId = expectedChainId(network);
  const currentChainId = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  if (currentChainId === chainId && await networkMatches(provider, network)) return chainId;
  if (currentChainId === chainId) {
    throw new Error(`This wallet is using another GenLayer network with the same chain ID. Select the ${chain.name} RPC manually in the wallet, then retry.`);
  }

  const chainParams = {
    chainId,
    chainName: chain.name,
    rpcUrls: [...chain.rpcUrls.default.http],
    nativeCurrency: chain.nativeCurrency,
    blockExplorerUrls: chain.blockExplorers?.default.url ? [chain.blockExplorers.default.url] : [],
  };

  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: number }).code : undefined;
    if (code !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [chainParams] });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  }

  const verifiedChainId = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
  if (verifiedChainId !== chainId) throw new Error(`Wallet is still on chain ${parseInt(verifiedChainId, 16)}. Switch to ${chain.name} to continue.`);
  if (!await networkMatches(provider, network)) throw new Error(`Wallet is on chain ID ${parseInt(verifiedChainId, 16)}, but not the ${chain.name} network. Select its RPC endpoint in the wallet.`);
  return verifiedChainId;
}

async function callOmniMarketApi(action: string, payload: Record<string, unknown> = {}): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("/api/omnimarket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
      cache: "no-store",
      signal: controller.signal,
    });
    const result = await response.json() as ApiResponse;
    if (!response.ok && result.ok) throw new Error(`Contract bridge returned HTTP ${response.status}.`);
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("Contract read timed out. Retry shortly.");
    if (error instanceof SyntaxError) throw new Error("Contract bridge returned invalid JSON.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function callReferenceApi(asset: string): Promise<ReferenceData> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`/api/omnimarket/reference?asset=${encodeURIComponent(asset)}&interval=1m&limit=60`, { cache: "no-store", signal: controller.signal });
    const result = await response.json() as ReferenceData | { ok: false; error: string };
    if (!response.ok || !result.ok) throw new Error("error" in result ? result.error : "Reference data unavailable.");
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("Reference data timed out. Retry shortly.");
    if (error instanceof SyntaxError) throw new Error("Reference feed returned invalid JSON.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function Home() {
  const [snapshots, setSnapshots] = useState<MarketSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState(1);
  const [history, setHistory] = useState<Record<number, PricePoint[]>>({});
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [search, setSearch] = useState("");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [marketSort, setMarketSort] = useState<MarketSort>("newest");
  const [side, setSide] = useState<0 | 1>(0);
  const [stakeGen, setStakeGen] = useState("1.0000");
  const [wallet, setWallet] = useState("");
  const [walletChainId, setWalletChainId] = useState("");
  const [walletVerified, setWalletVerified] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkName>("testnetBradbury");
  const [marketReadState, setMarketReadState] = useState<"loading" | "ready" | "error">("loading");
  const [marketLoadError, setMarketLoadError] = useState("");
  const [sourceAudit, setSourceAudit] = useState<Record<number, SourceObservation[]>>({});
  const [referenceAsset, setReferenceAsset] = useState("BTC");
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null);
  const [referenceError, setReferenceError] = useState("");
  const [marketCursor, setMarketCursor] = useState<number | null>(null);
  const [marketTotal, setMarketTotal] = useState(0);
  const [busy, setBusy] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [notice, setNotice] = useState<ActivityItem>({ label: "Contract bridge", detail: "Reading market discovery from Bradbury.", tone: "info" });
  const [marketForm, setMarketForm] = useState(createEmptyMarketForm);
  const walletPanelRef = useRef<HTMLDivElement>(null);

  const walletReady = Boolean(wallet && walletChainId && walletVerified && selectedNetwork === "testnetBradbury");
  const selected = snapshots.find((item) => item.market.market_id === selectedId) ?? snapshots[0];
  const selectedMarket = selected?.market;
  const selectedHistory = useMemo(() => selected ? history[selected.market.market_id] ?? [] : [], [history, selected]);
  const visibleMarkets = useMemo(() => snapshots
    .filter((item) => item.market.title.toLowerCase().includes(search.toLowerCase()))
    .filter((item) => marketFilter === "all" || (marketFilter === "trading" ? item.market.status === 1 : item.market.status === 3 || item.market.status === 4))
    .sort((a, b) => {
      if (marketSort === "pool") {
        const aPool = BigInt(a.poolTotalWei);
        const bPool = BigInt(b.poolTotalWei);
        return bPool > aPool ? 1 : bPool < aPool ? -1 : 0;
      }
      if (marketSort === "closing") return a.market.close_time - b.market.close_time;
      return b.market.created_at - a.market.created_at;
    }), [marketFilter, marketSort, search, snapshots]);
  const selectedSources = selected ? sourceAudit[selected.market.market_id] ?? [] : [];
  const chartPoints = useMemo(() => selectedHistory.length > 0 ? selectedHistory : selected ? [{ observed_at: selected.updatedAt / 1000, price_0_bps: selected.price0Bps, price_1_bps: selected.price1Bps, total_0: selected.market.total_0, total_1: selected.market.total_1 }] : [], [selected, selectedHistory]);
  const yesPath = useMemo(() => chartPath(chartPoints.map((point) => point.price_0_bps)), [chartPoints]);
  const noPath = useMemo(() => chartPath(chartPoints.map((point) => point.price_1_bps)), [chartPoints]);
  const selectedOutcome = selected ? (side === 0 ? selected.market.outcome_0 : selected.market.outcome_1) : "";
  const selectedPrice = selected ? (side === 0 ? selected.price0Bps : selected.price1Bps) : 0;
  const indicativePayout = useMemo(() => {
    if (!selected || !/^\d+(\.\d{1,18})?$/.test(stakeGen.trim())) return null;
    try {
      return estimateImmediatePayout(
        parseGen(stakeGen),
        BigInt(selected.market.total_0),
        BigInt(selected.market.total_1),
        side,
      );
    } catch {
      return null;
    }
  }, [selected, side, stakeGen]);

  useEffect(() => {
    const tick = () => setCurrentTime(Math.floor(Date.now() / 1000));
    const initialTick = window.setTimeout(tick, 0);
    const clock = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(initialTick); window.clearInterval(clock); };
  }, []);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("is-visible")), { threshold: 0.12 });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [snapshots.length]);

  useEffect(() => {
    if (!walletMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (walletPanelRef.current && !walletPanelRef.current.contains(event.target as Node)) setWalletMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWalletMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [walletMenuOpen]);

  useEffect(() => {
    const provider = walletProvider();
    if (!provider) return;
    const sync = async () => {
      try {
        const accounts = await provider.request({ method: "eth_accounts" }) as string[];
        const account = accounts[0] ?? "";
        const detectedNetwork = account ? await detectWalletNetwork(provider) : null;
        const normalizedChainId = String(await provider.request({ method: "eth_chainId" }) ?? "").toLowerCase();
        setWallet(account);
        setWalletChainId(normalizedChainId);
        setSelectedNetwork(detectedNetwork ?? "testnetBradbury");
        setWalletVerified(Boolean(account && detectedNetwork === "testnetBradbury"));
      } catch {
        setWallet("");
        setWalletChainId("");
        setWalletVerified(false);
      }
    };
    const onAccounts = (accounts: unknown) => {
      const account = Array.isArray(accounts) ? String(accounts[0] ?? "") : "";
      if (!account) { setWallet(""); setWalletChainId(""); setWalletVerified(false); setPortfolio([]); setWalletMenuOpen(false); return; }
      setPortfolio([]);
      setWalletVerified(false);
      setWalletMenuOpen(false);
      void sync();
    };
    const onChain = () => {
      setPortfolio([]);
      setWalletVerified(false);
      setWalletMenuOpen(false);
      void sync();
    };
    const onDisconnect = () => {
      setWallet("");
      setWalletChainId("");
      setWalletVerified(false);
      setPortfolio([]);
      setWalletMenuOpen(false);
      setNotice({
        label: "Wallet disconnected",
        detail: "The wallet provider disconnected from its chain. Reconnect before signing a transaction.",
        tone: "warn",
      });
    };
    void sync();
    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    provider.on?.("disconnect", onDisconnect);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, []);

  const refreshMarkets = useCallback(async (quiet = false) => {
    if (!quiet) setBusy("refresh");
    // Keep an already-rendered market usable while the background poll runs.
    setMarketReadState((current) => quiet && current === "ready" ? current : "loading");
    try {
      const result = await callOmniMarketApi("markets", { cursor: 0, limit: 24 });
      if (!result.ok || !result.markets) throw new Error(result.ok ? "The contract returned no markets." : result.error);
      setSnapshots(result.markets);
      setMarketCursor(result.nextCursor ?? null);
      setMarketTotal(result.total ?? result.markets.length);
      setMarketLoadError("");
      setMarketReadState("ready");
      if (result.markets.length > 0 && !result.markets.some((item) => item.market.market_id === selectedId)) setSelectedId(result.markets[0].market.market_id);
      setNotice({ label: "Live market index", detail: `${result.markets.length} market${result.markets.length === 1 ? "" : "s"} loaded from the deployed contract.`, tone: "good" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The deployed contract could not be read.";
      setMarketLoadError(detail);
      setMarketReadState((current) => quiet && current === "ready" ? current : "error");
      setNotice({ label: "Contract read failed", detail, tone: "warn" });
    } finally {
      if (!quiet) setBusy("");
    }
  }, [selectedId]);

  const loadMoreMarkets = useCallback(async () => {
    if (marketCursor === null) return;
    setBusy("more-markets");
    try {
      const result = await callOmniMarketApi("markets", { cursor: marketCursor, limit: 24 });
      if (!result.ok || !result.markets) throw new Error(result.ok ? "The contract returned no markets." : result.error);
      setSnapshots((current) => [...current, ...result.markets!].filter((item, index, all) => all.findIndex((candidate) => candidate.market.market_id === item.market.market_id) === index));
      setMarketCursor(result.nextCursor ?? null);
      setMarketTotal(result.total ?? 0);
    } catch (error) {
      setNotice({ label: "Market index failed", detail: error instanceof Error ? error.message : "More markets could not be loaded.", tone: "warn" });
    } finally {
      setBusy("");
    }
  }, [marketCursor]);

  const refreshSelected = useCallback(async (marketId: number, quiet = true) => {
    try {
      const result = await callOmniMarketApi("snapshot", { marketId });
      if (!result.ok || !result.snapshot) throw new Error(result.ok ? "No snapshot returned." : result.error);
      setSnapshots((current) => [...current.filter((item) => item.market.market_id !== marketId), result.snapshot!].sort((a, b) => a.market.market_id - b.market.market_id));
      if (!quiet) setNotice({ label: "Live contract read", detail: `Market ${marketId} updated from accepted contract state.`, tone: "good" });
    } catch (error) {
      setNotice({ label: "Market refresh failed", detail: error instanceof Error ? error.message : "The market could not be refreshed.", tone: "warn" });
    }
  }, []);

  const refreshHistory = useCallback(async (marketId: number) => {
    try {
      const result = await callOmniMarketApi("history", { marketId });
      if (!result.ok || !result.history) throw new Error(result.ok ? "No contract observations returned." : result.error);
      setHistory((current) => ({ ...current, [marketId]: result.history! }));
    } catch (error) {
      setNotice({ label: "Chart read failed", detail: error instanceof Error ? error.message : "The contract history could not be read.", tone: "warn" });
    }
  }, []);

  const refreshSources = useCallback(async (marketId: number) => {
    try {
      const result = await callOmniMarketApi("sources", { marketId });
      if (!result.ok || !result.sources) throw new Error(result.ok ? "No source audit returned." : result.error);
      setSourceAudit((current) => ({ ...current, [marketId]: result.sources! }));
    } catch (error) {
      setNotice({ label: "Source audit failed", detail: error instanceof Error ? error.message : "The source receipts could not be read.", tone: "warn" });
    }
  }, []);

  const refreshReference = useCallback(async (asset: string) => {
    try {
      const result = await callReferenceApi(asset);
      setReferenceData(result);
      setReferenceError("");
    } catch (error) {
      setReferenceData(null);
      setReferenceError(error instanceof Error ? error.message : "Reference data unavailable.");
    }
  }, []);

  const refreshPortfolio = useCallback(async (account: string) => {
    if (!account) return;
    try {
      const result = await callOmniMarketApi("portfolio", { account });
      if (!result.ok || !result.portfolio) throw new Error(result.ok ? "No portfolio returned." : result.error);
      setPortfolio(result.portfolio);
    } catch (error) {
      setPortfolio([]);
      setNotice({ label: "Portfolio read failed", detail: error instanceof Error ? error.message : "The contract portfolio could not be read.", tone: "warn" });
    }
  }, []);

  useEffect(() => {
    const initialRead = window.setTimeout(() => { void refreshMarkets(true); }, 0);
    const interval = window.setInterval(() => { void refreshMarkets(true); }, 30000);
    return () => { window.clearTimeout(initialRead); window.clearInterval(interval); };
  }, [refreshMarkets]);

  useEffect(() => {
    if (!selected) return;
    const id = selected.market.market_id;
    const timer = window.setTimeout(() => { void refreshHistory(id); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshHistory, selected]);

  useEffect(() => {
    if (!selected) return;
    const id = selected.market.market_id;
    const timer = window.setTimeout(() => { void refreshSources(id); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshSources, selected]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshReference(referenceAsset); }, 0);
    const interval = window.setInterval(() => { void refreshReference(referenceAsset); }, 30000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [referenceAsset, refreshReference]);

  useEffect(() => {
    if (!wallet) return;
    const timer = window.setTimeout(() => { void refreshPortfolio(wallet); }, 0);
    return () => window.clearTimeout(timer);
  }, [wallet, refreshPortfolio]);

  useEffect(() => {
    if (!selected) return;
    const interval = window.setInterval(() => {
      const id = selected.market.market_id;
      void refreshSelected(id);
      void refreshHistory(id);
      void refreshSources(id);
    }, 12000);
    return () => window.clearInterval(interval);
  }, [refreshHistory, refreshSelected, refreshSources, selected]);

  async function connectWallet(network: NetworkName = selectedNetwork) {
    const provider = walletProvider();
    if (!provider) { setNotice({ label: "Wallet unavailable", detail: "Install a browser wallet that supports GenLayer networks.", tone: "warn" }); return; }
    setWalletBusy(true);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const account = accounts[0] ?? "";
      if (!account) throw new Error("The wallet returned no account.");
      const chainId = await ensureWalletNetwork(provider, network);
      setWallet(account); setWalletChainId(chainId); setWalletVerified(true); setSelectedNetwork(network); setWalletMenuOpen(false);
      setNotice({ label: "Wallet connected", detail: `${shortAddress(account)} is connected to ${networkLabel(network)}.`, tone: "good" });
    } catch (error) {
      setNotice({ label: "Wallet connection failed", detail: walletErrorMessage(error), tone: "warn" });
    } finally { setWalletBusy(false); }
  }

  async function copyWalletAddress() {
    if (!wallet) return;
    try { await navigator.clipboard.writeText(wallet); setCopiedAddress(true); window.setTimeout(() => setCopiedAddress(false), 1800); }
    catch { setNotice({ label: "Copy unavailable", detail: "The browser did not grant clipboard access.", tone: "warn" }); }
  }

  function disconnectWallet() {
    setWallet(""); setWalletChainId(""); setWalletVerified(false); setPortfolio([]); setWalletMenuOpen(false);
    setNotice({ label: "Wallet disconnected", detail: "OmniMarket cleared its local session. Revoke permissions in the wallet extension if needed.", tone: "info" });
  }

  async function revokeWalletAccess() {
    const provider = walletProvider();
    if (!provider) return disconnectWallet();
    try {
      await provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
      disconnectWallet();
      setNotice({ label: "Wallet access revoked", detail: "The wallet extension removed OmniMarket's account permission.", tone: "info" });
    } catch (error) {
      setNotice({ label: "Permission not revoked", detail: error instanceof Error ? error.message : "This wallet does not expose permission revocation. Clear the local session instead.", tone: "warn" });
    }
  }

  function changeNetwork(network: NetworkName) {
    setSelectedNetwork(network); setWalletVerified(false);
    if (network === "testnetAsimov") {
      setWalletMenuOpen(Boolean(wallet));
      setNotice({ label: "Asimov selected", detail: "Asimov and Bradbury share chain ID 4221. Select the Asimov RPC manually in the wallet; OmniMarket trading stays disabled there.", tone: "warn" });
      return;
    }
    setWalletMenuOpen(false);
    if (wallet) void connectWallet(network);
    else setNotice({ label: "Bradbury selected", detail: "The OmniMarket contract is deployed here.", tone: "info" });
  }

  async function walletWrite(functionName: string, args: unknown[], valueWei = BigInt(0)) {
    const provider = walletProvider();
    if (!provider || !wallet) throw new Error("Connect a wallet before signing a transaction.");
    if (!/^0x[0-9a-fA-F]{40}$/.test(OMNIMARKET_ADDRESS)) throw new Error("Configure NEXT_PUBLIC_OMNIMARKET_CONTRACT_ADDRESS for this deployment.");
    if (selectedNetwork !== "testnetBradbury") throw new Error("Switch to Bradbury before signing OmniMarket transactions.");
    const chainId = await ensureWalletNetwork(provider, "testnetBradbury");
    const accounts = await provider.request({ method: "eth_accounts" }) as string[];
    const activeAccount = accounts[0] ?? "";
    if (!activeAccount || activeAccount.toLowerCase() !== wallet.toLowerCase()) {
      setWallet(activeAccount);
      setWalletVerified(false);
      throw new Error("The wallet account changed. Reconnect before signing.");
    }
    setWalletChainId(chainId);
    setWalletVerified(true);
    const client = createClient({ chain: testnetBradbury, account: activeAccount as `0x${string}`, provider: provider as NonNullable<Parameters<typeof createClient>[0]>["provider"] });
    const txHash = await client.writeContract({ address: OMNIMARKET_ADDRESS, functionName, args: args as Parameters<typeof client.writeContract>[0]["args"], value: valueWei });
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      status: TransactionStatus.FINALIZED,
      interval: 5_000,
      retries: 120,
    });
    if (receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) throw new Error(`Execution returned ${receipt.txExecutionResultName}.`);
    return txHash;
  }

  async function submitTrade() {
    if (!selected) return;
    setBusy("trade");
    try {
      const value = parseGen(stakeGen);
      if (value < MIN_STAKE_WEI) throw new Error("The minimum stake is 1 GEN.");
      if (value > MAX_STAKE_WEI) throw new Error("The maximum cumulative stake is 10 GEN per wallet per market.");
      const txHash = await walletWrite("buy_position", [BigInt(selected.market.market_id), side, value], value);
      setStakeGen("");
      setNotice({ label: "GEN position finalized", detail: `Finalized on Bradbury: ${txHash}`, tone: "good" });
      await Promise.all([refreshSelected(selected.market.market_id, false), refreshHistory(selected.market.market_id), refreshPortfolio(wallet)]);
    } catch (error) { setNotice({ label: "Trade failed", detail: error instanceof Error ? error.message : "The position was not submitted.", tone: "warn" }); }
    finally { setBusy(""); }
  }

  async function createMarket() {
    setBusy("create");
    try {
      const closeTime = BigInt(marketForm.closeTime.trim());
      const liquidity = parseGen(marketForm.liquidity);
      if (liquidity < MIN_SEED_WEI) throw new Error("Seed liquidity must be at least 2 GEN.");
      if (liquidity % BigInt(2) !== BigInt(0)) throw new Error("Seed liquidity must be an even GEN amount.");
      if (closeTime < BigInt(Math.floor(Date.now() / 1000) + 1800)) throw new Error("Close time must be at least 30 minutes from now.");
      const sources = marketForm.sources.map((source) => source.trim());
      if (sources.length !== 5 || sources.some((source) => !/^https?:\/\//i.test(source))) throw new Error("Add five valid HTTP(S) evidence sources.");
      if (new Set(sources.map((source) => source.toLowerCase())).size !== 5) throw new Error("Evidence sources must be unique.");
      const txHash = await walletWrite("create_market", [marketForm.title.trim(), marketForm.outcome0.trim(), marketForm.outcome1.trim(), marketForm.rules.trim(), ...sources, closeTime, liquidity], liquidity);
      setMarketForm(createEmptyMarketForm());
      setNotice({ label: "Market finalized", detail: `Finalized on Bradbury: ${txHash}. The form was cleared and the on-chain market index is refreshing.`, tone: "good" });
      await refreshMarkets(false);
    } catch (error) { setNotice({ label: "Market creation failed", detail: error instanceof Error ? error.message : "The market was not created.", tone: "warn" }); }
    finally { setBusy(""); }
  }

  async function lockMarket() {
    if (!selected) return;
    setBusy("lock");
    try { const txHash = await walletWrite("lock_market", [BigInt(selected.market.market_id)]); setNotice({ label: "Market locked", detail: `Finalized on Bradbury: ${txHash}`, tone: "good" }); await refreshSelected(selected.market.market_id, false); }
    catch (error) { setNotice({ label: "Lock failed", detail: error instanceof Error ? error.message : "The market could not be locked.", tone: "warn" }); }
    finally { setBusy(""); }
  }

  async function resolveMarket() {
    if (!selected) return;
    if (currentTime >= selected.market.close_time + SETTLEMENT_SAFETY_DELAY_SECONDS + LOCKED_SETTLEMENT_TIMEOUT_SECONDS) {
      await voidLockedMarket();
      return;
    }
    setBusy("resolve");
    setNotice({ label: "Consensus in progress", detail: "GenLayer is evaluating the market evidence. This can take time.", tone: "info" });
    try { const txHash = await walletWrite("resolve_market", [BigInt(selected.market.market_id)]); setNotice({ label: "Resolution finalized", detail: `Finalized on Bradbury: ${txHash}`, tone: "good" }); await refreshSelected(selected.market.market_id, false); }
    catch (error) { setNotice({ label: "Resolution failed", detail: error instanceof Error ? error.message : "The resolver transaction failed.", tone: "warn" }); }
    finally { setBusy(""); }
  }

  async function voidLockedMarket() {
    if (!selected) return;
    setBusy("void-locked");
    try {
      const txHash = await walletWrite("void_locked_market", [BigInt(selected.market.market_id)]);
      setNotice({ label: "Market voided", detail: `Settlement timeout finalized on Bradbury: ${txHash}`, tone: "good" });
      await Promise.all([refreshSelected(selected.market.market_id, false), refreshPortfolio(wallet)]);
    } catch (error) { setNotice({ label: "Void fallback failed", detail: error instanceof Error ? error.message : "The locked market was not voided.", tone: "warn" }); }
    finally { setBusy(""); }
  }

  async function claimPosition(marketId = selected?.market.market_id) {
    if (!marketId) return;
    setBusy("claim");
    try { const txHash = await walletWrite("claim_winnings", [BigInt(marketId)]); setNotice({ label: "Payout finalized", detail: `GEN payout finalized on Bradbury: ${txHash}`, tone: "good" }); await refreshPortfolio(wallet); await refreshSelected(marketId, false); }
    catch (error) { setNotice({ label: "Claim failed", detail: error instanceof Error ? error.message : "The payout was not claimed.", tone: "warn" }); }
    finally { setBusy(""); }
  }

  async function claimVoidSeed() {
    if (!selected) return;
    setBusy("void-seed");
    try {
      const txHash = await walletWrite("claim_void_seed", [BigInt(selected.market.market_id)]);
      setNotice({ label: "Seed recovery finalized", detail: `GEN seed refund finalized on Bradbury: ${txHash}`, tone: "good" });
      await refreshSelected(selected.market.market_id, false);
    } catch (error) {
      setNotice({ label: "Seed recovery failed", detail: error instanceof Error ? error.message : "The void-market seed was not reclaimed.", tone: "warn" });
    } finally { setBusy(""); }
  }

  function renderWalletControl() {
    const walletLabel = walletBusy ? "Connecting..." : !wallet ? "Connect Wallet" : !walletReady ? "Verify Bradbury" : shortAddress(wallet);
    return <div className="wallet-control" ref={walletPanelRef}>
      {walletReady ? <span className="wallet-network"><i />Bradbury testnet</span> : null}
      <button className={`wallet-button ${!walletReady && wallet ? "needs-verification" : ""}`} type="button" onClick={() => !wallet || !walletReady ? void connectWallet("testnetBradbury") : setWalletMenuOpen((open) => !open)} disabled={walletBusy} aria-expanded={wallet ? walletMenuOpen : undefined}>{walletLabel}</button>
      {wallet && walletMenuOpen ? <div className="wallet-menu" role="dialog" aria-modal="true" aria-label="Wallet controls">
        <div className="wallet-menu-heading"><span>Connected wallet</span><strong>{shortAddress(wallet)}</strong></div>
        <button className="wallet-menu-action" type="button" onClick={() => void copyWalletAddress()}>{copiedAddress ? "Copied" : "Copy address"}</button>
        <label className="wallet-network-picker"><span>Network</span><select value={selectedNetwork} onChange={(event) => changeNetwork(event.target.value as NetworkName)}><option value="testnetBradbury">Bradbury · live contract</option><option value="testnetAsimov">Asimov · no deployment</option></select></label>
        {selectedNetwork !== "testnetBradbury" ? <p className="wallet-menu-warning">Trading and claims are unavailable until Bradbury is selected.</p> : !walletVerified ? <><p className="wallet-menu-warning">The account is authorized, but the wallet network still needs verification.</p><button className="wallet-menu-action" type="button" onClick={() => void connectWallet("testnetBradbury")} disabled={walletBusy}>Switch to Bradbury</button></> : null}
        <button className="wallet-menu-disconnect" type="button" onClick={disconnectWallet}>Disconnect app</button>
        <button className="wallet-menu-revoke" type="button" onClick={() => void revokeWalletAccess()}>Revoke wallet access</button>
        <small>Disconnect clears this app session. Revoke asks the wallet extension to remove its account permission when supported.</small>
      </div> : null}
    </div>;
  }

  if (!selectedMarket || !selected) return <main className="app-shell"><nav className="topbar" aria-label="Primary"><a className="brand" href="#home"><span className="brand-mark">OM</span><strong>OmniMarket</strong></a><div className="nav-links"><a href="/how-it-works">Protocol</a><a href="/docs">Docs</a><a href="https://github.com/Manablaq/omnimarket" target="_blank" rel="noreferrer">Source ↗</a></div>{renderWalletControl()}</nav><section className="market-bridge-state" id="home" aria-live="polite"><div className="section-kicker">{marketReadState === "error" ? "CONTRACT RECOVERY" : "LIVE CONTRACT DATA"}</div><div className="bridge-state-title"><span className={`bridge-state-dot ${marketReadState}`} />{marketReadState === "loading" ? "Loading live markets" : marketReadState === "error" ? "Market data is temporarily unavailable" : "No live markets yet"}</div><p>{marketReadState === "error" ? marketLoadError : marketReadState === "ready" ? "The Bradbury contract is online, but no markets have been indexed yet." : "Reading the deployed OmniMarket contract. The app shell remains available while the network responds."}</p><div className="bridge-state-actions"><button className="primary-action" type="button" onClick={() => void refreshMarkets(false)} disabled={busy === "refresh"}>{busy === "refresh" ? "Refreshing..." : "Retry contract read"}</button><a className="secondary-link" href="/docs">Read the docs</a></div><p className={`live-status ${notice.tone}`} aria-live="polite">{notice.label}: {notice.detail}</p></section></main>;

  return <main className="app-shell">
    <nav className="topbar" aria-label="Primary"><a className="brand" href="#home"><span className="brand-mark">OM</span><strong>OmniMarket</strong></a><div className="nav-links"><a href="/how-it-works">Protocol</a><a href="#markets">Markets</a><a href="/portfolio">Portfolio</a><a href="/docs">Docs</a><a href="#contract">Contract</a></div>{renderWalletControl()}</nav>
    <section className="hero reveal" id="home"><div className="hero-copy-block"><div className="hero-meta"><span>GENLAYER INTELLIGENT CONTRACT</span><span className="live-tag">● LIVE BRADBURY STATE</span></div><p className="eyebrow">Native GEN prediction exchange</p><h1>Markets that settle from <em>live evidence.</em></h1><p className="hero-copy">A transparent two-outcome market where positions are backed by GEN, prices are read from contract state, and settlement follows evidence-bound GenLayer consensus.</p><div className="hero-actions"><a className="primary-link" href="#markets">Open market console</a><a className="secondary-link" href="#how-it-works">How it works <span>↘</span></a></div></div></section>
    <section className="metrics-strip reveal" aria-label="Market metrics"><div><span>Markets indexed</span><strong>{snapshots.length}</strong></div><div><span>Trading now</span><strong>{snapshots.filter((item) => item.market.status === 1).length}</strong></div><div><span>GEN in selected pool</span><strong>{formatGen(selected.poolTotalWei)}</strong></div><div><span>Data source</span><strong>Bradbury testnet state</strong></div></section>
    <section className="market-workspace reveal" id="markets"><aside className="market-rail"><div className="section-head compact"><div><span>Discover</span><h2>Markets</h2></div><button type="button" onClick={() => void refreshMarkets(false)} disabled={busy === "refresh"} aria-label="Refresh market index">↻</button></div><label className="market-search"><span>Search markets</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by question" /></label><div className="market-controls"><div className="filter-tabs" role="group" aria-label="Market status filter"><button className={marketFilter === "all" ? "selected" : ""} type="button" onClick={() => setMarketFilter("all")}>All</button><button className={marketFilter === "trading" ? "selected" : ""} type="button" onClick={() => setMarketFilter("trading")}>Trading</button><button className={marketFilter === "settled" ? "selected" : ""} type="button" onClick={() => setMarketFilter("settled")}>Settled</button></div><label className="sort-select"><span>Sort</span><select value={marketSort} onChange={(event) => setMarketSort(event.target.value as MarketSort)}><option value="newest">Newest</option><option value="pool">Pool total</option><option value="closing">Closing soon</option></select></label></div>{visibleMarkets.length > 0 ? visibleMarkets.map((item) => <button className={`market-row ${item.market.market_id === selected.market.market_id ? "active" : ""}`} key={item.market.market_id} type="button" onClick={() => setSelectedId(item.market.market_id)}><span className={`pill ${statusTone(item.market.status)}`}>{statusLabel(item.market.status)}</span><strong>{item.market.title}</strong><small>{formatBps(item.price0Bps)} {item.market.outcome_0} · {formatGen(item.poolTotalWei)}</small></button>) : <p className="empty-copy market-empty">No markets match this filter.</p>}<div className="market-rail-footer"><small>{snapshots.length} of {marketTotal || snapshots.length} indexed</small>{marketCursor !== null ? <button className="secondary-action" type="button" onClick={() => void loadMoreMarkets()} disabled={busy === "more-markets"}>{busy === "more-markets" ? "Loading..." : "Load more"}</button> : null}</div></aside>
      <section className="market-console"><div className="market-header"><div><span>Market #{selected.market.market_id} / {statusLabel(selected.market.status)}</span><h2>{selected.market.title}</h2></div><div className="deadline"><span>Closes UTC</span><strong>{formatDate(selected.market.close_time)}</strong></div></div><div className="chart-card"><div className="chart-head"><div><span>Contract-derived probability</span><strong>{formatBps(selectedPrice)} {selectedOutcome}</strong></div><div className="legend"><span><i className="yes" />{selected.market.outcome_0} {formatBps(selected.price0Bps)}</span><span><i className="no" />{selected.market.outcome_1} {formatBps(selected.price1Bps)}</span></div></div><svg className="probability-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Live contract odds chart"><path d="M 0 75 L 100 75" /><path d="M 0 50 L 100 50" /><path d="M 0 25 L 100 25" /><path className="chart-line yes-line" d={yesPath} /><path className="chart-line no-line" d={noPath} /></svg><div className="chart-foot"><span>Updated {new Date(selected.updatedAt).toLocaleTimeString()}</span><span>{selectedHistory.length > 0 ? `${selectedHistory.length} contract observations` : "Waiting for the first contract observation"}</span></div></div><div className="console-grid"><section className="panel trade-panel"><div className="section-head"><div><span>Trade</span><h3>Buy outcome position</h3></div><span className="fee">0.75% fee</span></div><div className="segmented"><button className={side === 0 ? "selected" : ""} type="button" onClick={() => setSide(0)}>{selected.market.outcome_0}</button><button className={side === 1 ? "selected" : ""} type="button" onClick={() => setSide(1)}>{selected.market.outcome_1}</button></div><label className="field"><span>Stake in GEN</span><input value={stakeGen} inputMode="decimal" onChange={(event) => setStakeGen(event.target.value)} /></label><div className="quote-grid"><div><span>Current odds</span><strong>{formatBps(selectedPrice)}</strong></div><div><span>Immediate-settlement estimate</span><strong>{indicativePayout === null ? "Enter stake" : formatGen(indicativePayout)}</strong></div><div><span>Pool total</span><strong>{formatGen(BigInt(selected.market.total_0) + BigInt(selected.market.total_1))}</strong></div></div><p className="quote-disclaimer">Uses the contract fee and current pools. Later trades can change a final winning payout.</p><button className="primary-action" type="button" onClick={() => void submitTrade()} disabled={busy === "trade" || selected.market.status !== 1 || !walletReady}>{busy === "trade" ? "Finalizing position" : "Sign GEN position"}</button>{!walletReady ? <p className="helper">Connect and verify a Bradbury wallet to sign this native-GEN transaction.</p> : null}</section><section className="panel"><div className="section-head"><div><span>Liquidity</span><h3>Pool depth</h3></div></div><div className="depth-bars"><div><span>{selected.market.outcome_0}</span><div className="bar"><i className="yes" style={{ width: `${selected.price0Bps / 100}%` }} /></div><strong>{formatGen(selected.market.total_0)}</strong></div><div><span>{selected.market.outcome_1}</span><div className="bar"><i className="no" style={{ width: `${selected.price1Bps / 100}%` }} /></div><strong>{formatGen(selected.market.total_1)}</strong></div></div><div className="source-list"><span>Declared evidence</span>{selected.market.source_uris.filter(Boolean).map((uri) => <a href={uri} key={uri} target="_blank" rel="noreferrer">{uri}</a>)}</div></section></div><section className="source-audit"><div className="section-head"><div><span>Five-source audit</span><h3>Source observations</h3></div><span>{selectedSources.length}/5 indexed</span></div><div className="source-audit-grid">{selectedSources.length > 0 ? selectedSources.map((source) => <article className={`source-audit-card ${sourceTone(source)}`} key={`${source.market_id}-${source.source_index}`}><div><strong>Source {source.source_index + 1}</strong><span>{source.vote === 1 ? "Outcome 0" : source.vote === 2 ? "Outcome 1" : "Inconclusive"}</span></div><a href={source.uri} target="_blank" rel="noreferrer">{source.uri}</a><p>{source.summary || source.reason_code}</p><small>{source.confidence / 100}% confidence · {source.status}</small></article>) : <p className="empty-copy">Waiting for indexed source observations from the contract.</p>}</div></section><section className="reference-panel panel"><div className="section-head"><div><span>Context only</span><h3>External reference feed</h3></div><label className="compact-select"><span>Asset</span><select value={referenceAsset} onChange={(event) => setReferenceAsset(event.target.value)}><option value="BTC">BTC</option><option value="ETH">ETH</option><option value="SOL">SOL</option></select></label></div>{referenceData ? <><div className="reference-summary"><strong>${referenceData.price.toLocaleString()}</strong><span className={referenceData.change24h >= 0 ? "positive" : "negative"}>{referenceData.change24h >= 0 ? "+" : ""}{referenceData.change24h.toFixed(2)}%</span><small>{referenceData.symbol} · {referenceData.interval} · external context, not settlement evidence</small></div><svg className="reference-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${referenceData.symbol} reference price chart`}><path d={referenceChartPath(referenceData.candles.map((candle) => candle.close))} /></svg></> : <p className="empty-copy">{referenceError || "Loading reference data..."}</p>}</section></section>
      <aside className="right-rail" id="contract"><section className="panel"><div className="section-head"><div><span>Lifecycle</span><h3>Evidence settlement</h3></div></div><ol className="steps"><li>Trade with native GEN before close.</li><li>Anyone can lock after the close time.</li><li>Anyone can start GenLayer web consensus after the 120-second safety delay.</li><li>Winning users claim a native GEN payout, or void users reclaim funds.</li></ol><div className="lifecycle-actions"><button className="secondary-action" type="button" onClick={() => void lockMarket()} disabled={busy === "lock" || selected.market.status !== 1 || currentTime < selected.market.close_time}>{busy === "lock" ? "Locking..." : currentTime < selected.market.close_time ? `Lock available in ${Math.max(0, selected.market.close_time - currentTime)}s` : "Lock after close"}</button><button className="secondary-action" type="button" onClick={() => void resolveMarket()} disabled={busy === "resolve" || busy === "void-locked" || selected.market.status !== 2 || currentTime < selected.market.close_time + 120}>{busy === "void-locked" ? "Voiding..." : busy === "resolve" ? "Resolving..." : currentTime >= selected.market.close_time + 120 + LOCKED_SETTLEMENT_TIMEOUT_SECONDS ? "Void after timeout" : currentTime < selected.market.close_time + 120 ? `Resolve available in ${Math.max(0, selected.market.close_time + 120 - currentTime)}s` : "Resolve with consensus"}</button>{selected.market.status === 4 && wallet.toLowerCase() === selected.market.creator.toLowerCase() && selected.market.liquidity_units !== "0" ? <button className="secondary-action" type="button" onClick={() => void claimVoidSeed()} disabled={busy === "void-seed"}>{busy === "void-seed" ? "Refunding seed..." : "Reclaim void-market seed"}</button> : null}</div></section><section className="panel"><div className="section-head"><div><span>Criteria</span><h3>Market rules</h3></div></div><p className="rules-copy">{selected.market.rules}</p>{selected.market.summary ? <div className="resolution-box"><span>Resolution summary</span><p>{selected.market.summary}</p><strong>{selected.market.confidence / 100}% confidence · {selected.market.reason_code}</strong></div> : null}</section><section className="panel contract-identity"><div className="section-head"><div><span>Settlement contract</span><h3>Bradbury address</h3></div></div>{OMNIMARKET_ADDRESS ? <><code>{shortAddress(OMNIMARKET_ADDRESS)}</code><a href={`https://explorer-bradbury.genlayer.com/address/${OMNIMARKET_ADDRESS}`} target="_blank" rel="noreferrer">Open in GenLayer Explorer ↗</a></> : <p className="empty-copy">Contract address is not configured in this deployment.</p>}</section></aside></section>
    <section className="portfolio-section reveal" id="portfolio"><div className="section-head"><div><span>Account</span><h2>Your portfolio</h2></div><button className="secondary-action" type="button" onClick={() => void refreshPortfolio(wallet)} disabled={!wallet}>Refresh portfolio</button></div>{wallet ? portfolio.length > 0 ? <div className="portfolio-grid">{portfolio.map((item) => <article className="portfolio-card" key={item.marketId}><span>Market #{item.marketId}</span><h3>{item.snapshot.market.title}</h3><p>{item.position.stake_0 !== "0" ? item.snapshot.market.outcome_0 : item.snapshot.market.outcome_1} position · {formatGen(item.position.stake_0 !== "0" ? item.position.stake_0 : item.position.stake_1)}</p><strong>{item.position.claimed ? "Claimed" : formatGen(item.payoutWei)} available</strong>{item.payoutWei !== "0" && !item.position.claimed ? <button className="primary-action" type="button" onClick={() => void claimPosition(item.marketId)} disabled={busy === "claim"}>Claim GEN payout</button> : null}</article>)}</div> : <p className="empty-copy">No indexed positions for this wallet yet. Your portfolio appears after the first finalized trade.</p> : <p className="empty-copy">Connect a Bradbury wallet to see positions and claimable payouts.</p>}</section>
    <section className="create-section reveal" id="create"><div className="section-head"><div><span>Create</span><h2>Launch a GEN-backed market</h2></div><p>Markets are public: the creator supplies five independent evidence URLs, a clear rule, and an even native-GEN seed. Resolution is permissionless after close.</p></div><div className="create-grid"><label className="field wide"><span>Question</span><input value={marketForm.title} onChange={(event) => setMarketForm({ ...marketForm, title: event.target.value })} /></label><label className="field"><span>Outcome 0</span><input value={marketForm.outcome0} onChange={(event) => setMarketForm({ ...marketForm, outcome0: event.target.value })} /></label><label className="field"><span>Outcome 1</span><input value={marketForm.outcome1} onChange={(event) => setMarketForm({ ...marketForm, outcome1: event.target.value })} /></label>{marketForm.sources.map((source, index) => <label className="field wide" key={`source-${index}`}><span>Evidence source {index + 1}</span><input type="url" value={source} onChange={(event) => setMarketForm({ ...marketForm, sources: marketForm.sources.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /></label>)}<label className="field"><span>Close time Unix</span><input inputMode="numeric" value={marketForm.closeTime} onChange={(event) => setMarketForm({ ...marketForm, closeTime: event.target.value })} /></label><label className="field"><span>Even seed liquidity in GEN</span><input inputMode="decimal" value={marketForm.liquidity} onChange={(event) => setMarketForm({ ...marketForm, liquidity: event.target.value })} /></label><label className="field wide"><span>Resolution rules</span><textarea value={marketForm.rules} onChange={(event) => setMarketForm({ ...marketForm, rules: event.target.value })} /></label></div><button className="primary-action create-button" type="button" onClick={() => void createMarket()} disabled={busy === "create" || !walletReady}>{busy === "create" ? "Finalizing market" : "Sign and fund market"}</button><p className="helper">Required before signing: five unique HTTP(S) sources, close time at least 30 minutes away, seed of at least 2 GEN, and a Bradbury wallet.</p></section>
    <section className="field-notes reveal" id="how-it-works"><div className="section-kicker">ONE CONTRACT, FOUR GUARANTEES</div><h2>From a live question to a verifiable outcome.</h2><p className="section-lede">OmniMarket keeps the market surface legible while the Intelligent Contract carries state, native value, evidence, and consensus.</p><div className="note-grid"><article className="note-card"><span>01</span><h3>Fund the question</h3><p>Creation and positions attach native GEN directly to payable contract methods.</p></article><article className="note-card"><span>02</span><h3>Read the state</h3><p>Market discovery, prices, positions, and chart observations come from contract views.</p></article><article className="note-card"><span>03</span><h3>Resolve the evidence</h3><p>After close, validators evaluate the declared source and rules through GenLayer consensus.</p></article><article className="note-card"><span>04</span><h3>Claim the result</h3><p>Winning positions receive a native GEN transfer from the contract after settlement.</p></article></div></section>
    <section className="docs-band reveal" id="docs"><div><div className="section-kicker">LIVE PROOF, HONEST BOUNDARY</div><h2>Prediction is uncertainty. Settlement should be explicit.</h2><p>{notice.label}: {notice.detail}</p></div><div className="docs-list"><div><span>ON-CHAIN</span><strong>Market index, prices, observations, positions</strong></div><div><span>CONSENSUS</span><strong>Evidence interpreted by GenLayer validators</strong></div><div><span>NATIVE VALUE</span><strong>GEN sent and claimed in wei</strong></div><a className="docs-link" href="https://github.com/Manablaq/omnimarket" target="_blank" rel="noreferrer">Read source, docs, and test evidence ↗</a></div></section>
    <footer className="site-footer"><a className="brand" href="#home"><span className="brand-mark">OM</span><strong>OmniMarket</strong></a><span>GenLayer Intelligent Contract prediction markets.</span><a href="#home">Back to top ↑</a></footer>
  </main>;
}
