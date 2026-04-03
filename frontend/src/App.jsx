import { useState, useEffect, useCallback } from "react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

export default function App() {
  const [deployments, setDeployments] = useState([]);
  const [stats, setStats] = useState(null);
  const [services, setServices] = useState([]);
  const [filter, setFilter] = useState({ service: "", environment: "", status: "" });
  const [total, setTotal] = useState(0);

  const fetchAll = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: 50 });

      if (filter.service) params.set("service", filter.service);
      if (filter.environment) params.set("environment", filter.environment);
      if (filter.status) params.set("status", filter.status);

      const [dRes, sRes, svRes] = await Promise.all([
        fetch(`${API}/deployments?${params}`),
        fetch(`${API}/deployments/stats`),
        fetch(`${API}/services`)
      ]);

      if (!dRes.ok || !sRes.ok || !svRes.ok) {
        throw new Error("API error");
      }

      const dData = await dRes.json();
      const sData = await sRes.json();
      const svData = await svRes.json();

      setDeployments(dData.deployments || []);
      setTotal(dData.total || 0);
      setStats(sData || {});
      setServices(svData || []);

    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, [filter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const t = setInterval(fetchAll, 8000);
    return () => clearInterval(t);
  }, [fetchAll]);

  return (
    <div style={{ padding: 20 }}>
      <h1>Deploy Dashboard</h1>

      <p>Total: {total}</p>

      {deployments.map((d, i) => (
        <div key={d._id || i} style={{ marginBottom: 10 }}>
          <strong>{d.service}</strong> — {d.status} — {d.sha?.slice(0, 7) || "N/A"}
        </div>
      ))}
    </div>
  );
}
