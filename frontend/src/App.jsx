import { useState, useEffect, useCallback } from "react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

const ENV_COLOR = {
  production: { bg: "#ff4444", text: "#fff", label: "PROD" },
  staging:    { bg: "#f5a623", text: "#000", label: "STG" },
  dev:        { bg: "#4a9eff", text: "#fff", label: "DEV" },
};

const STATUS_CONFIG = {
  success:     { color: "#00e676", icon: "▲", label: "SUCCESS" },
  failed:      { color: "#ff1744", icon: "✕", label: "FAILED" },
  "in-progress": { color: "#f5a623", icon: "◉", label: "IN PROGRESS" },
};

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "#0d0d0d",
      border: `1px solid ${accent}33`,
      borderLeft: `3px solid ${accent}`,
      padding: "20px 24px",
      flex: 1,
      minWidth: 160,
    }}>
      <div style={{ color: "#555", fontSize: 10, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>{label}</div>
      <div style={{ color: accent, fontSize: 36, fontWeight: 700, lineHeight: 1, fontFamily: "'Syne', sans-serif" }}>{value}</div>
      {sub && <div style={{ color: "#555", fontSize: 11, marginTop: 6, fontFamily: "'Space Mono', monospace" }}>{sub}</div>}
    </div>
  );
}

function DeployCard({ d, idx }) {
  const env = ENV_COLOR[d.environment] || ENV_COLOR.dev;
  const st  = STATUS_CONFIG[d.status]  || STATUS_CONFIG["in-progress"];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), idx * 40);
    return () => clearTimeout(t);
  }, [idx]);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "3px 1fr",
      opacity: visible ? 1 : 0,
      transform: visible ? "none" : "translateY(8px)",
      transition: "opacity 0.3s ease, transform 0.3s ease",
    }}>
      <div style={{ background: st.color, borderRadius: "2px 0 0 2px" }} />
      <div style={{
        background: "#0d0d0d",
        border: "1px solid #1a1a1a",
        borderLeft: "none",
        padding: "16px 20px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "12px 20px",
      }}>
        {/* Status icon */}
        <span style={{ color: st.color, fontSize: 18, width: 20, textAlign: "center", flexShrink: 0 }}>{st.icon}</span>

        {/* Service name */}
        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: "#eee", minWidth: 110 }}>
          {d.service}
        </span>

        {/* Env badge */}
        <span style={{
          background: env.bg,
          color: env.text,
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: 2,
          padding: "3px 8px",
          fontFamily: "'Space Mono', monospace",
          borderRadius: 2,
          flexShrink: 0,
        }}>{env.label}</span>

        {/* SHA */}
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#4a9eff", background: "#0a1a2f", padding: "2px 8px", borderRadius: 3 }}>
          {d.sha.slice(0, 7)}
        </span>

        {/* Status label */}
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: st.color, letterSpacing: 1 }}>
          {st.label}
        </span>

        {/* Spacer */}
        <span style={{ flex: 1 }} />

        {/* Duration */}
        {d.duration && (
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#444" }}>
            ⏱ {d.duration}s
          </span>
        )}

        {/* Deployer */}
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#666" }}>
          @{d.deployer}
        </span>

        {/* Time */}
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#444", minWidth: 60, textAlign: "right" }}>
          {timeAgo(d.timestamp)}
        </span>
      </div>
    </div>
  );
}

function FilterPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? "#eee" : "transparent",
      color: active ? "#000" : "#555",
      border: "1px solid",
      borderColor: active ? "#eee" : "#2a2a2a",
      padding: "5px 14px",
      fontFamily: "'Space Mono', monospace",
      fontSize: 11,
      letterSpacing: 1,
      cursor: "pointer",
      borderRadius: 2,
      transition: "all 0.15s",
    }}>{label}</button>
  );
}

export default function App() {
  const [deployments, setDeployments] = useState([]);
  const [stats, setStats]             = useState(null);
  const [services, setServices]       = useState([]);
  const [filter, setFilter]           = useState({ service: "", environment: "", status: "" });
  const [total, setTotal]             = useState(0);
  const [ticker, setTicker]           = useState(0);
  const [lastPulse, setLastPulse]     = useState(Date.now());

  const fetchAll = useCallback(async () => {
    const params = new URLSearchParams({ limit: 50 });
    if (filter.service)     params.set("service", filter.service);
    if (filter.environment) params.set("environment", filter.environment);
    if (filter.status)      params.set("status", filter.status);

    const [dRes, sRes, svRes] = await Promise.all([
      fetch(`${API}/deployments?${params}`),
      fetch(`${API}/deployments/stats`),
      fetch(`${API}/services`),
    ]);
    const dData  = await dRes.json();
    const sData  = await sRes.json();
    const svData = await svRes.json();

    setDeployments(dData.deployments || []);
    setTotal(dData.total || 0);
    setStats(sData);
    setServices(svData || []);
    setLastPulse(Date.now());
  }, [filter]);

  // Initial load + polling every 8s
  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const t = setInterval(() => { fetchAll(); setTicker(n => n + 1); }, 8000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const sinceRefresh = Math.floor((Date.now() - lastPulse) / 1000);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070707",
      color: "#ccc",
      fontFamily: "'Space Mono', monospace",
      padding: "0 0 60px",
    }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #070707; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0d0d0d; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; }

        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes scan {
          0% { background-position: 0 0; }
          100% { background-position: 0 100px; }
        }
      `}</style>

      {/* Top bar */}
      <div style={{
        borderBottom: "1px solid #141414",
        padding: "14px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        background: "#070707",
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#00e676",
            boxShadow: "0 0 10px #00e676",
            animation: "blink 2s infinite",
          }} />
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, color: "#fff", letterSpacing: 1 }}>
            DEPLOYBOARD
          </span>
          <span style={{ color: "#333", fontSize: 12 }}>|</span>
          <span style={{ color: "#333", fontSize: 11, letterSpacing: 2 }}>GITOPS PIPELINE</span>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#333" }}>REFRESH IN {8 - (sinceRefresh % 8)}s</span>
          <span style={{ fontSize: 10, color: "#333" }}>TOTAL DEPLOYS: <span style={{ color: "#eee" }}>{total}</span></span>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>

        {/* Stats row */}
        {stats && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "32px 0 28px" }}>
            <StatCard label="Deploys Today"  value={stats.today}           accent="#4a9eff" />
            <StatCard label="Success Rate"   value={`${stats.successRate}%`} accent="#00e676" sub={`${stats.successToday} passed / ${stats.failedToday} failed`} />
            <StatCard label="Avg Duration"   value={`${stats.avgDuration}s`} accent="#f5a623" />
            <StatCard label="Busiest Service" value={stats.busiestService}  accent="#c084fc" />
            <StatCard label="All Time"        value={stats.allTime}         accent="#555" />
          </div>
        )}

        {/* Filter bar */}
        <div style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: "1px solid #111",
          alignItems: "center",
        }}>
          <span style={{ color: "#333", fontSize: 10, letterSpacing: 2, marginRight: 4 }}>ENV</span>
          {["", "production", "staging", "dev"].map(e => (
            <FilterPill key={e} label={e || "ALL"} active={filter.environment === e}
              onClick={() => setFilter(f => ({ ...f, environment: e }))} />
          ))}
          <span style={{ color: "#222", margin: "0 8px" }}>|</span>
          <span style={{ color: "#333", fontSize: 10, letterSpacing: 2, marginRight: 4 }}>STATUS</span>
          {["", "success", "failed", "in-progress"].map(s => (
            <FilterPill key={s} label={s || "ALL"} active={filter.status === s}
              onClick={() => setFilter(f => ({ ...f, status: s }))} />
          ))}
          {services.length > 0 && (
            <>
              <span style={{ color: "#222", margin: "0 8px" }}>|</span>
              <span style={{ color: "#333", fontSize: 10, letterSpacing: 2, marginRight: 4 }}>SVC</span>
              {["", ...services].map(s => (
                <FilterPill key={s} label={s || "ALL"} active={filter.service === s}
                  onClick={() => setFilter(f => ({ ...f, service: s }))} />
              ))}
            </>
          )}
        </div>

        {/* Deploy list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {deployments.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "80px 0",
              color: "#2a2a2a",
              fontSize: 13,
              letterSpacing: 3,
            }}>
              NO DEPLOYMENTS YET — PUSH TO MAIN TO BEGIN
            </div>
          ) : (
            deployments.map((d, i) => <DeployCard key={d._id} d={d} idx={i} />)
          )}
        </div>

      </div>
    </div>
  );
}
