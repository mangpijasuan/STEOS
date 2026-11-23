"use client";

import { Fragment, useEffect, useState } from "react";

type Report = {
  paidOrders: number;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  grossCents: number;
  platformFeeCents: number;
  processingEstimateCents: number;
  netEstimateCents: number;
  averageOrderCents: number;
  refunds: { count: number; totalCents: number };
  notCompleted: { declined: number; expired: number; paymentFailed: number };
  days: { date: string; orders: number; grossCents: number }[];
  topItems: { name: string; quantity: number; salesCents: number }[];
};

const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Reports() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/staff/reports/summary?days=${days}`);
      if (res.status === 401) return void (window.location.href = "/login");
      if (res.status === 403) return setError("Only the restaurant owner can see reports.");
      if (!res.ok) return setError("Could not load the report");
      setError(null);
      setReport(await res.json());
    })();
  }, [days]);

  const row = (label: string, value: string, bold = false) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <main style={{ maxWidth: 800 }}>
      <p><a href="/dashboard">← Dashboard</a></p>
      <h1>Sales report</h1>
      <label>Period{" "}
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ fontSize: 16, padding: 6 }}>
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </label>
      {error && <p role="alert" style={{ color: "#a00" }}>{error}</p>}
      {report && (
        <>
          <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, margin: "12px 0", background: "#fff" }}>
            {row("Paid orders", String(report.paidOrders))}
            {row("Food and drink sales", money(report.subtotalCents))}
            {row("Sales tax collected", money(report.taxCents))}
            {row("Tips", money(report.tipCents))}
            {row("Total charged to customers", money(report.grossCents), true)}
            <hr />
            {row("SROS fee", `− ${money(report.platformFeeCents)}`)}
            {row("Card fees (estimated)", `− ${money(report.processingEstimateCents)}`)}
            {row("Sales tax owed to the state", `− ${money(report.taxCents)}`)}
            {row("What you keep (estimated, tips included)", money(report.netEstimateCents), true)}
          </section>
          <p>Average order {money(report.averageOrderCents)} · Refunded {report.refunds.count} ({money(report.refunds.totalCents)}) · Declined {report.notCompleted.declined} · Timed out {report.notCompleted.expired} · Card failed {report.notCompleted.paymentFailed}</p>
          <h2>Top items</h2>
          {report.topItems.length === 0 && <p style={{ color: "#666" }}>No sales yet.</p>}
          {report.topItems.map((i, n) => <Fragment key={n}>{row(`${i.quantity} × ${i.name}`, money(i.salesCents))}</Fragment>)}
          <h2>By day</h2>
          {report.days.map((d) => <Fragment key={d.date}>{row(`${d.date} · ${d.orders} ${d.orders === 1 ? "order" : "orders"}`, money(d.grossCents))}</Fragment>)}
          <p style={{ color: "#666", fontSize: 14 }}>Card fees are estimated at 2.9% + 30¢. Your Stripe dashboard has the exact amounts. This report is not tax advice.</p>
        </>
      )}
    </main>
  );
}
