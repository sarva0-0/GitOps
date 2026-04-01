import { useState, useEffect, useCallback } from "react";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

const STATUS_META = {
  operational:  { color: "#06D6A0", label: "Operational",  glow: "rgba(6,214,160,0.35)"  },
  degraded:     { color: "#F59E0B", label: "Degraded",     glow: "rgba(245,158,11,0.35)" },
  outage:       { color: "#E11D48", label: "Outage",       glow: "rgba(225,29,72,0.35)"  },
  maintenance:  { color: "#7B2FBE", label: "Maintenance",  glow: "rgba(123,47,190,0.35)" },
};

const STATUSES = Object.keys(STATUS_META);

// ── tiny fetch helpers ──────────────────────────────────────────────────────
const apiFetch = (path, opts = {}) =>
  fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  });

// ── timestamp formatter ─────────────────────────────────────────────────────
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [services,    setServices]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [adding,      setAdding]      = useState(false);
  const [newName,     setNewName]     = useState("");
  const [newNote,     setNewNote]     = useState("");
  const [newStatus,   setNewStatus]   = useState("operational");
  const [submitting,  setSubmitting]  = useState(false);
  const [editNote,    setEditNote]    = useState({}); // { [id]: draft }
  const [tick,        setTick]        = useState(0);  // forces timestamp re-render

  // re-render timestamps every 30s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const fetchServices = useCallback(async () => {
    try {
      const data = await apiFetch("/services");
      setServices(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
    const id = setInterval(fetchServices, 15_000); // poll every 15s
    return () => clearInterval(id);
  }, [fetchServices]);

  // ── derived system health ─────────────────────────────────────────────────
  const allOk =
    services.length > 0 && services.every((s) => s.status === "operational");
  const hasOutage    = services.some((s) => s.status === "outage");
  const hasDegraded  = services.some((s) => s.status === "degraded");

  const bannerColor = allOk
    ? "#06D6A0"
    : hasOutage
    ? "#E11D48"
    : "#F59E0B";
  const bannerText = allOk
    ? "✦ All Systems Operational"
    : hasOutage
    ? "✦ Active Outage Detected"
    : hasDegraded
    ? "✦ Partial Degradation"
    : "✦ Maintenance in Progress";

  // ── CRUD ──────────────────────────────────────────────────────────────────
  async function handleAddService(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      const created = await apiFetch("/services", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), status: newStatus, note: newNote.trim() }),
      });
      setServices((prev) => [created, ...prev]);
      setNewName(""); setNewNote(""); setNewStatus("operational");
      setAdding(false);
    } catch (e) {
      alert("Failed to add service: " + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id, status) {
    // optimistic update — UI responds instantly, PATCH fires in background
    setServices((prev) =>
      prev.map((s) => (s._id === id ? { ...s, status, updatedAt: new Date().toISOString() } : s))
    );
    try {
      await apiFetch(`/services/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    } catch (e) {
      fetchServices(); // revert on error
    }
  }

  async function handleNoteSave(id) {
    const note = editNote[id] ?? "";
    setServices((prev) =>
      prev.map((s) => (s._id === id ? { ...s, note, updatedAt: new Date().toISOString() } : s))
    );
    setEditNote((prev) => { const n = {...prev}; delete n[id]; return n; });
    try {
      await apiFetch(`/services/${id}`, { method: "PATCH", body: JSON.stringify({ note }) });
    } catch (e) {
      fetchServices();
    }
  }

  async function handleDelete(id) {
    setServices((prev) => prev.filter((s) => s._id !== id));
    try {
      await apiFetch(`/services/${id}`, { method: "DELETE" });
    } catch (e) {
      fetchServices();
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@300;400;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:        #0A0B0F;
          --surface:   #12141A;
          --border:    #1E2130;
          --border2:   #2A2D3E;
          --text:      #E2E4EE;
          --muted:     #5A5F7A;
          --mono:      'JetBrains Mono', monospace;
          --sans:      'Space Grotesk', sans-serif;
        }

        html, body, #root {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family: var(--sans);
        }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

        .shell {
          max-width: 900px;
          margin: 0 auto;
          padding: 0 24px 80px;
        }

        /* HEADER */
        .header {
          padding: 40px 0 28px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }
        .wordmark {
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: .18em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 8px;
        }
        .title {
          font-size: 26px;
          font-weight: 700;
          color: var(--text);
          letter-spacing: -.5px;
        }
        .title span { color: var(--muted); font-weight: 300; }
        .project-tag {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--muted);
          margin-top: 4px;
          letter-spacing: .12em;
        }
        .add-btn {
          flex-shrink: 0;
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: .08em;
          background: transparent;
          color: var(--text);
          border: 1px solid var(--border2);
          padding: 9px 18px;
          border-radius: 6px;
          cursor: pointer;
          transition: border-color .15s, background .15s;
        }
        .add-btn:hover { border-color: #4A5070; background: #1A1D28; }
        .add-btn.cancel { color: #E11D48; border-color: rgba(225,29,72,.35); }
        .add-btn.cancel:hover { background: rgba(225,29,72,.08); }

        /* BANNER */
        .banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 20px;
          margin: 20px 0 28px;
          border-radius: 8px;
          border: 1px solid;
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: .1em;
          transition: all .4s ease;
        }
        .banner-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: .6; transform: scale(.85); }
        }

        /* ADD FORM */
        .add-form {
          background: var(--surface);
          border: 1px solid var(--border2);
          border-radius: 10px;
          padding: 22px 24px;
          margin-bottom: 24px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .add-form label {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: .12em;
          text-transform: uppercase;
          color: var(--muted);
          display: block;
          margin-bottom: 6px;
        }
        .add-form input,
        .add-form select {
          width: 100%;
          background: #0D0E14;
          border: 1px solid var(--border2);
          border-radius: 6px;
          color: var(--text);
          font-family: var(--mono);
          font-size: 13px;
          padding: 9px 12px;
          outline: none;
          transition: border-color .15s;
        }
        .add-form input:focus,
        .add-form select:focus { border-color: #4A5070; }
        .add-form select option { background: #12141A; }
        .form-row-full { grid-column: 1 / -1; }
        .form-actions {
          grid-column: 1 / -1;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        .submit-btn {
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: .08em;
          background: #1E2130;
          color: #06D6A0;
          border: 1px solid rgba(6,214,160,.3);
          padding: 9px 22px;
          border-radius: 6px;
          cursor: pointer;
          transition: background .15s, border-color .15s;
        }
        .submit-btn:hover { background: rgba(6,214,160,.1); border-color: #06D6A0; }
        .submit-btn:disabled { opacity: .4; cursor: not-allowed; }

        /* CARDS */
        .services-list { display: flex; flex-direction: column; gap: 1px; }
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 20px 22px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px 20px;
          align-items: start;
          transition: border-color .2s;
          animation: fadeIn .25s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .card:hover { border-color: var(--border2); }
        .card-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--text);
          letter-spacing: -.2px;
          margin-bottom: 6px;
        }
        .card-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .status-badge {
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .12em;
          text-transform: uppercase;
          padding: 3px 9px;
          border-radius: 4px;
          border: 1px solid;
        }
        .timestamp {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--muted);
        }
        .note-area { margin-top: 10px; }
        .note-text {
          font-size: 13px;
          color: #8A90A8;
          line-height: 1.5;
          cursor: pointer;
          padding: 4px 0;
          border-bottom: 1px dashed transparent;
          transition: border-color .15s, color .15s;
          min-height: 22px;
        }
        .note-text:hover { border-color: var(--border2); color: var(--text); }
        .note-input {
          width: 100%;
          background: #0D0E14;
          border: 1px solid var(--border2);
          border-radius: 6px;
          color: var(--text);
          font-family: var(--sans);
          font-size: 13px;
          padding: 7px 10px;
          outline: none;
          resize: none;
        }
        .note-input:focus { border-color: #4A5070; }
        .note-actions { display: flex; gap: 8px; margin-top: 6px; }
        .note-save, .note-cancel {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: .08em;
          padding: 4px 10px;
          border-radius: 4px;
          border: 1px solid;
          cursor: pointer;
          transition: background .15s;
        }
        .note-save   { background: rgba(6,214,160,.08); color:#06D6A0; border-color: rgba(6,214,160,.3); }
        .note-save:hover { background: rgba(6,214,160,.16); }
        .note-cancel { background: transparent; color: var(--muted); border-color: var(--border2); }
        .note-cancel:hover { background: #1A1D28; }

        .card-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 10px;
          padding-top: 2px;
        }
        .status-select {
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 500;
          background: #0D0E14;
          border: 1px solid var(--border2);
          border-radius: 6px;
          color: var(--text);
          padding: 6px 28px 6px 10px;
          cursor: pointer;
          outline: none;
          transition: border-color .15s;
          appearance: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%235A5F7A' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          background-color: #0D0E14;
        }
        .status-select:focus { border-color: #4A5070; }
        .status-select option { background: #12141A; color: var(--text); }
        .delete-btn {
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 500;
          letter-spacing: .08em;
          background: transparent;
          color: var(--muted);
          border: 1px solid transparent;
          padding: 5px 10px;
          border-radius: 5px;
          cursor: pointer;
          transition: color .15s, border-color .15s, background .15s;
        }
        .delete-btn:hover { color: #E11D48; border-color: rgba(225,29,72,.3); background: rgba(225,29,72,.06); }

        /* STATES */
        .state-msg {
          text-align: center;
          padding: 60px 0;
          color: var(--muted);
          font-family: var(--mono);
          font-size: 13px;
          letter-spacing: .06em;
        }
        .state-msg .big { font-size: 28px; display: block; margin-bottom: 12px; }

        /* SECTION LABEL */
        .section-label {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: .18em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .section-label::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border);
        }

        /* FOOTER */
        .footer {
          margin-top: 60px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .footer-text {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--muted);
          letter-spacing: .1em;
        }
        .footer-dot { color: #06D6A0; }
      `}</style>

      <div className="shell">

        {/* HEADER */}
        <header className="header">
          <div>
            <div className="wordmark">Project #49 · GitOps · AWS · K8s</div>
            <h1 className="title">System <span>Status</span></h1>
            <div className="project-tag">
              LIVE · {services.length} service{services.length !== 1 ? "s" : ""} monitored
            </div>
          </div>
          <button
            className={`add-btn${adding ? " cancel" : ""}`}
            onClick={() => {
              setAdding((v) => !v);
              setNewName(""); setNewNote(""); setNewStatus("operational");
            }}
          >
            {adding ? "✕ Cancel" : "+ Add Service"}
          </button>
        </header>

        {/* BANNER */}
        {!loading && (
          <div
            className="banner"
            style={{
              color: bannerColor,
              borderColor: bannerColor + "40",
              background: bannerColor + "0D",
            }}
          >
            <span
              className="banner-dot"
              style={{ background: bannerColor, boxShadow: `0 0 8px ${bannerColor}` }}
            />
            {bannerText}
          </div>
        )}

        {/* ADD FORM */}
        {adding && (
          <form className="add-form" onSubmit={handleAddService}>
            <div>
              <label>Service Name</label>
              <input
                type="text"
                placeholder="e.g. API Gateway"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div>
              <label>Initial Status</label>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </div>
            <div className="form-row-full">
              <label>Note (optional)</label>
              <input
                type="text"
                placeholder="e.g. All healthy"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="submit-btn" disabled={submitting}>
                {submitting ? "Creating…" : "Create Service"}
              </button>
            </div>
          </form>
        )}

        {/* SERVICES */}
        {loading ? (
          <div className="state-msg">
            <span className="big">⟳</span>Fetching services…
          </div>
        ) : error ? (
          <div className="state-msg" style={{ color: "#E11D48" }}>
            <span className="big">⚠</span>{error}
          </div>
        ) : services.length === 0 ? (
          <div className="state-msg">
            <span className="big">◫</span>No services yet — add one above.
          </div>
        ) : (
          <>
            <div className="section-label">Services</div>
            <div className="services-list">
              {services.map((svc) => {
                const meta = STATUS_META[svc.status] || STATUS_META.operational;
                const isEditingNote = svc._id in editNote;

                return (
                  <div className="card" key={svc._id}>
                    <div className="card-left">
                      <div className="card-name">{svc.name}</div>
                      <div className="card-meta">
                        <span
                          className="status-badge"
                          style={{
                            color: meta.color,
                            borderColor: meta.color + "50",
                            background: meta.color + "15",
                            boxShadow: `0 0 8px ${meta.glow}`,
                          }}
                        >
                          {meta.label}
                        </span>
                        <span className="timestamp">Updated {timeAgo(svc.updatedAt)}</span>
                      </div>

                      <div className="note-area">
                        {isEditingNote ? (
                          <>
                            <textarea
                              className="note-input"
                              rows={2}
                              value={editNote[svc._id]}
                              onChange={(e) =>
                                setEditNote((prev) => ({ ...prev, [svc._id]: e.target.value }))
                              }
                              autoFocus
                            />
                            <div className="note-actions">
                              <button
                                className="note-save"
                                type="button"
                                onClick={() => handleNoteSave(svc._id)}
                              >
                                Save
                              </button>
                              <button
                                className="note-cancel"
                                type="button"
                                onClick={() =>
                                  setEditNote((prev) => {
                                    const n = { ...prev }; delete n[svc._id]; return n;
                                  })
                                }
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <div
                            className="note-text"
                            title="Click to edit note"
                            onClick={() =>
                              setEditNote((prev) => ({ ...prev, [svc._id]: svc.note || "" }))
                            }
                          >
                            {svc.note || (
                              <span style={{ color: "var(--muted)", fontStyle: "italic" }}>
                                Add a note…
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="card-right">
                      <select
                        className="status-select"
                        value={svc.status}
                        onChange={(e) => handleStatusChange(svc._id, e.target.value)}
                        style={{ color: meta.color }}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{STATUS_META[s].label}</option>
                        ))}
                      </select>
                      <button
                        className="delete-btn"
                        onClick={() => handleDelete(svc._id)}
                        title="Delete service"
                      >
                        ✕ Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* FOOTER */}
        <footer className="footer">
          <span className="footer-text">
            <span className="footer-dot">●</span> Live · polls every 15s
          </span>
          <span className="footer-text">{API.replace("http://", "")}</span>
        </footer>

      </div>
    </>
  );
}
