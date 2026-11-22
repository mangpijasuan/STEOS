"use client";

import { useCallback, useEffect, useState } from "react";

type Estimate = { platformFeeCents: number; processingCents: number; monthlyFeeCents: number; restaurantCostCents: number; effectiveRateBps: number };
type Plan = { key: string; label: string; summary: string; unavailable?: string; estimate: Estimate };

const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [sales, setSales] = useState(10000);
  const [avg, setAvg] = useState(30);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/pricing?monthlySalesCents=${Math.round(sales * 100)}&avgOrderCents=${Math.round(avg * 100)}`);
    if (res.status === 401) return void (window.location.href = "/login");
    if (res.status === 403) return setMessage("Only the restaurant owner can see pricing.");
    const data = await res.json();
    setPlans(data.plans);
    setCurrent(data.current);
  }, [sales, avg]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function choose(key: string) {
    const res = await fetch("/api/staff/pricing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: key }) });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Plan changed. It applies to new orders; existing orders keep their price." : (data.error ?? "Could not change the plan"));
    if (res.ok) setCurrent(key);
  }

  return (
    <main style={{ maxWidth: 900 }}>
      <p><a href="/dashboard">← Dashboard</a></p>
      <h1>Pricing plan</h1>
      <p>Compare what each plan would cost you each month, then choose. These rates are introductory and may change; a change never affects orders already placed.</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "12px 0" }}>
        <label>Online sales per month ($)
          <input type="number" min={0} value={sales} onChange={(e) => setSales(Math.max(0, Number(e.target.value)))} style={{ display: "block", padding: 8, fontSize: 16 }} />
        </label>
        <label>Average order ($)
          <input type="number" min={1} value={avg} onChange={(e) => setAvg(Math.max(1, Number(e.target.value)))} style={{ display: "block", padding: 8, fontSize: 16 }} />
        </label>
      </div>
      {message && <p role="status" style={{ background: "#eef", padding: 10, borderRadius: 8 }}>{message}</p>}
      {plans.map((p) => (
        <section key={p.key} style={{ border: p.key === current ? "3px solid #15803d" : "1px solid #ddd", borderRadius: 12, padding: 14, marginBottom: 12, background: "#fff", opacity: p.unavailable ? 0.6 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <strong style={{ fontSize: 18 }}>{p.label}{p.key === current && " · your plan"}</strong>
            <strong>{money(p.estimate.restaurantCostCents)} / month ({(p.estimate.effectiveRateBps / 100).toFixed(1)}%)</strong>
          </div>
          <p style={{ margin: "6px 0" }}>{p.summary}</p>
          <p style={{ margin: "6px 0", color: "#555", fontSize: 14 }}>
            SROS fee {money(p.estimate.platformFeeCents)} · card fees {money(p.estimate.processingCents)}
            {p.estimate.monthlyFeeCents > 0 && ` · subscription ${money(p.estimate.monthlyFeeCents)}`}
          </p>
          {p.unavailable ? <em>{p.unavailable}</em> : p.key !== current && <button onClick={() => choose(p.key)} style={{ padding: "10px 16px", fontSize: 16 }}>Choose this plan</button>}
        </section>
      ))}
      <p style={{ color: "#666", fontSize: 14 }}>Estimates assume online sales only, card fees of 2.9% + 30¢ per order, and ignore tax and tips.</p>
    </main>
  );
}
