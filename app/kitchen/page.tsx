"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Line = { name: string; quantity: number; options: { name: string }[]; note: string | null };
type Order = {
  id: string;
  number: number;
  status: "awaiting_acceptance" | "accepted" | "ready";
  customerName: string;
  customerPhone: string;
  pickupAt: string;
  totalCents: number;
  tipCents: number;
  acceptDeadline: string | null;
  prepMinutes: number | null;
  createdAt: string;
  orderType: "pickup" | "dine_in" | "counter";
  tableLabel: string | null;
  paymentMode: "online" | "pay_later";
  paidAt: string | null;
  items: Line[];
};
type Settings = { acceptingOrders: boolean; timezone?: string };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const big = { padding: "14px 18px", borderRadius: 12, border: "none", fontSize: 18, cursor: "pointer", color: "#fff" } as const;
const POLL_MS = 4000;
const REPEAT_BEEP_MS = 8000;

function time(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export default function Kitchen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [timezone, setTimezone] = useState<string>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [prep, setPrep] = useState<Record<string, number>>({});
  const audio = useRef<AudioContext | null>(null);
  const lastBeep = useRef(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(`/api/staff/orders?offset=${offset}`, { signal }).catch(() => null);
    if (signal?.aborted) return;
    if (!res) return setError("Connection lost. Retrying…");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) return setError("Could not load orders");
    setError(null);
    const page = await res.json();
    if (signal?.aborted) return;
    setOrders(page.orders);
    setHasMore(page.hasMore);
    if (offset > 0 && page.orders.length === 0) setOffset(Math.max(0, offset - 100));
  }, [offset]);

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/staff/me");
      if (me.status === 401) {
        window.location.href = "/login";
        return;
      }
      setRole((await me.json()).role);
      const s = await fetch("/api/staff/settings");
      if (s.ok) {
        const settings: Settings = await s.json();
        setAccepting(settings.acceptingOrders);
        setTimezone(settings.timezone);
      }
    })().catch(() => setError("Could not load kitchen settings."));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const controller = new AbortController();
    void refresh(controller.signal);
    const poll = setInterval(() => void refresh(controller.signal), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      controller.abort();
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  const waiting = orders.filter((o) => o.status === "awaiting_acceptance");
  const cooking = orders.filter((o) => o.status === "accepted");
  const ready = orders.filter((o) => o.status === "ready");

  // Sound: a double beep right away for a new order, repeated until every waiting order is answered.
  useEffect(() => {
    document.title = waiting.length ? `(${waiting.length}) New order · Kitchen` : "Kitchen";
    if (!soundOn || !audio.current || waiting.length === 0) return;
    if (Date.now() - lastBeep.current < REPEAT_BEEP_MS) return;
    lastBeep.current = Date.now();
    const ctx = audio.current;
    [0, 0.25].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.18);
    });
  }, [waiting.length, soundOn, now]);

  function enableSound() {
    audio.current ??= new AudioContext();
    void audio.current.resume();
    lastBeep.current = 0;
    setSoundOn(true);
  }

  async function act(order: Order, action: "accept" | "decline" | "ready" | "complete" | "cancel") {
    setActionError(null);
    setBusy(order.id);
    try {
      const body = action === "accept" ? { prepMinutes: prep[order.id] ?? 15 } :
        (action === "cancel" || action === "decline") && needsInPersonRefund(order) ? { inPersonRefundReturned: true } : undefined;
      const res = await fetch(`/api/staff/orders/${order.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.refundStatus === "failed") setActionError(result.error ?? "The refund failed. Try again.");
      await refresh();
    } catch {
      setActionError("The order action could not be confirmed. Check the order before trying again.");
    } finally {
      setBusy(null);
    }
  }

  async function togglePause() {
    setActionError(null);
    const res = await fetch("/api/staff/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptingOrders: !accepting }),
    }).catch(() => null);
    if (res?.ok) setAccepting(!accepting);
    else setActionError("Could not change online ordering");
  }

  const secondsLeft = (o: Order) => (o.acceptDeadline ? Math.max(0, Math.round((new Date(o.acceptDeadline).getTime() - now) / 1000)) : null);

  return (
    <main style={{ maxWidth: 900 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Kitchen</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!soundOn && <button style={{ ...big, background: "#1d4ed8" }} onClick={enableSound}>Turn on sound</button>}
          {accepting !== null && (
            <button style={{ ...big, background: accepting ? "#555" : "#15803d" }} onClick={togglePause}>
              {accepting ? "Pause online orders" : "Resume online orders"}
            </button>
          )}
        </div>
      </header>
      {accepting === false && <p role="status" style={{ background: "#fef3c7", padding: 10, borderRadius: 8 }}>Online ordering is paused. Customers cannot place new orders.</p>}
      {error && <p role="alert" style={{ color: "#a00" }}>{error}</p>}
      {actionError && <p role="alert" style={{ color: "#a00" }}>{actionError}</p>}
      {(offset > 0 || hasMore) && (
        <nav aria-label="Order pages">
          <button disabled={offset === 0} onClick={() => setOffset(offset - 100)}>Previous orders</button>{" "}
          <button disabled={!hasMore} onClick={() => setOffset(offset + 100)}>More orders</button>
        </nav>
      )}

      <h2>New orders {waiting.length > 0 && `(${waiting.length})`}</h2>
      {waiting.length === 0 && <p style={{ color: "#666" }}>No orders waiting.</p>}
      {waiting.map((o) => {
        const left = secondsLeft(o);
        return (
          <OrderCard key={o.id} order={o} timezone={timezone} accent="#c2410c">
            <p style={{ margin: "8px 0", fontWeight: 700, color: left !== null && left < 60 ? "#b91c1c" : "#111" }}>
              {left !== null ? `Respond within ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Respond now"}
            </p>
            <label>
              Ready in{" "}
              <select value={prep[o.id] ?? 15} onChange={(e) => setPrep({ ...prep, [o.id]: Number(e.target.value) })} style={{ fontSize: 18, padding: 6 }}>
                {[10, 15, 20, 25, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button style={{ ...big, background: "#15803d", flex: 1 }} disabled={busy !== null} onClick={() => act(o, "accept")}>Accept</button>
              <button style={{ ...big, background: "#6b7280" }} disabled={busy !== null} onClick={() => (!needsInPersonRefund(o) || window.confirm(declineQuestion(o))) && act(o, "decline")}>Decline</button>
            </div>
          </OrderCard>
        );
      })}

      <h2>In the kitchen {cooking.length > 0 && `(${cooking.length})`}</h2>
      {cooking.length === 0 && <p style={{ color: "#666" }}>Nothing cooking.</p>}
      {cooking.map((o) => (
        <OrderCard key={o.id} order={o} timezone={timezone} accent="#1d4ed8">
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button style={{ ...big, background: "#15803d", flex: 1 }} disabled={busy !== null} onClick={() => act(o, "ready")}>Mark ready</button>
            {role === "owner" && (
              <button
                style={{ ...big, background: "#b91c1c" }}
                disabled={busy !== null}
                onClick={() => window.confirm(cancelQuestion(o)) && act(o, "cancel")}
              >
                {o.paymentMode === "online" ? "Cancel and refund" : needsInPersonRefund(o) ? "Record refund and cancel" : "Cancel order"}
              </button>
            )}
          </div>
        </OrderCard>
      ))}

      <h2>Ready {ready.length > 0 && `(${ready.length})`}</h2>
      {ready.length === 0 && <p style={{ color: "#666" }}>Nothing waiting to go out.</p>}
      {ready.map((o) => (
        <OrderCard key={o.id} order={o} timezone={timezone} accent="#15803d">
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button style={{ ...big, background: "#15803d", flex: 1 }} disabled={busy !== null} onClick={() => act(o, "complete")}>{o.orderType === "dine_in" ? "Served" : "Picked up"}</button>
            {role === "owner" && (
              <button
                style={{ ...big, background: "#b91c1c" }}
                disabled={busy !== null}
                onClick={() => window.confirm(cancelQuestion(o)) && act(o, "cancel")}
              >
                {o.paymentMode === "online" ? "Cancel and refund" : needsInPersonRefund(o) ? "Record refund and cancel" : "Cancel order"}
              </button>
            )}
          </div>
        </OrderCard>
      ))}
    </main>
  );
}

function needsInPersonRefund(order: Order): boolean {
  return order.paymentMode === "pay_later" && order.paidAt !== null;
}

function declineQuestion(o: Order): string {
  return `Confirm that you have already returned ${money(o.totalCents)} to the guest in person. This records the refund and declines order #${o.number}.`;
}

function cancelQuestion(o: Order): string {
  if (o.paymentMode === "online") return `Cancel order #${o.number} and refund ${money(o.totalCents)}?`;
  return needsInPersonRefund(o)
    ? `Confirm that you have already returned ${money(o.totalCents)} to the guest in person. This records the refund and cancels order #${o.number}.`
    : `Cancel order #${o.number}? Nothing has been paid.`;
}

function OrderCard({ order, timezone, accent, children }: { order: Order; timezone?: string; accent: string; children: React.ReactNode }) {
  return (
    <section style={{ border: `3px solid ${accent}`, borderRadius: 14, padding: 14, marginBottom: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 22 }}>
          #{order.number} · {order.orderType === "dine_in" && order.tableLabel ? `Table ${order.tableLabel}` : order.customerName}
        </strong>
        <span>
          {order.orderType === "dine_in" ? "Out around" : order.orderType === "counter" ? "Takeaway · out around" : "Pickup"} {time(order.pickupAt, timezone)}{order.prepMinutes ? ` · promised ${order.prepMinutes} min` : ""}
        </span>
      </div>
      <div style={{ color: "#555", fontSize: 14 }}>
        {order.orderType === "dine_in" && order.customerName && !order.customerName.startsWith("Table ") && <>{order.customerName} · </>}
        {order.customerPhone && <><a href={`tel:${order.customerPhone}`}>{order.customerPhone}</a> · </>}
        {money(order.totalCents)}{" "}
        {order.paymentMode === "pay_later"
          ? order.paidAt ? "paid at the restaurant" : "to pay at the table"
          : order.status === "awaiting_acceptance" ? "on hold" : "paid online"}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", fontSize: 18 }}>
        {order.items.map((l, i) => (
          <li key={i} style={{ padding: "4px 0" }}>
            <strong>{l.quantity} ×</strong> {l.name}
            {l.options.length > 0 && <span style={{ color: "#555" }}> — {l.options.map((x) => x.name).join(", ")}</span>}
            {l.note && <div style={{ color: "#b45309", fontSize: 16 }}>Note: {l.note}</div>}
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}
