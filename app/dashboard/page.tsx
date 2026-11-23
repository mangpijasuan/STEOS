"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AreaChart, Donut, type Slice } from "../charts";
import { Icon, type IconName } from "../icons";
import { Alert, Button, Segmented, Skeleton, StaffTopbar, api, useMe } from "../ui";
import { clockTime, money, plural } from "@/lib/format";
import { OrdersTable, TYPE_LABEL, type RecentOrder } from "../orders-table";
import type { Board } from "../tables/types";

type Report = {
  timezone: string;
  paidOrders: number;
  grossCents: number;
  /** Charged to customers, less refunds confirmed in the period. This is the headline "Sales". */
  netChargedCents: number;
  refunds: { count: number; totalCents: number };
  averageOrderCents: number;
  netEstimateCents: number;
  byType: Record<"pickup" | "dine_in" | "counter", { orders: number; grossCents: number }>;
  byCategory: { name: string; sortOrder: number; salesCents: number }[];
  days: { date: string; orders: number; grossCents: number; refundCents: number }[];
  previous?: { paidOrders: number; grossCents: number; netChargedCents: number; averageOrderCents: number; netEstimateCents: number };
};
type Active = { awaiting_acceptance: number; accepted: number; ready: number };

const PERIODS = [7, 30, 90].map((d) => ({ value: d, label: `${d} days` }));
const SLICE_COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];

function Delta({ now, before, label }: { now: number; before: number | undefined; label: string }) {
  if (before === undefined) return null;
  if (before === 0) return <span className="delta flat">{now > 0 ? "New this period" : "No change"}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span className="delta flat">No change {label}</span>;
  return (
    <span className={`delta ${pct > 0 ? "up" : "down"}`}>
      <Icon name={pct > 0 ? "trendUp" : "trendDown"} size={14} />
      {pct > 0 ? "Up" : "Down"} {Math.abs(pct)}% {label}
    </span>
  );
}

export default function Dashboard() {
  const me = useMe();
  const isOwner = me?.role === "owner";
  const [days, setDays] = useState(7);
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [recent, setRecent] = useState<RecentOrder[] | null>(null);
  const [timezone, setTimezone] = useState<string | undefined>();

  const loadLive = useCallback(async () => {
    const [a, t, h] = await Promise.all([api<{ counts: Active }>("/api/staff/orders"), api<Board>("/api/staff/tables"), api<{ orders: RecentOrder[] }>("/api/staff/orders/history?limit=8")]);
    if (a.ok) setActive(a.data.counts);
    if (t.ok) setBoard(t.data);
    if (h.ok) setRecent(h.data.orders);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLive();
    void api<{ timezone: string }>("/api/staff/settings").then((r) => r.ok && setTimezone(r.data.timezone));
    const t = setInterval(loadLive, 8000);
    return () => clearInterval(t);
  }, [loadLive]);

  useEffect(() => {
    if (!isOwner) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReport(null);
    void api<Report>(`/api/staff/reports/summary?days=${days}&compare=1`).then((r) => {
      if (!live) return;
      if (r.ok) {
        setReport(r.data);
        setReportError(null);
      } else setReportError(r.error);
    });
    return () => {
      live = false;
    };
  }, [days, isOwner]);

  const counts = {
    waiting: active?.awaiting_acceptance ?? 0,
    cooking: active?.accepted ?? 0,
    ready: active?.ready ?? 0,
    attention: board?.tables.filter((t) => t.active && t.priority).length ?? 0,
  };
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = me?.name?.split(/\s+/)[0] || me?.email?.split("@")[0] || "";

  // One point per day for the whole period, so quiet days show as zero instead of being skipped.
  const series = useMemo(() => {
    if (!report) return [];
    const byDate = new Map(report.days.map((d) => [d.date, d]));
    return Array.from({ length: days }, (_, i) => {
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: report.timezone }).format(new Date(Date.now() - (days - 1 - i) * 86_400_000));
      const d = byDate.get(date);
      // Sales after the refunds made that day. A day that refunded more than it sold is negative, and is drawn that way.
      const refunded = d?.refundCents ?? 0;
      return {
        key: date,
        label: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        value: (d?.grossCents ?? 0) - refunded,
        detail: plural(d?.orders ?? 0, "order") + (refunded > 0 ? ` · ${money(refunded)} refunded` : ""),
      };
    });
  }, [report, days]);

  const slices: Slice[] = useMemo(() => {
    if (!report) return [];
    // A category keeps its colour for good (by its place in the menu); only the first four get one.
    const known = report.byCategory.filter((c) => c.name !== "Other");
    let other = report.byCategory.find((c) => c.name === "Other")?.salesCents ?? 0;
    const out: Slice[] = [];
    known.forEach((c, i) => {
      if (i < SLICE_COLORS.length) {
        if (c.salesCents > 0) out.push({ name: c.name, value: c.salesCents, color: SLICE_COLORS[i] });
      } else other += c.salesCents;
    });
    if (other > 0) out.push({ name: "Other", value: other, color: "var(--c-other)" });
    return out.sort((a, b) => b.value - a.value);
  }, [report]);

  const bestDay = series.reduce((m, d) => (d.value > m.value ? d : m), { label: "", value: 0, detail: "", key: "" });

  const tile = (href: string, label: string, n: number, icon: IconName, hot = false) => (
    <a className={`live-tile ${hot && n > 0 ? "hot" : ""}`} href={href}>
      <span className="live-l"><Icon name={icon} size={16} />{label}</span>
      <span className="live-n">{active || board ? n : "–"}</span>
    </a>
  );

  return (
    <>
      <StaffTopbar current="/dashboard" me={me} />
      <main className="container page stack" style={{ "--gap": "18px", maxWidth: 1240 } as React.CSSProperties}>
        <div className="page-head">
          <div>
            <h1>{greeting}{first ? `, ${first}` : ""}</h1>
            <p className="muted">Here's how {me?.restaurantName || "your restaurant"} is doing.</p>
          </div>
          <div className="row wrap">
            <a className="btn btn-primary" href="/pos"><Icon name="plus" size={18} /> New order</a>
            <a className="btn" href="/kitchen"><Icon name="chef" size={18} /> Kitchen</a>
          </div>
        </div>

        <section className="live-grid" aria-label="Right now">
          {tile("/kitchen", "Waiting for kitchen", counts.waiting, "receipt", true)}
          {tile("/kitchen", "Cooking", counts.cooking, "fire")}
          {tile("/kitchen", "Ready to serve", counts.ready, "bag", true)}
          {tile("/tables", "Tables need attention", counts.attention, "bell", true)}
        </section>

        {isOwner && (
          <>
            <div className="row-between wrap">
              <h2>Performance</h2>
              <div style={{ minWidth: 260 }}><Segmented label="Period" value={days} onChange={setDays} options={PERIODS} /></div>
            </div>
            {reportError && <Alert tone="danger">{reportError}</Alert>}
            <div className="stats">
              {!report ? (
                Array.from({ length: 4 }).map((_, i) => <div key={i} className="stat"><Skeleton height={14} width="50%" /><Skeleton height={32} width="70%" style={{ marginTop: 10 }} /></div>)
              ) : (
                <>
                  <div className="stat stat-hero">
                    <div className="stat-label">Sales</div>
                    <div className="stat-value">{money(report.netChargedCents)}</div>
                    <Delta now={report.netChargedCents} before={report.previous?.netChargedCents} label={`vs last ${days} days`} />
                    {report.refunds.totalCents > 0 && <div className="subtle" style={{ marginTop: 2 }}>After {money(report.refunds.totalCents)} refunded</div>}
                  </div>
                  <div className="stat">
                    <div className="stat-label">Orders</div>
                    <div className="stat-value">{report.paidOrders}</div>
                    <Delta now={report.paidOrders} before={report.previous?.paidOrders} label={`vs last ${days} days`} />
                  </div>
                  <div className="stat">
                    <div className="stat-label">Average order</div>
                    <div className="stat-value">{money(report.averageOrderCents)}</div>
                    <Delta now={report.averageOrderCents} before={report.previous?.averageOrderCents} label={`vs last ${days} days`} />
                  </div>
                  <div className="stat">
                    <div className="stat-label">What you keep (estimated)</div>
                    <div className="stat-value">{money(report.netEstimateCents)}</div>
                    <Delta now={report.netEstimateCents} before={report.previous?.netEstimateCents} label={`vs last ${days} days`} />
                  </div>
                </>
              )}
            </div>

            <div className="dash-grid">
              <section className="card" aria-labelledby="trend">
                <div className="section-title">
                  <h2 id="trend">Sales by day</h2>
                  {report && bestDay.value > 0 && <span className="subtle">Best day {bestDay.label} · {money(bestDay.value)}</span>}
                </div>
                {!report ? <Skeleton height={230} /> : report.days.length === 0 ? (
                  <div className="empty"><Icon name="chart" size={32} /><p>No sales or refunds in this period yet.</p></div>
                ) : (
                  <>
                    <AreaChart data={series} format={(v) => money(Math.round(v))} summary={`Sales after refunds for each of the last ${days} days. Total ${money(report.netChargedCents)}. Best day ${bestDay.label}, ${money(bestDay.value)}.`} />
                    <details style={{ marginTop: 12 }}>
                      <summary className="subtle" style={{ cursor: "pointer" }}>View as a table</summary>
                      <div className="list" style={{ marginTop: 8 }}>
                        {[...series].reverse().map((d) => <div key={d.key} className="kv"><span>{d.label} · {d.detail}</span><span>{money(d.value)}</span></div>)}
                      </div>
                    </details>
                  </>
                )}
              </section>

              <div className="stack">
                <section className="card" aria-labelledby="cats">
                  <h2 id="cats" style={{ marginBottom: 12 }}>Sales by category</h2>
                  {!report ? <Skeleton height={170} /> : slices.length === 0 ? (
                    <div className="empty"><Icon name="chart" size={28} /><p>No sales yet.</p></div>
                  ) : (
                    <Donut slices={slices} format={(v) => money(v)} centerLabel="of sales" />
                  )}
                </section>
                <section className="card" aria-labelledby="types">
                  <h2 id="types" style={{ marginBottom: 4 }}>Order type</h2>
                  {!report ? <Skeleton height={110} /> : (
                    (["pickup", "dine_in", "counter"] as const).map((t) => {
                      const v = report.byType[t];
                      const max = Math.max(1, ...Object.values(report.byType).map((x) => x.grossCents));
                      return (
                        <div key={t} className="rank">
                          <span>{TYPE_LABEL[t]} <span className="subtle">· {plural(v.orders, "order")}</span></span>
                          <span className="num strong">{money(v.grossCents)}</span>
                          <div className="rank-track"><div className="rank-fill" style={{ width: `${(v.grossCents / max) * 100}%` }} /></div>
                        </div>
                      );
                    })
                  )}
                </section>
              </div>
            </div>
          </>
        )}

        <section className="card card-flush" aria-labelledby="recent">
          <div className="card-header row-between">
            <h2 id="recent">Recent orders</h2>
            <a href="/orders" className="small">View all <Icon name="arrowRight" size={14} /></a>
          </div>
          <OrdersTable orders={recent} timezone={timezone} />
        </section>
      </main>
    </>
  );
}
