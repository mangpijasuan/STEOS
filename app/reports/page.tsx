"use client";

import { useEffect, useState } from "react";

type Report = {
  paidOrders: number;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  grossCents: number;
  platformFeeCents: number;
  processingEstimateCents: number;
  netEstimateCents: number;
  netSalesCents: number;
  netChargedCents: number;
  averageOrderCents: number;
  refunds: { count: number; totalCents: number };
  notCompleted: { declined: number; expired: number; paymentFailed: number };
  days: { date: string; orders: number; grossCents: number; refundCents: number }[];
  topItems: { name: string; quantity: number; salesCents: number }[];
};

const money = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Reports() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const res = await fetch(`/api/staff/reports/summary?days=${days}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res.status === 401) return void (window.location.href = "/login");
      if (res.status === 403) return setError("Only the restaurant owner can see reports.");
      if (!res.ok) return setError("Could not load the report");
      setError(null);
      const data = await res.json();
      if (!controller.signal.aborted) setReport(data);
    })().catch(() => {
      if (!controller.signal.aborted) setError("Could not load the report");
    });
    return () => controller.abort();
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
            {row("Confirmed refunds", money(report.refunds.totalCents))}
            {row("Net charged to customers", money(report.netChargedCents), true)}
            {row("Net food and drink sales", money(report.netSalesCents))}
            <hr />
            {row("SROS fee", `− ${money(report.platformFeeCents)}`)}
            {row("Card fees (estimated)", `− ${money(report.processingEstimateCents)}`)}
            {row("Sales tax on captured orders", `− ${money(report.taxCents)}`)}
            {row("What you keep (estimated, tips included)", money(report.netEstimateCents), true)}
          </section>
          <p>Average order {money(report.averageOrderCents)} · Refunded {report.refunds.count} ({money(report.refunds.totalCents)}) · Declined {report.notCompleted.declined} · Timed out {report.notCompleted.expired} · Card failed {report.notCompleted.paymentFailed}</p>
          <h2>Top items</h2>
          {report.topItems.length === 0 && <p style={{ color: "#666" }}>No sales yet.</p>}
          {report.topItems.map((i) => row(`${i.quantity} × ${i.name}`, money(i.salesCents)))}
          <h2>By day</h2>
          {report.days.map((d) => row(`${d.date} · ${d.orders} orders`, `${money(d.grossCents)} charged · ${money(d.refundCents)} refunded`))}
          <p style={{ color: "#666", fontSize: 14 }}>Card fees are estimated at 2.9% + 30¢. Your Stripe dashboard has the exact amounts. This report is not tax advice.</p>
        </>
      )}
    </main>
  );
}
