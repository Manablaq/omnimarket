"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "genlayer-js";
import { testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

type MarketStatus = 0 | 1 | 2 | 3 | 4;
type NetworkName = "testnetBradbury" | "testnetAsimov";

type MarketRecord = {
  market_id: number;
  creator: string;
  title: string;
  outcome_0: string;
  outcome_1: string;
  rules: string;
  evidence_uri: string;
  close_time: number;
  status: MarketStatus;
  created_at: number;
  liquidity_units: number;
  total_0: number;
  total_1: number;
  fee_units: number;
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
  volumeUnits: number;
  source: "contract" | "unconfigured";
  updatedAt: number;
};

type ActivityItem = {
  label: string;
  detail: string;
  tone: "good" | "warn" | "info";
};

type ApiResponse =
  | { ok: true; snapshot?: MarketSnapshot; txHash?: string; marketId?: number }
  | { ok: false; error: string; configured?: boolean };

const configuredMarketIds = [1];

function statusLabel(status: MarketStatus) {
  if (status === 1) return "Trading";
  if (status === 2) return "Locked";
  if (status === 3) return "Resolved";
  if (status === 4) return "Void";
  return "Draft";
}

function statusTone(status: MarketStatus) {
  if (status === 1) return "good";
  if (status === 2) return "warn";
  if (status === 3) return "info";
  if (status === 4) return "warn";
  return "info";
}

function formatBps(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

function formatUnits(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatDate(seconds: number) {
  if (!seconds) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(seconds * 1000));
}

function chartPath(points: number[]) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const y = 100 - points[0] / 100;
    return `M 0 ${y.toFixed(2)} L 100 ${y.toFixed(2)}`;
  }
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 100 - point / 100;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

type ChartSeries = {
  yes: number[];
  no: number[];
};

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

type EthereumWindow = Window & { ethereum?: WalletProvider };

const OMNIMARKET_ADDRESS = "0x0E1201A1F5477e635306BC3E34e68658e4489fBd" as `0x${string}`;

function walletProvider() {
  return (window as EthereumWindow).ethereum;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function networkLabel(network: NetworkName) {
  return network === "testnetBradbury" ? "Bradbury" : "Asimov";
}

async function callOmniMarketApi(action: string, payload: Record<string, unknown> = {}): Promise<ApiResponse> {
  const response = await fetch("/api/omnimarket", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  return response.json() as Promise<ApiResponse>;
}

export default function Home() {
  const [snapshots, setSnapshots] = useState<MarketSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState(1);
  const [side, setSide] = useState<0 | 1>(0);
  const [stakeUnits, setStakeUnits] = useState(500);
  const [wallet, setWallet] = useState("");
  const [walletChainId, setWalletChainId] = useState("");
  const [walletVerified, setWalletVerified] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkName>("testnetBradbury");
  const [marketLoadError, setMarketLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<ActivityItem>({
    label: "Contract bridge",
    detail: "Waiting for Bradbury contract configuration.",
    tone: "warn",
  });
  const [history, setHistory] = useState<Record<number, ChartSeries>>({});
  const [marketForm, setMarketForm] = useState({
    title: "Will genlayerlabs/genlayer-project-boilerplate exist on GitHub?",
    outcome0: "Yes",
    outcome1: "No",
    rules:
      "Outcome 0 wins only if the GitHub API identifies the repository as existing. Outcome 1 wins if the repository is missing. Return inconclusive if the source cannot be fetched.",
    evidenceUri: "https://api.github.com/repos/genlayerlabs/genlayer-project-boilerplate",
    closeTime: "9999999999",
    liquidity: "10000",
  });

  const walletReady = Boolean(wallet && walletChainId && walletVerified && selectedNetwork === "testnetBradbury");
  const walletPanelRef = useRef<HTMLDivElement>(null);

  const selected = snapshots.find((item) => item.market.market_id === selectedId) ?? snapshots[0];
  const selectedMarket = selected?.market;
  const contentReady = Boolean(selectedMarket && selected);
  const selectedPrice = selected ? (side === 0 ? selected.price0Bps : selected.price1Bps) : 0;
  const selectedOutcome = selected ? (side === 0 ? selected.market.outcome_0 : selected.market.outcome_1) : "";
  const totalPool = selected ? selected.market.total_0 + selected.market.total_1 : 0;
  const estimatedPayout = selectedPrice > 0 ? Math.round((stakeUnits * 10000) / selectedPrice) : 0;
  const chartPoints = useMemo(
    () => selected ? history[selected.market.market_id] ?? { yes: [selected.price0Bps], no: [selected.price1Bps] } : { yes: [], no: [] },
    [history, selected],
  );
  const yesPath = useMemo(() => chartPath(chartPoints.yes), [chartPoints.yes]);
  const noPath = useMemo(() => chartPath(chartPoints.no), [chartPoints.no]);
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("is-visible")),
      { threshold: 0.12 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [contentReady]);

  useEffect(() => {
    if (!walletMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (walletPanelRef.current && !walletPanelRef.current.contains(event.target as Node)) {
        setWalletMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [walletMenuOpen]);

  useEffect(() => {
    const provider = walletProvider();
    if (!provider) return;

    const syncWallet = async () => {
      const [accounts, chainId] = await Promise.all([
        provider.request({ method: "eth_accounts" }) as Promise<string[]>,
        provider.request({ method: "eth_chainId" }) as Promise<string>,
      ]);
      setWallet(accounts[0] ?? "");
      setWalletChainId(chainId ?? "");
      setWalletVerified(false);
    };
    const handleAccounts = (accounts: unknown) => {
      setWallet(Array.isArray(accounts) ? String(accounts[0] ?? "") : "");
      setWalletVerified(false);
    };
    const handleChain = (chainId: unknown) => {
      setWalletChainId(String(chainId ?? ""));
      setWalletVerified(false);
    };

    void syncWallet();
    provider.on?.("accountsChanged", handleAccounts);
    provider.on?.("chainChanged", handleChain);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccounts);
      provider.removeListener?.("chainChanged", handleChain);
    };
  }, []);

  const refreshMarket = useCallback(
    async (marketId: number, quiet = false) => {
      if (!quiet) setBusy("refresh");
      try {
        const result = await callOmniMarketApi("snapshot", { marketId });
        if (!result.ok || !result.snapshot) {
          setMarketLoadError(result.ok ? "The contract returned no market for this id." : result.error);
          setNotice({
            label: "Contract not configured",
            detail: result.ok ? "No market returned from contract." : result.error,
            tone: "warn",
          });
          return;
        }
        setMarketLoadError("");
        setSnapshots((current) => {
          const next = current.filter((item) => item.market.market_id !== marketId);
          return [...next, result.snapshot!].sort((a, b) => a.market.market_id - b.market.market_id);
        });
        setHistory((current) => {
          const currentSeries = current[marketId] ?? { yes: [], no: [] };
          return {
            ...current,
            [marketId]: {
              yes: [...currentSeries.yes, result.snapshot!.price0Bps].slice(-28),
              no: [...currentSeries.no, result.snapshot!.price1Bps].slice(-28),
            },
          };
        });
        setNotice({
          label: "Live contract read",
          detail: `Market ${marketId} updated from get_market and get_price_bps.`,
          tone: "good",
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "The deployed contract could not be read.";
        setMarketLoadError(detail);
        setNotice({ label: "Contract read failed", detail, tone: "warn" });
      } finally {
        if (!quiet) setBusy("");
      }
    },
    [],
  );

  useEffect(() => {
    const initialRead = window.setTimeout(() => {
      void refreshMarket(configuredMarketIds[0], true);
    }, 0);
    const interval = window.setInterval(() => {
      void refreshMarket(selectedId, true);
    }, 12000);
    return () => {
      window.clearTimeout(initialRead);
      window.clearInterval(interval);
    };
  }, [refreshMarket, selectedId]);

  async function connectWallet(network: NetworkName = selectedNetwork) {
    const ethereum = walletProvider();
    if (!ethereum) {
      setNotice({
        label: "Wallet unavailable",
        detail: "Install a wallet that supports the active GenLayer testnet before trading.",
        tone: "warn",
      });
      return;
    }
    setWalletBusy(true);
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const account = accounts[0] ?? "";
      const chains = { testnetBradbury, testnetAsimov };
      const client = createClient({
        chain: chains[network],
        account: account as `0x${string}`,
        provider: ethereum as NonNullable<Parameters<typeof createClient>[0]>["provider"],
      });
      await client.connect(network as Parameters<typeof client.connect>[0]);
      const chainId = (await ethereum.request({ method: "eth_chainId" })) as string;
      setWallet(accounts[0] ?? "");
      setWalletChainId(chainId ?? "");
      setWalletVerified(true);
      setWalletMenuOpen(false);
      setNotice({ label: "Wallet connected", detail: `Connected to ${networkLabel(network)}.`, tone: "good" });
    } catch (error) {
      setNotice({ label: "Wallet connection cancelled", detail: error instanceof Error ? error.message : "The wallet did not approve the connection.", tone: "warn" });
    } finally {
      setWalletBusy(false);
    }
  }

  async function copyWalletAddress() {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet);
      setCopiedAddress(true);
      window.setTimeout(() => setCopiedAddress(false), 1800);
    } catch {
      setNotice({ label: "Copy unavailable", detail: "Your browser did not grant clipboard access.", tone: "warn" });
    }
  }

  function disconnectWallet() {
    setWallet("");
    setWalletChainId("");
    setWalletVerified(false);
    setWalletMenuOpen(false);
    setNotice({ label: "Wallet disconnected", detail: "OmniMarket cleared its local wallet session.", tone: "info" });
  }

  function changeNetwork(network: NetworkName) {
    setSelectedNetwork(network);
    setWalletVerified(false);
    setWalletMenuOpen(false);
    if (wallet) {
      void connectWallet(network);
      return;
    }
    setNotice({
      label: `${networkLabel(network)} selected`,
      detail: network === "testnetBradbury" ? "OmniMarket contract is deployed here." : "No OmniMarket contract is deployed on Asimov.",
      tone: network === "testnetBradbury" ? "info" : "warn",
    });
  }

  async function walletWrite(functionName: string, args: unknown[]) {
    const provider = walletProvider();
    if (!provider || !wallet) throw new Error("Connect a wallet before signing a transaction.");
    if (selectedNetwork !== "testnetBradbury") throw new Error("OmniMarket writes are only available on Bradbury for this deployment.");

    const client = createClient({
      chain: testnetBradbury,
      account: wallet as `0x${string}`,
      provider: provider as NonNullable<Parameters<typeof createClient>[0]>["provider"],
    });
    await client.connect("testnetBradbury" as Parameters<typeof client.connect>[0]);
    setWalletVerified(true);
    const txHash = await client.writeContract({
      address: OMNIMARKET_ADDRESS,
      functionName,
      args: args as Parameters<typeof client.writeContract>[0]["args"],
      value: BigInt(0),
    });
    const receipt = await client.waitForTransactionReceipt({ hash: txHash, status: TransactionStatus.ACCEPTED });
    if (receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
      throw new Error(`Transaction consensus completed, but execution returned ${receipt.txExecutionResultName}.`);
    }
    return txHash;
  }

  async function submitTrade() {
    setBusy("trade");
    try {
      const txHash = await walletWrite("buy_position", [BigInt(selected.market.market_id), side, BigInt(stakeUnits)]);
      setNotice({
        label: "Trade submitted",
        detail: `Accepted on Bradbury: ${txHash}`,
        tone: "good",
      });
      await refreshMarket(selected.market.market_id, true);
    } finally {
      setBusy("");
    }
  }

  async function createMarket() {
    setBusy("create");
    try {
      const txHash = await walletWrite("create_market", [marketForm.title, marketForm.outcome0, marketForm.outcome1, marketForm.rules, marketForm.evidenceUri, BigInt(Number(marketForm.closeTime)), BigInt(Number(marketForm.liquidity))]);
      setNotice({
        label: "Market created",
        detail: `Accepted on Bradbury: ${txHash}`,
        tone: "good",
      });
      await refreshMarket(selected.market.market_id, true);
    } finally {
      setBusy("");
    }
  }

  async function resolveForStudio() {
    setBusy("resolve");
    try {
      const txHash = await walletWrite("admin_resolve_for_studio", [BigInt(selected.market.market_id), side, 9500, "studio_verified", `${selectedOutcome} selected through the connected wallet.`]);
      setNotice({
        label: "Resolution submitted",
        detail: `Accepted on Bradbury: ${txHash}`,
        tone: "good",
      });
      await refreshMarket(selected.market.market_id, true);
    } finally {
      setBusy("");
    }
  }

  if (!selectedMarket || !selected) {
    return (
      <main className="app-shell">
        <nav className="topbar" aria-label="Primary">
          <a className="brand" href="#home" aria-label="OmniMarket home"><span className="brand-mark">OM</span><strong>OmniMarket</strong></a>
          <div className="nav-links"><a href="#docs">Docs</a><a href="https://github.com/Manablaq/omnimarket" target="_blank" rel="noreferrer">Source ↗</a></div>
          <div className="wallet-control" ref={walletPanelRef}>
            {walletReady ? <span className="wallet-network"><i />Bradbury</span> : null}
            <button className="wallet-button" type="button" onClick={() => wallet ? setWalletMenuOpen((open) => !open) : void connectWallet()} disabled={walletBusy} aria-expanded={wallet ? walletMenuOpen : undefined}>
              {walletBusy ? "Connecting..." : wallet ? shortAddress(wallet) : "Connect Wallet"}
            </button>
            {wallet && walletMenuOpen ? <div className="wallet-menu" role="dialog" aria-label="Wallet controls">
              <div className="wallet-menu-heading"><span>Connected wallet</span><strong>{shortAddress(wallet)}</strong></div>
              <button className="wallet-menu-action" type="button" onClick={() => void copyWalletAddress()}>{copiedAddress ? "Copied" : "Copy address"}</button>
              <label className="wallet-network-picker"><span>Network</span><select value={selectedNetwork} onChange={(event) => changeNetwork(event.target.value as NetworkName)}><option value="testnetBradbury">Bradbury · OmniMarket live</option><option value="testnetAsimov">Asimov · no deployment</option></select></label>
              {selectedNetwork !== "testnetBradbury" ? <p className="wallet-menu-warning">Trading is unavailable until Bradbury is selected.</p> : null}
              <button className="wallet-menu-disconnect" type="button" onClick={disconnectWallet}>Disconnect app</button>
              <small>Disconnecting clears OmniMarket&apos;s session. To revoke wallet permissions completely, use your wallet extension.</small>
            </div> : null}
          </div>
        </nav>
        <section className="live-empty reveal is-visible" id="home">
          <div className="section-kicker">LIVE CONTRACT DATA</div>
          <h1>{marketLoadError ? "Market data unavailable." : "Reading the Bradbury market."}</h1>
          <p>{marketLoadError || "OmniMarket will show a market only after get_market and get_price_bps return from the deployed contract."}</p>
          <button className="primary-action" type="button" onClick={() => void refreshMarket(1)} disabled={busy === "refresh"}>{busy === "refresh" ? "Refreshing..." : "Retry contract read"}</button>
          <p className={`live-status ${notice.tone}`} aria-live="polite">{notice.label}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Primary">
        <a className="brand" href="#home" aria-label="OmniMarket home">
          <span className="brand-mark">OM</span>
          <strong>OmniMarket</strong>
        </a>
        <div className="nav-links">
          <a href="#how-it-works">Protocol</a>
          <a href="#markets">Markets</a>
          <a href="#docs">Docs</a>
          <a href="#contract">Contract</a>
        </div>
        <div className="wallet-control" ref={walletPanelRef}>
          {walletReady ? <span className="wallet-network"><i />Bradbury</span> : null}
          <button className="wallet-button" type="button" onClick={() => wallet ? setWalletMenuOpen((open) => !open) : void connectWallet()} disabled={walletBusy} aria-expanded={wallet ? walletMenuOpen : undefined}>
            {walletBusy ? "Connecting..." : wallet ? shortAddress(wallet) : "Connect Wallet"}
          </button>
          {wallet && walletMenuOpen ? <div className="wallet-menu" role="dialog" aria-label="Wallet controls">
            <div className="wallet-menu-heading"><span>Connected wallet</span><strong>{shortAddress(wallet)}</strong></div>
            <button className="wallet-menu-action" type="button" onClick={() => void copyWalletAddress()}>{copiedAddress ? "Copied" : "Copy address"}</button>
            <label className="wallet-network-picker"><span>Network</span><select value={selectedNetwork} onChange={(event) => changeNetwork(event.target.value as NetworkName)}><option value="testnetBradbury">Bradbury · OmniMarket live</option><option value="testnetAsimov">Asimov · no deployment</option></select></label>
            {selectedNetwork !== "testnetBradbury" ? <p className="wallet-menu-warning">Trading is unavailable until Bradbury is selected.</p> : null}
            <button className="wallet-menu-disconnect" type="button" onClick={disconnectWallet}>Disconnect app</button>
            <small>Disconnecting clears OmniMarket&apos;s session. To revoke wallet permissions completely, use your wallet extension.</small>
          </div> : null}
        </div>
      </nav>

      <section className="hero reveal" id="home">
        <div className="hero-copy-block">
          <div className="hero-meta"><span>OMNIMARKET / FIELD NOTE 001</span><span className="live-tag">LIVE BRADBURY PROTOTYPE</span></div>
          <p className="eyebrow">GENLAYER INTELLIGENT CONTRACT</p>
          <h1>Markets that settle from <em>live evidence.</em></h1>
          <p className="hero-copy">
            A prediction market primitive for questions the internet can answer. Prices move from real positions, and resolution comes from GenLayer web consensus instead of an operator promise.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#markets">Open market console</a>
            <a className="secondary-link" href="#how-it-works">How it works <span>↘</span></a>
          </div>
        </div>
      </section>

      <section className="metrics-strip reveal" aria-label="Market metrics">
        <div>
          <span>Total displayed volume</span>
          <strong>{formatUnits(snapshots.reduce((sum, item) => sum + item.volumeUnits, 0))} units</strong>
        </div>
        <div>
          <span>Open markets</span>
          <strong>{snapshots.filter((item) => item.market.status === 1).length}</strong>
        </div>
        <div>
          <span>Contract polling</span>
          <strong>12s refresh</strong>
        </div>
        <div>
          <span>Resolution engine</span>
          <strong>GenLayer web consensus</strong>
        </div>
      </section>

      <section className="market-workspace reveal" id="markets">
        <aside className="market-rail" aria-label="Markets">
          <div className="section-head compact">
            <span>Live Markets</span>
            <button type="button" onClick={() => refreshMarket(selectedId)} disabled={busy === "refresh"}>
              {busy === "refresh" ? "Refreshing" : "Refresh"}
            </button>
          </div>
          {snapshots.map((snapshot) => (
            <button
              className={`market-row ${snapshot.market.market_id === selected.market.market_id ? "active" : ""}`}
              key={snapshot.market.market_id}
              type="button"
              onClick={() => {
                setSelectedId(snapshot.market.market_id);
                setSide(0);
              }}
            >
              <span className={`pill ${statusTone(snapshot.market.status)}`}>{statusLabel(snapshot.market.status)}</span>
              <strong>{snapshot.market.title}</strong>
              <small>{formatBps(snapshot.price0Bps)} {snapshot.market.outcome_0} / {formatUnits(snapshot.volumeUnits)} units</small>
            </button>
          ))}
        </aside>

        <section className="market-console">
          <div className="market-header">
            <div>
              <span>Market #{selected.market.market_id} / {statusLabel(selected.market.status)}</span>
              <h2>{selected.market.title}</h2>
            </div>
            <div className="deadline">
              <span>Closes UTC</span>
              <strong>{formatDate(selected.market.close_time)}</strong>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-head">
              <div>
                <span>Contract-derived probability</span>
                <strong>{formatBps(selectedPrice)} {selectedOutcome}</strong>
              </div>
              <div className="legend">
                <span><i className="yes" />{selected.market.outcome_0} {formatBps(selected.price0Bps)}</span>
                <span><i className="no" />{selected.market.outcome_1} {formatBps(selected.price1Bps)}</span>
              </div>
            </div>
            <svg className="probability-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Live contract odds chart">
              <path d="M 0 75 L 100 75" />
              <path d="M 0 50 L 100 50" />
              <path d="M 0 25 L 100 25" />
              <path className="chart-line yes-line" d={yesPath} />
              <path className="chart-line no-line" d={noPath} />
            </svg>
            <div className="chart-foot">
              <span>Updated {new Date(selected.updatedAt).toLocaleTimeString()}</span>
              <span>{selected.source === "contract" ? "Reading live contract state" : "Set contract env vars to unlock live reads"}</span>
            </div>
          </div>

          <div className="console-grid">
            <section className="panel trade-panel">
              <div className="section-head">
                <div>
                  <span>Trade</span>
                  <h3>Buy outcome position</h3>
                </div>
                <span className="fee">0.75% fee</span>
              </div>
              <div className="segmented">
                <button className={side === 0 ? "selected" : ""} type="button" onClick={() => setSide(0)}>
                  {selected.market.outcome_0}
                </button>
                <button className={side === 1 ? "selected" : ""} type="button" onClick={() => setSide(1)}>
                  {selected.market.outcome_1}
                </button>
              </div>
              <label className="field">
                <span>Stake units</span>
                <input value={stakeUnits} min="1" type="number" onChange={(event) => setStakeUnits(Number(event.target.value))} />
              </label>
              <div className="quote-grid">
                <div><span>Current odds</span><strong>{formatBps(selectedPrice)}</strong></div>
                <div><span>Est. payout</span><strong>{formatUnits(estimatedPayout)}</strong></div>
                <div><span>Total pool</span><strong>{formatUnits(totalPool)}</strong></div>
              </div>
              <button className="primary-action" type="button" onClick={submitTrade} disabled={busy === "trade" || !walletReady}>
                {busy === "trade" ? "Waiting for wallet" : "Sign buy_position"}
              </button>
              {!walletReady ? <p className="helper">Connect your wallet to sign this Bradbury transaction.</p> : null}
            </section>

            <section className="panel">
              <div className="section-head">
                <div>
                  <span>Liquidity</span>
                  <h3>Pool depth</h3>
                </div>
              </div>
              <div className="depth-bars">
                <div>
                  <span>{selected.market.outcome_0}</span>
                  <div className="bar"><i className="yes" style={{ width: `${selected.price0Bps / 100}%` }} /></div>
                  <strong>{formatUnits(selected.market.total_0)}</strong>
                </div>
                <div>
                  <span>{selected.market.outcome_1}</span>
                  <div className="bar"><i className="no" style={{ width: `${selected.price1Bps / 100}%` }} /></div>
                  <strong>{formatUnits(selected.market.total_1)}</strong>
                </div>
              </div>
              <div className="evidence-box">
                <span>Evidence URI</span>
                <a href={selected.market.evidence_uri} target="_blank" rel="noreferrer">{selected.market.evidence_uri}</a>
              </div>
            </section>
          </div>
        </section>

        <aside className="right-rail" id="contract">
          <section className="panel">
            <div className="section-head">
              <div>
                <span>Resolver</span>
                <h3>GenLayer settlement</h3>
              </div>
            </div>
            <ol className="steps">
              <li>Market reads are polled from `get_market` and `get_price_bps`.</li>
              <li>Trades call `buy_position` with the selected outcome and stake.</li>
              <li>Closed markets use `resolve_market` for web evidence consensus.</li>
              <li>Studio tests can use `admin_resolve_for_studio` before public launch.</li>
            </ol>
            <button className="secondary-action" type="button" onClick={resolveForStudio} disabled={busy === "resolve" || !walletReady}>
              {busy === "resolve" ? "Waiting for wallet" : "Sign test resolution"}
            </button>
          </section>

          <section className="panel">
            <div className="section-head">
              <div>
                <span>Rules</span>
                <h3>Market criteria</h3>
              </div>
            </div>
            <p className="rules-copy">{selected.market.rules}</p>
          </section>
        </aside>
      </section>

      <section className="create-section reveal" id="create">
        <div className="section-head">
          <div>
            <span>Create</span>
            <h2>Launch a new contract market</h2>
          </div>
          <p>Each field maps directly to `create_market` on `OmniMarket`.</p>
        </div>
        <div className="create-grid">
          <label className="field wide">
            <span>Question</span>
            <input value={marketForm.title} onChange={(event) => setMarketForm({ ...marketForm, title: event.target.value })} />
          </label>
          <label className="field">
            <span>Outcome 0</span>
            <input value={marketForm.outcome0} onChange={(event) => setMarketForm({ ...marketForm, outcome0: event.target.value })} />
          </label>
          <label className="field">
            <span>Outcome 1</span>
            <input value={marketForm.outcome1} onChange={(event) => setMarketForm({ ...marketForm, outcome1: event.target.value })} />
          </label>
          <label className="field wide">
            <span>Evidence URI</span>
            <input value={marketForm.evidenceUri} onChange={(event) => setMarketForm({ ...marketForm, evidenceUri: event.target.value })} />
          </label>
          <label className="field">
            <span>Close time Unix</span>
            <input value={marketForm.closeTime} onChange={(event) => setMarketForm({ ...marketForm, closeTime: event.target.value })} />
          </label>
          <label className="field">
            <span>Seed liquidity</span>
            <input value={marketForm.liquidity} onChange={(event) => setMarketForm({ ...marketForm, liquidity: event.target.value })} />
          </label>
          <label className="field wide">
            <span>Resolution rules</span>
            <textarea value={marketForm.rules} onChange={(event) => setMarketForm({ ...marketForm, rules: event.target.value })} />
          </label>
        </div>
        <button className="primary-action create-button" type="button" onClick={createMarket} disabled={busy === "create" || !walletReady}>
          {busy === "create" ? "Waiting for wallet" : "Sign create_market"}
        </button>
      </section>

      <section className="field-notes reveal" id="how-it-works">
        <div className="section-kicker">ONE CONTRACT, THREE SIGNALS</div>
        <h2>From a live question to a verifiable outcome.</h2>
        <p className="section-lede">OmniMarket keeps the market surface legible while the Intelligent Contract carries the hard part: state, incentives, evidence, and consensus.</p>
        <div className="note-grid">
          <article className="note-card"><span>01</span><h3>Frame the question</h3><p>Define two outcomes, a close time, and explicit evidence rules before anyone takes a position.</p><a href="#create">Create a market →</a></article>
          <article className="note-card"><span>02</span><h3>Watch conviction move</h3><p>Every refresh reads both contract prices, so the chart reflects the current market split rather than a mocked feed.</p><a href="#markets">Open the console →</a></article>
          <article className="note-card"><span>03</span><h3>Resolve with evidence</h3><p>At close, GenLayer validators interpret the defined source and return an outcome, confidence, and reason code.</p><a href="#docs">Read the model →</a></article>
        </div>
      </section>

      <section className="docs-band reveal" id="docs">
        <div>
          <div className="section-kicker">LIVE PROOF, HONEST BOUNDARY</div>
          <h2>Prediction is uncertainty. Settlement should be explicit.</h2>
          <p>Prices are probabilities, not guarantees. Evidence is public, criteria are inspectable, and an inconclusive result remains a first-class contract state.</p>
        </div>
        <div className="docs-list">
          <div><span>PUBLIC</span><strong>Question, rules, evidence URI, positions</strong></div>
          <div><span>CONSENSUS</span><strong>Web evidence interpreted by GenLayer validators</strong></div>
          <div><span>ON-CHAIN</span><strong>Market state, prices, resolution, and payouts</strong></div>
          <a className="docs-link" href="https://github.com/Manablaq/omnimarket" target="_blank" rel="noreferrer">Read the source and test evidence ↗</a>
        </div>
      </section>

      <footer className="site-footer">
        <a className="brand" href="#home"><span className="brand-mark">OM</span><strong>OmniMarket</strong></a>
        <span>GenLayer Intelligent Contract prediction markets.</span>
        <a href="#home">Back to top ↑</a>
      </footer>
    </main>
  );
}
