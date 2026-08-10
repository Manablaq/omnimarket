"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="app-shell fallback-shell">
    <nav className="topbar" aria-label="Primary"><Link className="brand" href="/"><span className="brand-mark">OM</span><strong>OmniMarket</strong></Link><Link className="secondary-link" href="/docs">Read docs</Link></nav>
    <section className="fallback-card" role="alert"><span className="section-kicker">RECOVERABLE APP ERROR</span><h1>OmniMarket could not finish loading.</h1><p>The contract bridge or wallet session returned an unexpected response. No wallet funds were moved by this screen.</p><p className="fallback-detail">Refresh the app or return to the documentation. If the issue continues, check the public deployment status.</p><div className="hero-actions"><button className="primary-action" type="button" onClick={() => reset()}>Try again</button><Link className="secondary-link" href="/">Reload app</Link></div></section>
  </main>;
}
