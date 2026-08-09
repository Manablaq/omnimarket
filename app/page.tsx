"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type MarketStatus = 0 | 1 | 2 | 3 | 4;

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

const configuredMarketIds = [1, 2, 3];

const featuredFallback: MarketRecord = {
  market_id: 1,
  creator: "0x0000000000000000000000000000000000000000",
  title: "Will ETH close above $5,000 on August 31, 2026?",
  outcome_0: "Yes",
  outcome_1: "No",
  rules:
    "Outcome 0 wins only if a trusted ETH/USD source shows ETH closing above 5000 USD at 23:59 UTC on August 31, 2026. Return inconclusive if the source cannot be fetched or the closing value is ambiguous.",
  evidence_uri: "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
  close_time: 1788220740,
  status: 1,
  created_at: 1785600000,
  liquidity_units: 10000,
  total_0: 12400,
  total_1: 8600,
  fee_units: 210,
  winning_outcome: 0,
  confidence: 0,
  reason_code: "unresolved",
  summary: "",
  resolved_at: 0,
};

const initialSnapshots: MarketSnapshot[] = [
  {
    market: featuredFallback,
    price0Bps: 5904,
    price1Bps: 4096,
    volumeUnits: 21000,
    source: "unconfigured",
    updatedAt: Date.now(),
  },
  {
    market: {
      ...featuredFallback,
      market_id: 2,
      title: "Will a GenLayer ecosystem repository reach 500 stars before Q4 2026?",
      outcome_0: "Yes",
      outcome_1: "No",
      evidence_uri: "https://api.github.com/repos/genlayerlabs/genlayer-project-boilerplate",
      total_0: 9800,
      total_1: 11200,
    },
    price0Bps: 4666,
    price1Bps: 5334,
    volumeUnits: 21000,
    source: "unconfigured",
    updatedAt: Date.now(),
  },
  {
    market: {
      ...featuredFallback,
      market_id: 3,
      title: "Will the next public CPI print come in below consensus forecast?",
      outcome_0: "Below",
      outcome_1: "At or Above",
      evidence_uri: "https://www.bls.gov/cpi/",
      status: 2,
      total_0: 14300,
      total_1: 17700,
    },
    price0Bps: 4468,
    price1Bps: 5532,
    volumeUnits: 32000,
    source: "unconfigured",
    updatedAt: Date.now(),
  },
];

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
  if (points.length < 2) return "";
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 100 - point / 100;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
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
  const [snapshots, setSnapshots] = useState<MarketSnapshot[]>(initialSnapshots);
  const [selectedId, setSelectedId] = useState(1);
  const [side, setSide] = useState<0 | 1>(0);
  const [stakeUnits, setStakeUnits] = useState(500);
  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<ActivityItem>({
    label: "Contract bridge",
    detail: "Waiting for Bradbury contract configuration.",
    tone: "warn",
  });
  const [history, setHistory] = useState<Record<number, number[]>>({
    1: [5200, 5350, 5480, 5610, 5720, 5904],
    2: [5050, 4960, 4810, 4700, 4666],
    3: [4200, 4320, 4410, 4490, 4468],
  });
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

  const selected = snapshots.find((item) => item.market.market_id === selectedId) ?? snapshots[0];
  const selectedPrice = side === 0 ? selected.price0Bps : selected.price1Bps;
  const selectedOutcome = side === 0 ? selected.market.outcome_0 : selected.market.outcome_1;
  const totalPool = selected.market.total_0 + selected.market.total_1;
  const estimatedPayout = selectedPrice > 0 ? Math.round((stakeUnits * 10000) / selectedPrice) : 0;
  const chartPoints = useMemo(
    () => history[selected.market.market_id] ?? [selected.price0Bps],
    [history, selected.market.market_id, selected.price0Bps],
  );
  const path = useMemo(() => chartPath(chartPoints), [chartPoints]);
  const configured = selected.source === "contract";

  const refreshMarket = useCallback(
    async (marketId: number, quiet = false) => {
      if (!quiet) setBusy("refresh");
      try {
        const result = await callOmniMarketApi("snapshot", { marketId });
        if (!result.ok || !result.snapshot) {
          setNotice({
            label: "Contract not configured",
            detail: result.ok ? "No market returned from contract." : result.error,
            tone: "warn",
          });
          return;
        }
        setSnapshots((current) => {
          const next = current.filter((item) => item.market.market_id !== marketId);
          return [...next, result.snapshot!].sort((a, b) => a.market.market_id - b.market.market_id);
        });
        setHistory((current) => {
          const nextPoints = [...(current[marketId] ?? []), result.snapshot!.price0Bps].slice(-28);
          return { ...current, [marketId]: nextPoints };
        });
        setNotice({
          label: "Live contract read",
          detail: `Market ${marketId} updated from get_market and get_price_bps.`,
          tone: "good",
        });
      } finally {
        if (!quiet) setBusy("");
      }
    },
    [],
  );

  useEffect(() => {
    configuredMarketIds.forEach((marketId) => {
      void refreshMarket(marketId, true);
    });
    const interval = window.setInterval(() => {
      void refreshMarket(selectedId, true);
    }, 12000);
    return () => window.clearInterval(interval);
  }, [refreshMarket, selectedId]);

  async function connectWallet() {
    const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum;
    if (!ethereum) {
      setNotice({
        label: "Wallet unavailable",
        detail: "Install a wallet that supports the active GenLayer testnet before trading.",
        tone: "warn",
      });
      return;
    }
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    setWallet(accounts[0] ?? "");
  }

  async function submitTrade() {
    setBusy("trade");
    try {
      const result = await callOmniMarketApi("buy_position", {
        marketId: selected.market.market_id,
        outcomeIndex: side,
        stakeUnits,
        account: wallet,
      });
      if (!result.ok) {
        setNotice({ label: "Trade not submitted", detail: result.error, tone: "warn" });
        return;
      }
      setNotice({
        label: "Trade submitted",
        detail: result.txHash ? `Transaction ${result.txHash}` : "Position submitted to the contract bridge.",
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
      const result = await callOmniMarketApi("create_market", {
        title: marketForm.title,
        outcome0: marketForm.outcome0,
        outcome1: marketForm.outcome1,
        rules: marketForm.rules,
        evidenceUri: marketForm.evidenceUri,
        closeTime: Number(marketForm.closeTime),
        liquidityUnits: Number(marketForm.liquidity),
        account: wallet,
      });
      if (!result.ok) {
        setNotice({ label: "Market not created", detail: result.error, tone: "warn" });
        return;
      }
      setNotice({
        label: "Market created",
        detail: `Contract returned market id ${result.marketId ?? "pending"}.`,
        tone: "good",
      });
      if (result.marketId) {
        setSelectedId(result.marketId);
        await refreshMarket(result.marketId, true);
      }
    } finally {
      setBusy("");
    }
  }

  async function resolveForStudio() {
    setBusy("resolve");
    try {
      const result = await callOmniMarketApi("admin_resolve_for_studio", {
        marketId: selected.market.market_id,
        winningOutcome: side,
        confidence: 9500,
        reasonCode: "studio_verified",
        summary: `${selectedOutcome} selected through the Studio test resolver.`,
        account: wallet,
      });
      if (!result.ok) {
        setNotice({ label: "Resolution not submitted", detail: result.error, tone: "warn" });
        return;
      }
      setNotice({
        label: "Resolution submitted",
        detail: result.txHash ? `Transaction ${result.txHash}` : "Resolver call sent to contract bridge.",
        tone: "good",
      });
      await refreshMarket(selected.market.market_id, true);
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Primary">
        <a className="brand" href="#home" aria-label="OmniMarket home">
          <span className="brand-mark">GF</span>
          <strong>OmniMarket</strong>
        </a>
        <div className="nav-links">
          <a href="#markets">Markets</a>
          <a href="#create">Create</a>
          <a href="#contract">Contract</a>
        </div>
        <button className="wallet-button" type="button" onClick={connectWallet}>
          {wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "Connect Wallet"}
        </button>
      </nav>

      <section className="hero" id="home">
        <div className="hero-copy-block">
          <p className="eyebrow">OmniMarket prediction exchange</p>
          <h1>Markets that settle from live evidence, not operator promises.</h1>
          <p className="hero-copy">
            Create two-outcome markets, trade virtual positions, monitor contract-derived odds, and resolve outcomes through the `OmniMarket` Intelligent Contract.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#markets">Open market console</a>
            <a className="secondary-link" href="#create">Create market</a>
          </div>
        </div>
        <div className="hero-terminal" aria-label="Contract health">
          <div className="terminal-row">
            <span>Contract</span>
            <strong>OmniMarket</strong>
          </div>
          <div className="terminal-row">
            <span>Data source</span>
            <strong>{configured ? "Bradbury contract reads" : "Awaiting env configuration"}</strong>
          </div>
          <div className="terminal-row">
            <span>Chart input</span>
            <strong>get_price_bps</strong>
          </div>
          <div className={`status-note ${notice.tone}`}>
            <span>{notice.label}</span>
            <p>{notice.detail}</p>
          </div>
        </div>
      </section>

      <section className="metrics-strip" aria-label="Market metrics">
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

      <section className="market-workspace" id="markets">
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
              <path className="chart-line" d={path} />
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
              <button className="primary-action" type="button" onClick={submitTrade} disabled={busy === "trade" || !wallet}>
                {busy === "trade" ? "Submitting" : "Submit buy_position"}
              </button>
              {!wallet ? <p className="helper">Connect a wallet before submitting contract writes.</p> : null}
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
            <button className="secondary-action" type="button" onClick={resolveForStudio} disabled={busy === "resolve" || !wallet}>
              {busy === "resolve" ? "Resolving" : "Studio resolve selected side"}
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

      <section className="create-section" id="create">
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
        <button className="primary-action create-button" type="button" onClick={createMarket} disabled={busy === "create" || !wallet}>
          {busy === "create" ? "Creating" : "Submit create_market"}
        </button>
      </section>
    </main>
  );
}
