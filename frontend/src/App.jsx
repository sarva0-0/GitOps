import { useState, useEffect, useCallback } from "react";

const API = "http://54.84.239.147:30001";

const ENV = {
  production: { bg: "#dc2626", text: "#fef2f2", label: "PROD" },
  staging:    { bg: "#d97706", text: "#fffbeb", label: "STG"  },
  dev:        { bg: "#2563eb", text: "#eff6ff", label: "DEV"  },
};

const STATUS = {
  success:       { color: "#22c55e", dimColor: "#14532d", icon: "✓", label: "Success"     },
  failed:        { color: "#ef4444", dimColor: "#7f1d1d", icon: "✕", label: "Failed"      },
  "in-progress": { color: "#f59e0b", dimColor: "#78350f", icon: "◉", label: "In Progress" },
};

function ago(ts) {
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60)    return `${Math.floor(s)}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Avatar({ name, size = 28 }) {
  const colors = ["#6366f1","#8b5cf6","#ec4899","#14b8a6","#f59e0b","#3b82f6"];
  const bg = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.38), fontWeight: 600, color: "#fff", flexShrink: 0,
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Stat({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: "#111827", border: "1px solid #1f2937",
      borderRadius: 12, padding: "18px 20px", flex: 1, minWidth: 148,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: "#6b7280", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 15, opacity: 0.5 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function Card({ d, idx }) {
  const env = ENV[d.environment]  || ENV.dev;
  const st  = STATUS[d.status]    || STATUS["in-progress"];
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), idx * 35);
    return () => clearTimeout(t);
  }, [idx]);

  return (
    <div style={{
      background: "#0f172a",
      border: "1px solid #1e293b",
      borderLeft: `3px solid ${st.color}`,
      borderRadius: "0 10px 10px 0",
      padding: "13px 18px",
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px",
      opacity: show ? 1 : 0,
      transform: show ? "none" : "translateY(6px)",
      transition: "opacity 0.25s ease, transform 0.25s ease",
    }}>
      {/* Status circle */}
      <div style={{
        width: 26, height: 26, borderRadius: "50%",
        background: st.dimColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: st.color, fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>{st.icon}</div>

      {/* Service */}
      <span style={{ fontWeight: 700, fontSize: 13, color: "#f1f5f9", minWidth: 110 }}>
        {d.service}
      </span>

      {/* Env badge */}
      <span style={{
        background: env.bg, color: env.text,
        fontSize: 8, fontWeight: 800, letterSpacing: "0.1em",
        padding: "2px 7px", borderRadius: 4, flexShrink: 0,
      }}>{env.label}</span>

      {/* SHA */}
      <code style={{
        background: "#1e3a5f", color: "#60a5fa",
        fontSize: 10, padding: "2px 7px", borderRadius: 4,
        fontFamily: "'Space Mono', monospace",
      }}>{d.sha ? d.sha.slice(0, 7) : "unknown"}</code>

      {/* Branch */}
      {d.branch && (
        <span style={{
          fontSize: 10, color: "#a78bfa", background: "#1e1b4b",
          padding: "2px 7px", borderRadius: 4,
        }}>⎇ {d.branch}</span>
      )}

      {/* Commit message */}
      {d.message && (
        <span style={{
          fontSize: 11, color: "#64748b", flex: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
        }}>{d.message}</span>
      )}

      <span style={{ flex: 1, minWidth: 4 }} />

      {/* Status label */}
      <span style={{ fontSize: 11, color: st.color, fontWeight: 600, flexShrink: 0 }}>{st.label}</span>

      {/* Duration */}
      {d.duration && (
        <span style={{ fontSize: 11, color: "#475569", flexShrink: 0 }}>⏱ {d.duration}s</span>
      )}

      {/* Deployer */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
        <Avatar name={d.deployer} size={20} />
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{d.deployer}</span>
      </div>

      {/* Time */}
      <span style={{ fontSize: 11, color: "#334155", minWidth: 52, textAlign: "right", flexShrink: 0 }}>
        {ago(d.timestamp)}
      </span>
    </div>
  );
}

function Pill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? "#6366f1" : "transparent",
      color: active ? "#fff" : "#6b7280",
      border: `1px solid ${active ? "#6366f1" : "#374151"}`,
      padding: "4px 12px", fontSize: 11, borderRadius: 6,
      cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
      fontWeight: active ? 600 : 400,
    }}>{label}</button>
  );
}

export default function App() {
  const [deployments, setDeployments] = useState([]);
  const [stats, setStats]             = useState(null);
  const [services, setServices]       = useState([]);
  const [filter, setFilter]           = useState({ service: "", environment: "", status: "" });
  const [total, setTotal]             = useState(0);
  const [tick, setTick]               = useState(8);
  const [activity, setActivity]       = useState([]);

  const fetchAll = useCallback(async () => {
    try {
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
      setTick(8);

      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return { label: d.toLocaleDateString("en", { weekday: "short" }), date: d.toDateString(), count: 0, failed: 0 };
      });
      (dData.deployments || []).forEach(dep => {
        const day = days.find(d => d.date === new Date(dep.timestamp).toDateString());
        if (day) { day.count++; if (dep.status === "failed") day.failed++; }
      });
      setActivity(days);
    } catch (e) { console.error(e); }
  }, [filter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { const t = setInterval(fetchAll, 8000); return () => clearInterval(t); }, [fetchAll]);
  useEffect(() => { const t = setInterval(() => setTick(s => s <= 1 ? 8 : s - 1), 1000); return () => clearInterval(t); }, []);

  const successPct = stats?.successRate ?? 0;
  const ringColor  = successPct >= 80 ? "#22c55e" : successPct >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ minHeight: "100vh", background: "#030712", color: "#cbd5e1", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 60 }}>
      <style>{`
        @import url('https://fonts.bunny.net/css?family=inter:400,500,600,700|space-mono:400,700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #030712; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
      `}</style>

      {/* ── Header ── */}
      <header style={{
        borderBottom: "1px solid #0f172a", padding: "0 32px", height: 54,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, background: "#030712", zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 26, height: 26, background: "#6366f1", borderRadius: 7,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: "#fff",
            }}>D</div>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#f8fafc", letterSpacing: "-0.02em" }}>DeployBoard</span>
          </div>
          <nav style={{ display: "flex", gap: 2 }}>
            {["Overview", "Deployments", "Services"].map((n, i) => (
              <span key={n} style={{
                padding: "5px 11px", fontSize: 13, borderRadius: 6, cursor: "pointer",
                color: i === 0 ? "#f8fafc" : "#64748b",
                background: i === 0 ? "#1e293b" : "transparent",
                fontWeight: i === 0 ? 500 : 400,
              }}>{n}</span>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 11, color: "#475569" }}>Live · {tick}s</span>
          </div>
          <div style={{
            background: "#0f172a", border: "1px solid #1e293b",
            borderRadius: 7, padding: "4px 11px", fontSize: 11, color: "#64748b",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ color: "#818cf8" }}>⎇</span> GitOps · ArgoCD · ECR
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 24px" }}>

        {/* ── Page title ── */}
        <div style={{ padding: "26px 0 22px" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
            Deployment Overview
          </h1>
          <p style={{ fontSize: 12, color: "#475569", marginTop: 5 }}>
            Every deployment across all services — auto-tracked by GitHub Actions → ArgoCD → Kubernetes.
          </p>
        </div>

        {/* ── Stat cards ── */}
        {stats && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            <Stat label="Deploys today"    value={stats.today}              color="#818cf8" icon="🚀"
              sub={`${stats.successToday} passed · ${stats.failedToday} failed`} />
            <Stat label="Success rate"     value={`${stats.successRate}%`}  color="#22c55e" icon="✓"
              sub="Last 24 hours" />
            <Stat label="Avg build time"   value={`${stats.avgDuration}s`}  color="#f59e0b" icon="⏱"
              sub="All services" />
            <Stat label="Busiest service"  value={stats.busiestService}     color="#a78bfa" icon="⎇"
              sub="Most active" />
            <Stat label="All-time"         value={stats.allTime}            color="#475569" icon="∑"
              sub="Total deploys" />
          </div>
        )}

        {/* ── Charts row ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>

          {/* 7-day activity */}
          <div style={{
            background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
            padding: "18px 20px", flex: 2, minWidth: 260,
          }}>
            <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>7-Day Activity</div>
            <div style={{ fontSize: 11, color: "#334155", marginBottom: 14 }}>Green = all passed · Red = any failed</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 56 }}>
              {activity.map((d, i) => {
                const maxC = Math.max(...activity.map(a => a.count), 1);
                const h = d.count > 0 ? Math.max((d.count / maxC) * 48, 10) : 4;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, height: "100%", justifyContent: "flex-end" }}>
                    <div style={{
                      width: "100%", height: `${h}px`,
                      background: d.count === 0 ? "#1e293b" : d.failed > 0 ? "#ef4444" : "#22c55e",
                      borderRadius: "3px 3px 0 0",
                      opacity: d.count === 0 ? 0.4 : 0.9,
                    }} />
                    <div style={{ fontSize: 9, color: "#334155" }}>{d.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Success ring */}
          <div style={{
            background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
            padding: "18px 20px", minWidth: 170, display: "flex", flexDirection: "column", alignItems: "center",
          }}>
            <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14, alignSelf: "flex-start" }}>Success Rate</div>
            <svg width="90" height="90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="38" fill="none" stroke="#1e293b" strokeWidth="10" />
              <circle cx="50" cy="50" r="38" fill="none"
                stroke={ringColor} strokeWidth="10"
                strokeDasharray={`${successPct * 2.39} 239`}
                strokeLinecap="round" transform="rotate(-90 50 50)"
              />
              <text x="50" y="50" textAnchor="middle" dominantBaseline="middle"
                fill="#f1f5f9" fontSize="16" fontWeight="700" fontFamily="Inter, sans-serif">
                {successPct}%
              </text>
            </svg>
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <span style={{ fontSize: 10, color: "#22c55e" }}>✓ {stats?.successToday ?? 0}</span>
              <span style={{ fontSize: 10, color: "#ef4444" }}>✕ {stats?.failedToday ?? 0}</span>
            </div>
          </div>

          {/* Env breakdown */}
          <div style={{
            background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
            padding: "18px 20px", minWidth: 180,
          }}>
            <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>By Environment</div>
            {["production", "staging", "dev"].map(env => {
              const count = deployments.filter(d => d.environment === env).length;
              const pct   = deployments.length > 0 ? Math.round((count / deployments.length) * 100) : 0;
              const e     = ENV[env];
              return (
                <div key={env} style={{ marginBottom: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        background: e.bg, color: e.text,
                        fontSize: 7, fontWeight: 800, padding: "1px 5px", borderRadius: 3,
                      }}>{e.label}</span>
                      <span style={{ fontSize: 11, color: "#64748b" }}>{env}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "#475569" }}>{count}</span>
                  </div>
                  <div style={{ height: 3, background: "#1e293b", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: e.bg, borderRadius: 2, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Filters ── */}
        <div style={{
          display: "flex", gap: 6, flexWrap: "wrap",
          marginBottom: 12, paddingBottom: 14,
          borderBottom: "1px solid #0f172a", alignItems: "center",
        }}>
          <span style={{ fontSize: 10, color: "#334155", letterSpacing: "0.06em", textTransform: "uppercase" }}>Env</span>
          {["", "production", "staging", "dev"].map(e => (
            <Pill key={e} label={e || "All"} active={filter.environment === e}
              onClick={() => setFilter(f => ({ ...f, environment: e }))} />
          ))}
          <span style={{ color: "#0f172a", margin: "0 2px" }}>|</span>
          <span style={{ fontSize: 10, color: "#334155", letterSpacing: "0.06em", textTransform: "uppercase" }}>Status</span>
          {["", "success", "failed", "in-progress"].map(s => (
            <Pill key={s} label={s || "All"} active={filter.status === s}
              onClick={() => setFilter(f => ({ ...f, status: s }))} />
          ))}
          {services.length > 0 && (
            <>
              <span style={{ color: "#0f172a", margin: "0 2px" }}>|</span>
              <span style={{ fontSize: 10, color: "#334155", letterSpacing: "0.06em", textTransform: "uppercase" }}>Service</span>
              {["", ...services].map(s => (
                <Pill key={s} label={s || "All"} active={filter.service === s}
                  onClick={() => setFilter(f => ({ ...f, service: s }))} />
              ))}
            </>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#334155" }}>
            Showing {deployments.length} of {total}
          </span>
        </div>

        {/* ── Column headers ── */}
        <div style={{
          display: "flex", padding: "0 18px 8px 58px",
          fontSize: 9, color: "#334155", letterSpacing: "0.1em", textTransform: "uppercase", gap: 14,
        }}>
          <span style={{ minWidth: 110 }}>Service</span>
          <span style={{ minWidth: 36 }}>Env</span>
          <span style={{ minWidth: 60 }}>Commit</span>
          <span style={{ minWidth: 80 }}>Branch</span>
          <span style={{ flex: 1 }}>Message</span>
          <span style={{ minWidth: 72 }}>Status</span>
          <span style={{ minWidth: 48 }}>Time</span>
          <span style={{ minWidth: 80 }}>Deployer</span>
          <span style={{ minWidth: 52 }}>When</span>
        </div>

        {/* ── Deploy list ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {deployments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#1e293b", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              No deployments yet — push to main to begin
            </div>
          ) : (
            deployments.map((d, i) => <Card key={d._id || i} d={d} idx={i} />)
          )}
        </div>
      </div>
    </div>
  );
}
