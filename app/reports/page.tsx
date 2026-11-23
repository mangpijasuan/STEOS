"use client";

import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { Alert, Button, Segmented, Skeleton, StaffTopbar, api, useMe } from "../ui";
import { money, plural } from "@/lib/format";

type Report = {
  paidOrders: number;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  grossCents: number;
  platformFeeCents: number;
  platformFeeInvoicedCents: number;
  processingEstimateCents: number;
  netEstimateCents: number;
  averageOrderCents: number;
  byMethod: Record<"card_online" | "cash" | "card_terminal" | "other", { orders: number; grossCents: number }>;
  byType: Record<"pickup" | "dine_in" | "counter", { orders: number; grossCents: number }>;
  refunds: { count: number; totalCents: number };
  notCompleted: { declined: number; expired: number; paymentFailed: number };
  days: { date: string; orders: number; grossCents: number }[];
  topItems: { name: string; quantity: number; salesCents: number }[];
};

const PERIODS = [7, 30, 90, 365].map((d) => ({ value: d, label: d === 365 ? "1 year" : `${d} days` }));
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function Reports() {
  const me = useMe();
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReport(null);
    void (async () => {
      const r = await api<Report>(`/api/staff/reports/summary?days=${days}`);
      if (!live) return;
      if (r.ok) {
        setError(null);
        setReport(r.data);
      } else setError(r.status === 403 ? "Only the restaurant owner can see reports." : r.error);
    })();
    return () => {
      live = false;
    };
  }, [days, tick]);

  const chronological = report ? [...report.days].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const maxDay = Math.max(1, ...chronological.map((d) => d.grossCents));
  const maxItem = Math.max(1, ...(report?.topItems.map((i) => i.salesCents) ?? [1]));
  const stopped = report ? report.notCompleted.declined + report.notCompleted.expired + report.notCompleted.paymentFailed : 0;

  return (
    <>
      <StaffTopbar current="/reports" me={me} />
      <main className="container container-md page stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <div className="row-between wrap">
          <h1>Sales report</h1>
          <div style={{ minWidth: 280 }}>
            <Segmented label="Period" value={days} onChange={setDays} options={PERIODS} />
          </div>
        </div>

        {error && <Alert tone="danger" action={error.startsWith("Only") ? undefined : <Button size="sm" onClick={() => setTick((t) => t + 1)}>Retry</Button>}>{error}</Alert>}
        {!report && !error && (
          <div className="stats">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="stat"><Skeleton height={14} width="50%" /><Skeleton height={32} width="70%" style={{ marginTop: 10 }} /></div>)}
          </div>
        )}

        {report && (
          <>
            <div className="stats">
              <div className="stat stat-hero">
                <div className="stat-label">What you keep (estimated)</div>
                <div className="stat-value">{money(report.netEstimateCents)}</div>
                <div className="stat-note">tips included</div>
              </div>
              <div className="stat">
                <div className="stat-label">Food and drink sales</div>
                <div className="stat-value">{money(report.subtotalCents)}</div>
                <div className="stat-note">{plural(report.paidOrders, "paid order")}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Average order</div>
                <div className="stat-value">{money(report.averageOrderCents)}</div>
                <div className="stat-note">{money(report.tipCents)} in tips</div>
              </div>
            </div>

            {report.paidOrders === 0 ? (
              <div className="empty">
                <Icon name="chart" size={36} />
                <p className="strong" style={{ color: "var(--text)" }}>No paid orders in this period yet.</p>
                <p className="small">Share your storefront link to get your first one.</p>
              </div>
            ) : (
              <>
                <section className="card" aria-labelledby="daily">
                  <div className="section-title">
                    <h2 id="daily">Sales by day</h2>
                    <span className="subtle">Total charged to customers</span>
                  </div>
                  <div className="bars" role="img" aria-label={`Daily sales over the last ${days} days. ${plural(chronological.length, "day")} with orders. Best day ${money(maxDay)}.`}>
                    {chronological.map((d) => (
                      <div key={d.date} className="bar-col" tabIndex={0} aria-label={`${dayLabel(d.date)}: ${money(d.grossCents)}, ${plural(d.orders, "order")}`}>
                        <div className="bar" style={{ height: `${Math.max(2, (d.grossCents / maxDay) * 100)}%` }} />
                        <span className="bar-tip">{dayLabel(d.date)} · {money(d.grossCents)} · {plural(d.orders, "order")}</span>
                      </div>
                    ))}
                  </div>
                  <div className="axis" aria-hidden="true">
                    <span>{dayLabel(chronological[0].date)}</span>
                    <span>Best day {money(maxDay)}</span>
                    {chronological.length > 1 && <span>{dayLabel(chronological[chronological.length - 1].date)}</span>}
                  </div>
                </section>

                <div className="grid-2">
                  <section className="card" aria-labelledby="breakdown">
                    <h2 id="breakdown" style={{ marginBottom: 6 }}>Where the money goes</h2>
                    <div className="kv"><span>Food and drink sales</span><span>{money(report.subtotalCents)}</span></div>
                    <div className="kv"><span>Sales tax collected</span><span>{money(report.taxCents)}</span></div>
                    <div className="kv"><span>Tips</span><span>{money(report.tipCents)}</span></div>
                    <div className="kv total"><span>Charged to customers</span><span>{money(report.grossCents)}</span></div>
                    <div className="kv muted"><span>SROS fee (from card payments)</span><span>− {money(report.platformFeeCents - report.platformFeeInvoicedCents)}</span></div>
                    {report.platformFeeInvoicedCents > 0 && (
                      <div className="kv muted"><span>SROS fee (invoiced, pay-at-table)</span><span>− {money(report.platformFeeInvoicedCents)}</span></div>
                    )}
                    <div className="kv muted"><span>Card fees (estimated)</span><span>− {money(report.processingEstimateCents)}</span></div>
                    <div className="kv muted"><span>Sales tax owed to the state</span><span>− {money(report.taxCents)}</span></div>
                    <div className="kv total"><span>What you keep</span><span>{money(report.netEstimateCents)}</span></div>
                    <p className="hint" style={{ marginTop: 8 }}>Card fees are estimated at 2.9% + 30¢. Your Stripe dashboard has the exact amounts. This report is not tax advice.</p>
                  </section>

                  <div className="stack">
                    <section className="card" aria-labelledby="top">
                      <h2 id="top" style={{ marginBottom: 4 }}>Top items</h2>
                      {report.topItems.map((i) => (
                        <div key={i.name} className="rank">
                          <span>{i.name} <span className="subtle">× {i.quantity}</span></span>
                          <span className="num strong">{money(i.salesCents)}</span>
                          <div className="rank-track"><div className="rank-fill" style={{ width: `${(i.salesCents / maxItem) * 100}%` }} /></div>
                        </div>
                      ))}
                    </section>
                    {(report.byMethod.cash.orders + report.byMethod.card_terminal.orders + report.byMethod.other.orders > 0 || report.byType.dine_in.orders > 0) && (
                      <section className="card" aria-labelledby="how">
                        <h2 id="how" style={{ marginBottom: 6 }}>How and where</h2>
                        <div className="kv"><span>Paid online by card</span><span>{plural(report.byMethod.card_online.orders, "order")} · {money(report.byMethod.card_online.grossCents)}</span></div>
                        {report.byMethod.cash.orders > 0 && <div className="kv"><span>Cash at the table</span><span>{plural(report.byMethod.cash.orders, "order")} · {money(report.byMethod.cash.grossCents)}</span></div>}
                        {report.byMethod.card_terminal.orders > 0 && <div className="kv"><span>Your card machine</span><span>{plural(report.byMethod.card_terminal.orders, "order")} · {money(report.byMethod.card_terminal.grossCents)}</span></div>}
                        <hr className="divider" />
                        <div className="kv"><span>Pickup</span><span>{plural(report.byType.pickup.orders, "order")} · {money(report.byType.pickup.grossCents)}</span></div>
                        <div className="kv"><span>Dine-in</span><span>{plural(report.byType.dine_in.orders, "order")} · {money(report.byType.dine_in.grossCents)}</span></div>
                      </section>
                    )}
                    {(report.refunds.count > 0 || stopped > 0) && (
                      <section className="card" aria-labelledby="problems">
                        <h2 id="problems" style={{ marginBottom: 6 }}>Orders that didn't complete</h2>
                        <div className="kv"><span>Refunded</span><span>{report.refunds.count} · {money(report.refunds.totalCents)}</span></div>
                        <div className="kv"><span>Declined</span><span>{report.notCompleted.declined}</span></div>
                        <div className="kv"><span>Timed out</span><span>{report.notCompleted.expired}</span></div>
                        <div className="kv"><span>Card failed</span><span>{report.notCompleted.paymentFailed}</span></div>
                      </section>
                    )}
                  </div>
                </div>

                <details className="card card-tight">
                  <summary className="strong" style={{ cursor: "pointer" }}>Daily table</summary>
                  <div className="list" style={{ marginTop: 10 }}>
                    {[...chronological].reverse().map((d) => (
                      <div key={d.date} className="kv"><span>{dayLabel(d.date)} · {plural(d.orders, "order")}</span><span>{money(d.grossCents)}</span></div>
                    ))}
                  </div>
                </details>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
