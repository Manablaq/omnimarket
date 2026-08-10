export default function Loading() {
  return <main className="app-shell fallback-shell" aria-busy="true"><nav className="topbar" aria-label="Loading"><div className="brand"><span className="brand-mark">OM</span><strong>OmniMarket</strong></div><span className="loading-label">Reading Bradbury state...</span></nav><section className="loading-card"><span className="section-kicker">LIVE CONTRACT DATA</span><div className="loading-bar loading-bar-large" /><div className="loading-bar" /><div className="loading-grid"><div /><div /><div /></div></section></main>;
}
