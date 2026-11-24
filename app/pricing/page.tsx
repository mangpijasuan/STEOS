"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Skeleton, StaffTopbar, api, useMe, useToasts } from "../ui";
import { money } from "@/lib/format";

type Estimate = { platformFeeCents: number; processingCents: number; monthlyFeeCents: number; restaurantCostCents: number; effectiveRateBps: number };
type Plan = { key: string; label: string; summary: string; unavailable?: string; estimate: Estimate };

export default function Pricing() {
  const me = useMe();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [current, setCurrent] = useState("");
  const [sales, setSales] = useState(10000);
  const [avg, setAvg] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const { toast, toasts } = useToasts();

  const load = useCallback(async () => {
    const r = await api<{ plans: Plan[]; current: string }>(`/api/staff/pricing?monthlySalesCents=${Math.round(sales * 100)}&avgOrderCents=${Math.round(avg * 100)}`);
    if (r.ok) {
      setPlans(r.data.plans);
      setCurrent(r.data.current);
      setError(null);
    } else setError(r.status === 403 ? "Only the restaurant owner can see pricing." : r.error);
  }, [sales, avg]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function choose(plan: Plan) {
    setChoosing(plan.key);
    const r = await api("/api/staff/pricing", { method: "PUT", json: { plan: plan.key } });
    setChoosing(null);
    if (r.ok) {
      setCurrent(plan.key);
      toast(`Switched to ${plan.label}. It applies to new orders only.`);
    } else toast(r.error, "danger");
  }

  const cheapest = plans?.filter((p) => !p.unavailable).reduce<Plan | null>((best, p) => (!best || p.estimate.restaurantCostCents < best.estimate.restaurantCostCents ? p : best), null);

  return (
    <>
      <StaffTopbar current="/pricing" me={me} />
      <main className="container container-md page stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <div>
          <h1>Pricing plan</h1>
          <p className="muted" style={{ marginTop: 6 }}>See what each plan would cost you in a typical month, then choose. Rates are introductory and may change. A change never affects orders already placed.</p>
        </div>

        <section className="card" aria-label="Your numbers">
          <div className="row wrap" style={{ alignItems: "flex-end" }}>
            <label className="field grow" style={{ minWidth: 180 }}>
              <span className="label">Online sales per month ($)</span>
              <input className="input num" type="number" inputMode="numeric" min={0} value={sales} onChange={(e) => setSales(Math.max(0, Number(e.target.value)))} />
            </label>
            <label className="field grow" style={{ minWidth: 180 }}>
              <span className="label">Average order ($)</span>
              <input className="input num" type="number" inputMode="decimal" min={1} value={avg} onChange={(e) => setAvg(Math.max(1, Number(e.target.value)))} />
            </label>
          </div>
        </section>

        {error && <Alert tone="danger">{error}</Alert>}
        {!plans && !error && (
          <div className="plans">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="plan"><Skeleton height={20} width="60%" /><Skeleton height={36} width="45%" /><Skeleton height={14} /></div>)}</div>
        )}
        {plans && (
          <div className="plans">
            {plans.map((p) => (
              <article key={p.key} className={`plan ${p.key === current ? "current" : ""} ${p.unavailable ? "unavailable" : ""}`} aria-current={p.key === current}>
                {p.key === current && <span className="badge badge-success plan-best">Your plan</span>}
                {p.key !== current && cheapest?.key === p.key && sales > 0 && <span className="badge badge-brand plan-best">Lowest for you</span>}
                <h2>{p.label}</h2>
                <div className="plan-price">
                  {money(p.estimate.restaurantCostCents)} <small>/ month · {(p.estimate.effectiveRateBps / 100).toFixed(1)}%</small>
                </div>
                <p className="muted small">{p.summary}</p>
                <p className="subtle num">
                  STOS fee {money(p.estimate.platformFeeCents)} · card fees {money(p.estimate.processingCents)}
                  {p.estimate.monthlyFeeCents > 0 && ` · subscription ${money(p.estimate.monthlyFeeCents)}`}
                </p>
                <div style={{ marginTop: "auto" }}>
                  {p.unavailable ? (
                    <span className="badge">{p.unavailable}</span>
                  ) : p.key === current ? (
                    <Button block disabled>Current plan</Button>
                  ) : (
                    <Button block variant="primary" loading={choosing === p.key} disabled={choosing !== null} onClick={() => choose(p)}>Choose this plan</Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="subtle">Estimates assume online sales only and card fees of 2.9% + 30¢ per order, and ignore tax and tips.</p>
      </main>
      {toasts}
    </>
  );
}
