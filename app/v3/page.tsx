"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type EthereumWindow = Window & { ethereum?: WalletProvider };
type V3Market = {
  market_id: number; creator: string; title: string; outcome_count: number; outcomes: string[]; rules: string;
  source_uris: string[]; close_time: number; created_at: number; status: number; pools: string[];
  claim_units_per_outcome: string; remaining_backing_units: string; total_lp_shares: string;
  gross_trade_volume_units: string; gross_liquidity_in_units: string; fee_units: string;
  pending_outcome: number; pending_confidence: number; pending_reason_code: string; pending_summary: string;
  challenge_deadline: number; resolution_round: number; winning_outcome: number; confidence: number;
  reason_code: string; summary: string; resolved_at: number; void_remaining_share_units: string;
};
type Snapshot = { market: V3Market; pricesBps: number[]; volumeWei: string; source: "contract"; updatedAt: number };
type Observation = { observed_at: number; prices: number[]; pools: string[] };
type SourceObservation = { source_index: number; uri: string; status: string; vote: number; confidence: number; evidence_excerpt: string; reason_code: string; summary: string; checked_at: number };
type PortfolioItem = { marketId: number; position: { outcome_units: string[]; claimed_winnings: boolean; claimed_void: boolean }; lpPosition: { shares: string; claimed_settlement: boolean }; snapshot: Snapshot };
type Notice = { tone: "info" | "success" | "danger"; title: string; detail: string } | null;

const V3_ADDRESS = (process.env.NEXT_PUBLIC_OMNIMARKET_V3_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const BRADBURY_CHAIN_ID = `0x${testnetBradbury.id.toString(16)}`;
const WEI_PER_GEN = BigInt("1000000000000000000");
const MIN_CREATION_LEAD_SECONDS = 1800;
const SLIPPAGE_BPS = 100;

function provider() { return (window as EthereumWindow).ethereum; }
function short(address: string) { return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""; }
function walletErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: number }).code : undefined;
  if (code === 4001) return "The wallet request was rejected.";
  if (code === 4900) return "The wallet provider is disconnected. Reconnect it, then try again.";
  if (code === 4901) return "The wallet is disconnected from GenLayer Bradbury.";
  if (code === 4902) return "GenLayer Bradbury is not configured in this wallet yet.";
  return error instanceof Error && error.message ? error.message : "The wallet request did not complete.";
}
function statusName(status: number) { return (["", "Open", "Locked", "Provisional", "Challenged", "Finalized", "Void"][status] ?? "Unknown"); }
function utc(seconds: number) { return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(seconds * 1000)); }
function countdown(seconds: number) { const remaining = Math.max(0, seconds - Math.floor(Date.now() / 1000)); const hours = Math.floor(remaining / 3600); return hours > 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${Math.floor((remaining % 3600) / 60)}m`; }
function validAddress(value: string) { return /^0x[0-9a-fA-F]{40}$/.test(value); }
function formatGen(value: string, decimals = 4) {
  try { const amount = BigInt(value); const whole = amount / WEI_PER_GEN; const fraction = (amount % WEI_PER_GEN).toString().padStart(18, "0").slice(0, decimals).replace(/0+$/, ""); return `${whole}${fraction ? `.${fraction}` : ""}`; } catch { return "0"; }
}
function parseGen(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(trimmed)) throw new Error("Enter a positive GEN amount with no more than 18 decimal places.");
  const [whole, fraction = ""] = trimmed.split(".");
  const amount = BigInt(whole) * WEI_PER_GEN + BigInt(`${fraction}000000000000000000`.slice(0, 18));
  if (amount <= BigInt(0)) throw new Error("Enter an amount above zero.");
  return amount;
}
function minAfterSlippage(quoteWei: string) { return (BigInt(quoteWei) * BigInt(10_000 - SLIPPAGE_BPS) / BigInt(10_000)).toString(); }
function path(points: number[], width = 720, height = 255) {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${(index / Math.max(1, points.length - 1)) * width} ${height - (point / 10_000) * height}`).join(" ");
}
function emptyCreate() { return { title: "", outcomes: ["", "", ""], outcomeCount: "2", rules: "", sources: ["", "", "", "", ""], closeTime: "", seed: "" }; }

async function api(action: string, payload: Record<string, unknown> = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api/omnimarket/v3", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...payload }), cache: "no-store", signal: controller.signal });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok || body.ok !== true) throw new Error(String(body.error ?? "V3 contract bridge unavailable."));
    return body;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("V3 read timed out. Retry shortly.");
    throw error;
  } finally { window.clearTimeout(timer); }
}

async function ensureBradbury(wallet: WalletProvider) {
  const chainId = BRADBURY_CHAIN_ID;
  const current = String(await wallet.request({ method: "eth_chainId" })).toLowerCase();
  if (current !== chainId) {
    const params = { chainId, chainName: testnetBradbury.name, rpcUrls: [...testnetBradbury.rpcUrls.default.http], nativeCurrency: testnetBradbury.nativeCurrency, blockExplorerUrls: testnetBradbury.blockExplorers?.default.url ? [testnetBradbury.blockExplorers.default.url] : [] };
    try { await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] }); }
    catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: number }).code : undefined;
      if (code !== 4902) throw error;
      await wallet.request({ method: "wallet_addEthereumChain", params: [params] });
      await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    }
  }
  if (String(await wallet.request({ method: "eth_chainId" })).toLowerCase() !== chainId) throw new Error("Switch the wallet to GenLayer Bradbury before signing.");
}

export default function OmniMarketV3Page() {
  const [markets, setMarkets] = useState<Snapshot[]>([]);
  const [selectedId, setSelectedId] = useState(0);
  const [history, setHistory] = useState<Observation[]>([]);
  const [sources, setSources] = useState<SourceObservation[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [wallet, setWallet] = useState("");
  const [walletChainId, setWalletChainId] = useState("");
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [outcomeIndex, setOutcomeIndex] = useState(0);
  const [buyGen, setBuyGen] = useState("");
  const [sellClaims, setSellClaims] = useState("");
  const [liquidityGen, setLiquidityGen] = useState("");
  const [removeLpShares, setRemoveLpShares] = useState("");
  const [challengeReason, setChallengeReason] = useState("");
  const [challengeBond, setChallengeBond] = useState("0.1");
  const [form, setForm] = useState(emptyCreate);
  const walletPanelRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => markets.find((snapshot) => snapshot.market.market_id === selectedId) ?? markets[0] ?? null, [markets, selectedId]);
  const walletReady = Boolean(wallet) && walletChainId === BRADBURY_CHAIN_ID;

  const refreshMarkets = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await api("markets", { cursor: 0, limit: 24 });
      const next = (result.markets ?? []) as Snapshot[];
      setMarkets(next);
      setSelectedId((current) => next.some((item) => item.market.market_id === current) ? current : (next[0]?.market.market_id ?? 0));
    } catch (error) { setNotice({ tone: "danger", title: "Live V3 reads unavailable", detail: error instanceof Error ? error.message : "Retry shortly." }); }
    finally { if (!quiet) setLoading(false); }
  }, []);

  const refreshDetails = useCallback(async (marketId: number, quiet = false) => {
    if (!marketId) return;
    try {
      const [snapshotResult, historyResult, sourceResult] = await Promise.all([api("snapshot", { marketId }), api("history", { marketId }), api("sources", { marketId })]);
      const snapshot = snapshotResult.snapshot as Snapshot;
      setMarkets((current) => current.map((item) => item.market.market_id === marketId ? snapshot : item));
      setHistory((historyResult.history ?? []) as Observation[]);
      setSources((sourceResult.sources ?? []) as SourceObservation[]);
    } catch (error) { if (!quiet) setNotice({ tone: "danger", title: "Market refresh failed", detail: error instanceof Error ? error.message : "Retry shortly." }); }
  }, []);

  const refreshPortfolio = useCallback(async (account: string) => {
    if (!validAddress(account)) return;
    try { const result = await api("portfolio", { account }); setPortfolio((result.portfolio ?? []) as PortfolioItem[]); }
    catch (error) { setNotice({ tone: "danger", title: "Portfolio read failed", detail: error instanceof Error ? error.message : "Retry shortly." }); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshMarkets(); }, 0);
    const interval = window.setInterval(() => { void refreshMarkets(true); }, 15_000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [refreshMarkets]);
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => { void refreshDetails(selectedId); }, 0);
    const interval = window.setInterval(() => { void refreshDetails(selectedId, true); }, 15_000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [refreshDetails, selectedId]);
  useEffect(() => { if (wallet) { const timer = window.setTimeout(() => { void refreshPortfolio(wallet); }, 0); return () => window.clearTimeout(timer); } }, [refreshPortfolio, wallet]);
  useEffect(() => {
    if (!walletMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (walletPanelRef.current && !walletPanelRef.current.contains(event.target as Node)) setWalletMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeMenu);
    return () => window.removeEventListener("pointerdown", closeMenu);
  }, [walletMenuOpen]);
  useEffect(() => {
    const walletProvider = provider();
    if (!walletProvider) return;
    const sync = async () => {
      try {
        const [accounts, chainId] = await Promise.all([
          walletProvider.request({ method: "eth_accounts" }) as Promise<string[]>,
          walletProvider.request({ method: "eth_chainId" }),
        ]);
        const account = accounts[0] ?? "";
        setWallet(validAddress(account) ? account : "");
        setWalletChainId(String(chainId).toLowerCase());
      } catch {
        // A provider may be locked or disconnected while the page is loading.
      }
    };
    const onAccounts = (accounts: unknown) => {
      const account = Array.isArray(accounts) ? String(accounts[0] ?? "") : "";
      setPortfolio([]);
      setWalletMenuOpen(false);
      setCopiedAddress(false);
      if (!validAddress(account)) {
        setWallet("");
        setWalletChainId("");
        return;
      }
      setWallet(account);
      void walletProvider.request({ method: "eth_chainId" }).then((chainId) => setWalletChainId(String(chainId).toLowerCase())).catch(() => setWalletChainId(""));
    };
    const onChain = (chainId: unknown) => {
      const nextChainId = String(chainId).toLowerCase();
      setWalletChainId(nextChainId);
      setPortfolio([]);
      setWalletMenuOpen(false);
      if (nextChainId !== BRADBURY_CHAIN_ID) {
        setNotice({ tone: "danger", title: "Wallet network changed", detail: "Switch back to GenLayer Bradbury before signing a V3 transaction." });
      }
    };
    const onDisconnect = () => {
      setWallet("");
      setWalletChainId("");
      setPortfolio([]);
      setWalletMenuOpen(false);
      setCopiedAddress(false);
      setNotice({ tone: "danger", title: "Wallet disconnected", detail: "Reconnect the wallet before signing a V3 transaction." });
    };
    const timer = window.setTimeout(() => { void sync(); }, 0);
    walletProvider.on?.("accountsChanged", onAccounts);
    walletProvider.on?.("chainChanged", onChain);
    walletProvider.on?.("disconnect", onDisconnect);
    return () => {
      window.clearTimeout(timer);
      walletProvider.removeListener?.("accountsChanged", onAccounts);
      walletProvider.removeListener?.("chainChanged", onChain);
      walletProvider.removeListener?.("disconnect", onDisconnect);
    };
  }, []);

  async function connectWallet() {
    const walletProvider = provider();
    if (!walletProvider) { setNotice({ tone: "danger", title: "Wallet unavailable", detail: "Install or unlock an EIP-1193 browser wallet to use Bradbury." }); return; }
    setBusy("connect");
    try {
      await ensureBradbury(walletProvider);
      const accounts = await walletProvider.request({ method: "eth_requestAccounts" }) as string[];
      const account = accounts[0] ?? "";
      if (!validAddress(account)) throw new Error("The wallet returned no valid account.");
      setWallet(account);
      setWalletChainId(String(await walletProvider.request({ method: "eth_chainId" })).toLowerCase());
      setNotice({ tone: "success", title: "Wallet connected", detail: `${short(account)} is ready on GenLayer Bradbury.` });
    } catch (error) { setNotice({ tone: "danger", title: "Wallet connection failed", detail: walletErrorMessage(error) }); }
    finally { setBusy(""); }
  }

  async function switchToBradbury() {
    const walletProvider = provider();
    if (!walletProvider) return;
    setBusy("network");
    try {
      await ensureBradbury(walletProvider);
      setWalletChainId(String(await walletProvider.request({ method: "eth_chainId" })).toLowerCase());
      setNotice({ tone: "success", title: "Bradbury selected", detail: "The wallet is ready for V3 transactions." });
    } catch (error) { setNotice({ tone: "danger", title: "Network switch failed", detail: walletErrorMessage(error) }); }
    finally { setBusy(""); }
  }

  async function copyWalletAddress() {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet);
      setCopiedAddress(true);
      window.setTimeout(() => setCopiedAddress(false), 1800);
    } catch {
      setNotice({ tone: "danger", title: "Copy unavailable", detail: "The browser did not grant clipboard access." });
    }
  }

  function disconnectWallet() {
    setWallet("");
    setWalletChainId("");
    setPortfolio([]);
    setWalletMenuOpen(false);
    setCopiedAddress(false);
    setNotice({ tone: "info", title: "Wallet disconnected", detail: "OmniMarket cleared its local session. Revoke permissions in the wallet extension if needed." });
  }

  async function revokeWalletAccess() {
    const walletProvider = provider();
    if (!walletProvider) return disconnectWallet();
    try {
      await walletProvider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
      disconnectWallet();
      setNotice({ tone: "info", title: "Wallet access revoked", detail: "The wallet extension removed OmniMarket's account permission." });
    } catch (error) {
      setNotice({ tone: "danger", title: "Permission not revoked", detail: `${walletErrorMessage(error)} Clear the local session instead.` });
    }
  }

  async function sign(functionName: string, args: unknown[], value = BigInt(0)) {
    const walletProvider = provider();
    if (!walletProvider || !validAddress(wallet)) throw new Error("Connect a Bradbury wallet before signing.");
    if (!validAddress(V3_ADDRESS)) throw new Error("This V3 site is awaiting a configured V3 contract address.");
    await ensureBradbury(walletProvider);
    setWalletChainId(BRADBURY_CHAIN_ID);
    const accounts = await walletProvider.request({ method: "eth_accounts" }) as string[];
    const active = accounts[0] ?? "";
    if (!validAddress(active) || active.toLowerCase() !== wallet.toLowerCase()) { setWallet(active); throw new Error("The active wallet account changed. Reconnect before signing."); }
    const client = createClient({ chain: testnetBradbury, account: active as `0x${string}`, provider: walletProvider as NonNullable<Parameters<typeof createClient>[0]>["provider"] });
    const hash = await client.writeContract({ address: V3_ADDRESS, functionName, args: args as Parameters<typeof client.writeContract>[0]["args"], value });
    const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 5_000, retries: 120 });
    if (receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) throw new Error(`Bradbury execution returned ${receipt.txExecutionResultName}.`);
    return hash;
  }

  async function quote(action: "quote_buy" | "quote_sell" | "quote_add_liquidity", amountWei: bigint) {
    if (!selected) throw new Error("Choose a market first.");
    const response = await api(action, { marketId: selected.market.market_id, outcomeIndex, amountWei: amountWei.toString() });
    return String(response.quoteWei);
  }

  async function quoteLiquidityRemoval(lpShares: bigint) {
    if (!selected) throw new Error("Choose a market first.");
    const response = await api("quote_remove_liquidity", { marketId: selected.market.market_id, amountWei: lpShares.toString() });
    const quote = response.quoteWei;
    if (!Array.isArray(quote) || quote.length !== selected.market.outcome_count) throw new Error("The contract returned an invalid LP withdrawal quote.");
    return quote.map((value) => String(value));
  }

  async function run(label: string, task: () => Promise<string>, reset?: () => void) {
    setBusy(label);
    try {
      const hash = await task();
      reset?.();
      setNotice({ tone: "success", title: "Transaction finalized", detail: `${hash}. Live contract data is refreshing.` });
      await Promise.all([refreshMarkets(true), selected ? refreshDetails(selected.market.market_id, true) : Promise.resolve(), refreshPortfolio(wallet)]);
    } catch (error) { setNotice({ tone: "danger", title: "Transaction was not finalized", detail: error instanceof Error ? error.message : "No on-chain state was changed." }); }
    finally { setBusy(""); }
  }

  function buy() { return run("buy", async () => { const amount = parseGen(buyGen); const quoted = await quote("quote_buy", amount); return sign("buy_outcome", [BigInt(selected!.market.market_id), BigInt(outcomeIndex), amount, BigInt(minAfterSlippage(quoted))], amount); }, () => setBuyGen("")); }
  function sell() { return run("sell", async () => { const claims = parseGen(sellClaims); const quoted = await quote("quote_sell", claims); return sign("sell_outcome", [BigInt(selected!.market.market_id), BigInt(outcomeIndex), claims, BigInt(minAfterSlippage(quoted))]); }, () => setSellClaims("")); }
  function addLiquidity() { return run("liquidity", async () => { const amount = parseGen(liquidityGen); const quoted = await quote("quote_add_liquidity", amount); return sign("add_liquidity", [BigInt(selected!.market.market_id), amount, BigInt(minAfterSlippage(quoted))], amount); }, () => setLiquidityGen("")); }
  function removeLiquidity() { return run("remove-liquidity", async () => {
    const shares = parseGen(removeLpShares);
    const ownedShares = currentPosition ? BigInt(currentPosition.lpPosition.shares) : BigInt(0);
    if (shares > ownedShares) throw new Error("Enter no more than your available LP shares.");
    if (shares === BigInt(selected!.market.total_lp_shares)) throw new Error("The final LP share remains until settlement.");
    const quotedClaims = await quoteLiquidityRemoval(shares);
    const minimumClaimEach = quotedClaims.reduce((minimum, claim) => BigInt(claim) < minimum ? BigInt(claim) : minimum, BigInt(quotedClaims[0]));
    return sign("remove_liquidity", [BigInt(selected!.market.market_id), shares, BigInt(minAfterSlippage(minimumClaimEach.toString()))]);
  }, () => setRemoveLpShares("")); }
  function settlement(method: string) { return run(method, () => sign(method, [BigInt(selected!.market.market_id)])); }
  function claim(method: string) { return run(method, () => sign(method, [BigInt(selected!.market.market_id)])); }
  function challenge() { return run("challenge", async () => { const bond = parseGen(challengeBond); if (!challengeReason.trim()) throw new Error("Describe the evidence conflict before challenging."); return sign("challenge_market", [BigInt(selected!.market.market_id), challengeReason.trim(), bond], bond); }, () => { setChallengeReason(""); setChallengeBond("0.1"); }); }
  function create() { return run("create", async () => {
    const outcomeCount = Number(form.outcomeCount); const outcomes = form.outcomes.map((item) => item.trim()); const sources = form.sources.map((item) => item.trim()); const close = Number(form.closeTime);
    if (!form.title.trim() || !form.rules.trim() || outcomes.slice(0, outcomeCount).some((item) => !item)) throw new Error("Title, rules, and every selected outcome are required.");
    if (sources.some((item) => !/^https:\/\//i.test(item)) || new Set(sources.map((item) => item.toLowerCase())).size !== 5) throw new Error("Provide five unique HTTPS evidence URLs.");
    if (!Number.isInteger(close) || close < Math.floor(Date.now() / 1000) + MIN_CREATION_LEAD_SECONDS) throw new Error("Close time must be at least 30 minutes from now.");
    const seed = parseGen(form.seed); return sign("create_market", [form.title.trim(), BigInt(outcomeCount), outcomes[0], outcomes[1], outcomeCount === 3 ? outcomes[2] : "", form.rules.trim(), ...sources, BigInt(close), seed], seed);
  }, () => setForm(emptyCreate)); }

  const lines = selected ? selected.market.outcomes.map((_, index) => path(history.length ? history.map((point) => point.prices[index] ?? 0) : [selected.pricesBps[index], selected.pricesBps[index]], 720, 255)) : [];
  const currentPosition = portfolio.find((item) => item.marketId === selected?.market.market_id);

  return <main className="v3-shell">
    <header className="v3-header">
      <Link className="brand" href="/"><span className="brand-mark">OM</span><strong>OmniMarket</strong><span className="v3-badge">V3 candidate</span></Link>
      <nav aria-label="V3 navigation"><a href="#markets">Markets</a><a href="#trade">Trade</a><a href="#create">Create</a><a href="#evidence">Evidence</a><a href="/docs">Docs</a></nav>
      <div className="v3-wallet-control" ref={walletPanelRef}>{walletReady && <span className="v3-wallet-network"><i />Bradbury</span>}{wallet ? <button className={`v3-wallet-address ${walletReady ? "" : "needs-verification"}`} onClick={() => setWalletMenuOpen((open) => !open)} disabled={busy === "connect" || busy === "network"} aria-expanded={walletMenuOpen}>{short(wallet)}</button> : <button className="v3-connect" onClick={connectWallet} disabled={busy === "connect"}>{busy === "connect" ? "Connecting" : "Connect wallet"}</button>}{wallet && walletMenuOpen && <div className="v3-wallet-menu" role="dialog" aria-label="V3 wallet controls"><div className="v3-wallet-menu-heading"><span>Connected wallet</span><strong>{short(wallet)}</strong></div><button className="v3-wallet-menu-action" onClick={() => void copyWalletAddress()}>{copiedAddress ? "Copied" : "Copy address"}</button><div className="v3-wallet-network-row"><span>Network</span><strong>{walletReady ? "GenLayer Bradbury" : "Wrong network"}</strong></div>{!walletReady && <button className="v3-wallet-menu-action" onClick={() => void switchToBradbury()} disabled={busy !== ""}>{busy === "network" ? "Switching" : "Switch to Bradbury"}</button>}<button className="v3-wallet-menu-disconnect" onClick={disconnectWallet}>Disconnect app</button><button className="v3-wallet-menu-revoke" onClick={() => void revokeWalletAccess()}>Revoke wallet access</button><small>Disconnect clears this app session. Revoke asks the wallet extension to remove OmniMarket account permission when supported.</small></div>}</div>
    </header>

    <section className="v3-hero"><div><p className="v3-eyebrow">Bradbury public-testnet candidate</p><h1>Conditional markets with auditable settlement.</h1><p>V3 is a separate, fully collateralized multi-outcome candidate. Prices, balances, claims, and evidence observations are read from its own contract address only.</p><div className="v3-hero-actions"><a href="#markets" className="v3-primary">Explore live V3 markets</a><a href="/how-it-works" className="v3-secondary">Review lifecycle</a></div></div><aside><span>Release boundary</span><strong>V2 remains untouched</strong><p>V3 needs its own Direct Mode, Studio, wallet, and independent-review evidence before public activation.</p></aside></section>

    {notice && <div className={`v3-notice ${notice.tone}`} role="status"><div><strong>{notice.title}</strong><p>{notice.detail}</p></div><button onClick={() => setNotice(null)} aria-label="Dismiss notice">x</button></div>}
    {!validAddress(V3_ADDRESS) && <div className="v3-notice danger"><div><strong>V3 is not configured</strong><p>Set `NEXT_PUBLIC_OMNIMARKET_V3_CONTRACT_ADDRESS` only after the separate V3 Bradbury deployment has completed its required checks.</p></div></div>}

    <section id="markets" className="v3-market-layout">
      <aside className="v3-market-list"><div className="v3-section-head"><div><p className="v3-eyebrow">Contract index</p><h2>Live markets</h2></div><button className="v3-icon-button" title="Refresh markets" onClick={() => void refreshMarkets()} disabled={loading}>↻</button></div>{loading && markets.length === 0 ? <p className="v3-empty">Reading the V3 contract index.</p> : markets.length === 0 ? <p className="v3-empty">No V3 markets are indexed yet.</p> : markets.map((item) => <button key={item.market.market_id} className={`v3-market-card ${selected?.market.market_id === item.market.market_id ? "selected" : ""}`} onClick={() => setSelectedId(item.market.market_id)}><span>{statusName(item.market.status)}</span><strong>{item.market.title}</strong><small>{item.pricesBps[0] / 100}% {item.market.outcomes[0]} · {formatGen(item.market.remaining_backing_units)} GEN backing</small></button>)}</aside>
      <div className="v3-market-main">{selected ? <>
        <div className="v3-market-title"><div><p className="v3-eyebrow">Market #{selected.market.market_id} · {statusName(selected.market.status)}</p><h2>{selected.market.title}</h2></div><div><span>Closes UTC</span><strong>{utc(selected.market.close_time)}</strong><small>{selected.market.status === 1 ? `${countdown(selected.market.close_time)} remaining` : statusName(selected.market.status)}</small></div></div>
        <section className="v3-chart"><div className="v3-chart-head"><div><span>Contract-derived probability</span><strong>{(selected.pricesBps[0] / 100).toFixed(2)}% {selected.market.outcomes[0]}</strong></div><div className="v3-legend">{selected.market.outcomes.map((outcome, index) => <span key={outcome} className={`outcome-${index}`}>{outcome} {(selected.pricesBps[index] / 100).toFixed(2)}%</span>)}</div></div><svg viewBox="0 0 720 255" role="img" aria-label="V3 contract price history">{[25, 75, 125, 175, 225].map((line) => <line key={line} x1="0" y1={line} x2="720" y2={line} className="v3-grid-line" />)}{lines.map((line, index) => <path key={selected.market.outcomes[index]} className={`v3-line outcome-${index}`} d={line} />)}</svg><footer>{history.length} contract observations · Last refreshed {new Date(selected.updatedAt).toLocaleTimeString()}</footer></section>
        <div className="v3-stat-grid"><div><span>Collateral backing</span><strong>{formatGen(selected.market.remaining_backing_units)} GEN</strong></div><div><span>Trade volume</span><strong>{formatGen(selected.market.gross_trade_volume_units)} GEN</strong></div><div><span>LP shares</span><strong>{formatGen(selected.market.total_lp_shares)}</strong></div><div><span>Protocol fees</span><strong>{formatGen(selected.market.fee_units)} GEN</strong></div></div>
        <section id="trade" className="v3-trade-grid"><div className="v3-panel"><p className="v3-eyebrow">Outcome exchange</p><h3>Buy or sell conditional claims</h3><label>Outcome<select value={outcomeIndex} onChange={(event) => setOutcomeIndex(Number(event.target.value))}>{selected.market.outcomes.map((outcome, index) => <option value={index} key={outcome}>{outcome} · {(selected.pricesBps[index] / 100).toFixed(2)}%</option>)}</select></label><label>Buy in GEN<input inputMode="decimal" value={buyGen} onChange={(event) => setBuyGen(event.target.value)} placeholder="0.00" /></label><button className="v3-primary" onClick={buy} disabled={busy !== "" || selected.market.status !== 1}>Buy with 1% limit</button><label>Sell claim units<input inputMode="decimal" value={sellClaims} onChange={(event) => setSellClaims(event.target.value)} placeholder="0.00" /></label><button className="v3-secondary" onClick={sell} disabled={busy !== "" || selected.market.status !== 1}>Sell with 1% limit</button><p className="v3-caption">Quotes use the V3 contract before signing. The signed transaction includes a minimum output that permits at most 1% adverse movement.</p></div>
          <div className="v3-panel"><p className="v3-eyebrow">Liquidity</p><h3>Pro-rata liquidity shares</h3><label>Deposit GEN<input inputMode="decimal" value={liquidityGen} onChange={(event) => setLiquidityGen(event.target.value)} placeholder="0.00" /></label><button className="v3-primary" onClick={addLiquidity} disabled={busy !== "" || selected.market.status !== 1}>Add liquidity with 1% limit</button>{currentPosition && <div className="v3-position"><span>Your conditional claims</span>{selected.market.outcomes.map((outcome, index) => <p key={outcome}>{outcome}: <strong>{formatGen(currentPosition.position.outcome_units[index] ?? "0")}</strong></p>)}<p>LP shares: <strong>{formatGen(currentPosition.lpPosition.shares)}</strong></p><label>Withdraw LP shares<input inputMode="decimal" value={removeLpShares} onChange={(event) => setRemoveLpShares(event.target.value)} placeholder="0.00" /></label><button className="v3-secondary" onClick={removeLiquidity} disabled={busy !== "" || selected.market.status !== 1}>Withdraw claims with 1% limit</button></div>}<p className="v3-caption">LP deposits quote new shares before signing. LP withdrawals quote every outcome claim and protect the lowest returned claim with a 1% limit.</p></div></section>
      </> : <div className="v3-empty">Select a market once the contract read finishes.</div>}</div>
      <aside className="v3-side">{selected && <><section className="v3-panel"><p className="v3-eyebrow">Permissionless settlement</p><h3>Lifecycle controls</h3><p>Anyone may progress a market, but no caller selects its winning outcome.</p><button className="v3-secondary" onClick={() => settlement("lock_market")} disabled={busy !== "" || selected.market.status !== 1}>Lock after close</button><button className="v3-secondary" onClick={() => settlement("resolve_market")} disabled={busy !== "" || selected.market.status !== 2}>Resolve with consensus</button><button className="v3-secondary" onClick={() => settlement("finalize_market")} disabled={busy !== "" || selected.market.status !== 3}>Finalize after challenge window</button><button className="v3-secondary" onClick={() => settlement("resolve_challenge")} disabled={busy !== "" || selected.market.status !== 4}>Resolve challenge with consensus</button><button className="v3-secondary" onClick={() => settlement("void_market")} disabled={busy !== "" || ![2, 3, 4].includes(selected.market.status)}>Use timeout void path</button></section>
      <section className="v3-panel"><p className="v3-eyebrow">Challenge window</p><h3>Challenge a provisional result</h3><label>Evidence conflict<textarea value={challengeReason} onChange={(event) => setChallengeReason(event.target.value)} placeholder="State the evidence conflict precisely." rows={3} /></label><label>Bond in GEN<input inputMode="decimal" value={challengeBond} onChange={(event) => setChallengeBond(event.target.value)} /></label><button className="v3-secondary" onClick={challenge} disabled={busy !== "" || selected.market.status !== 3}>Submit bonded challenge</button><p className="v3-caption">A challenge invokes a second consensus run over the stored evidence. It is not an operator appeal.</p></section>
      <section className="v3-panel"><p className="v3-eyebrow">Claims</p><h3>Settlement recovery</h3><button className="v3-secondary" onClick={() => claim("claim_winnings")} disabled={busy !== "" || selected.market.status !== 5}>Claim winning claims</button><button className="v3-secondary" onClick={() => claim("claim_lp_settlement")} disabled={busy !== "" || selected.market.status !== 5}>Claim LP settlement</button><button className="v3-secondary" onClick={() => claim("claim_void_position")} disabled={busy !== "" || selected.market.status !== 6}>Claim void refund</button><button className="v3-secondary" onClick={() => claim("claim_void_lp")} disabled={busy !== "" || selected.market.status !== 6}>Claim void LP refund</button></section></>}</aside>
    </section>

    <section id="evidence" className="v3-evidence"><div><p className="v3-eyebrow">Evidence record</p><h2>Stored sources and consensus observations</h2><p>URLs are immutable market fields. Observation cards appear when the V3 resolver reads the stored sources.</p></div>{selected && <div className="v3-source-grid">{selected.market.source_uris.map((uri, index) => { const observation = sources.filter((item) => item.source_index === index).at(-1); return <article key={uri}><span>Source {index + 1}</span><a href={uri} target="_blank" rel="noreferrer">{uri}</a><strong>{observation ? `${observation.status} · ${observation.confidence / 100}%` : "Not yet observed"}</strong><p>{observation?.summary || "The market is still open; no settlement observation exists yet."}</p></article>; })}</div>}</section>

    <section id="create" className="v3-create"><div><p className="v3-eyebrow">New market</p><h2>Publish a bounded evidence market</h2><p>Everything starts empty. V3 accepts only two or three outcomes, five distinct HTTPS evidence sources, a future close time, and native-GEN seed liquidity.</p></div><form onSubmit={(event) => { event.preventDefault(); create(); }}><label>Question<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={240} required /></label><label>Outcomes<select value={form.outcomeCount} onChange={(event) => setForm({ ...form, outcomeCount: event.target.value })}><option value="2">Two outcomes</option><option value="3">Three outcomes</option></select></label><div className="v3-outcome-fields">{form.outcomes.slice(0, Number(form.outcomeCount)).map((value, index) => <label key={index}>Outcome {index + 1}<input value={value} onChange={(event) => { const outcomes = [...form.outcomes]; outcomes[index] = event.target.value; setForm({ ...form, outcomes }); }} maxLength={80} required /></label>)}</div>{form.sources.map((value, index) => <label key={index}>Evidence source {index + 1}<input type="url" value={value} onChange={(event) => { const sources = [...form.sources]; sources[index] = event.target.value; setForm({ ...form, sources }); }} placeholder="https://" required /></label>)}<label>Close time (Unix UTC seconds)<input inputMode="numeric" value={form.closeTime} onChange={(event) => setForm({ ...form, closeTime: event.target.value })} required /></label><label>Even seed liquidity in GEN<input inputMode="decimal" value={form.seed} onChange={(event) => setForm({ ...form, seed: event.target.value })} required /></label><label>Resolution rules<textarea value={form.rules} onChange={(event) => setForm({ ...form, rules: event.target.value })} maxLength={4000} rows={5} required /></label><button className="v3-primary" type="submit" disabled={busy !== ""}>Create V3 market</button></form></section>
    <footer className="v3-footer"><span>OmniMarket V3 candidate · Bradbury testnet only</span><a href="https://github.com/Manablaq/omnimarket" target="_blank" rel="noreferrer">Source</a><a href="/docs">Documentation</a></footer>
  </main>;
}
