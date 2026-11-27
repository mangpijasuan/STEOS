"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { Alert, Button, StaffTopbar, useMe } from "../ui";
import { branding, pageTitle } from "@/lib/branding";
import { clockTime, money } from "@/lib/format";

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
type Settings = { acceptingOrders: boolean; timezone: string };
type Action = "accept" | "decline" | "ready" | "complete" | "cancel";

const POLL_MS = 4000;
const PAGE_SIZE = 100; // the server's page of active orders
const REPEAT_BEEP_MS = 8000;
const ACCEPT_WINDOW_S = 5 * 60; // keep in step with ACCEPT_WINDOW_MINUTES on the server
const PREP_CHOICES = [10, 15, 20, 30, 45, 60];

export default function Kitchen() {
  const me = useMe();
  const [orders, setOrders] = useState<Order[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Why the last load failed: a dropped connection and a server error read differently to someone in the kitchen.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const offline = loadError !== null;
  const [accepting, setAccepting] = useState<boolean | null>(null);
  const [timezone, setTimezone] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [prep, setPrep] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<Record<string, Action | undefined>>({});
  const [confirmRefund, setConfirmRefund] = useState<string | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const lastBeep = useRef(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch(`/api/staff/orders?offset=${offset}`, { cache: "no-store", signal }).catch(() => null);
    if (signal?.aborted) return;
    if (!res) return setLoadError("Connection lost. Orders may be out of date. Retrying…");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) return setLoadError("Could not load orders. Retrying…");
    const page = await res.json();
    if (signal?.aborted) return;
    setLoadError(null);
    setOrders(page.orders);
    setHasMore(page.hasMore);
    setLoaded(true);
    // If the orders on a later page have all been answered, step back instead of showing an empty page.
    if (offset > 0 && page.orders.length === 0) setOffset(Math.max(0, offset - PAGE_SIZE));
  }, [offset]);

  useEffect(() => {
    void (async () => {
      const s = await fetch("/api/staff/settings").catch(() => null);
      if (s?.ok) {
        const settings = (await s.json()) as Settings;
        setAccepting(settings.acceptingOrders);
        setTimezone(settings.timezone);
      } else setSettingsError("Could not load kitchen settings.");
    })().catch(() => setSettingsError("Could not load kitchen settings."));
  }, []);

  useEffect(() => {
    // An answer that arrives after the screen has moved on (a new page, or leaving) must not overwrite newer data.
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(controller.signal);
    const poll = setInterval(() => void refresh(controller.signal), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    // Refresh the moment the tablet wakes or the tab returns, instead of waiting for the next poll.
    const onVisible = () => document.visibilityState === "visible" && void refresh(controller.signal);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      controller.abort();
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [refresh]);

  const waiting = orders.filter((o) => o.status === "awaiting_acceptance").sort((a, b) => a.number - b.number);
  const cooking = orders.filter((o) => o.status === "accepted").sort((a, b) => new Date(a.pickupAt).getTime() - new Date(b.pickupAt).getTime());
  const ready = orders.filter((o) => o.status === "ready").sort((a, b) => a.number - b.number);

  // Sound: a double beep right away for a new order, repeated until every waiting order is answered.
  useEffect(() => {
    document.title = waiting.length ? `(${waiting.length}) New order · Kitchen` : pageTitle("Kitchen");
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

  function toggleSound() {
    if (soundOn) return setSoundOn(false);
    audio.current ??= new AudioContext();
    void audio.current.resume();
    lastBeep.current = 0;
    setSoundOn(true);
  }

  async function act(order: Order, action: Action) {
    if (busy[order.id]) return;
    setActionError(null);
    setConfirmRefund(null);
    setBusy((b) => ({ ...b, [order.id]: action }));
    try {
      const res = await fetch(`/api/staff/orders/${order.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "accept" ? { prepMinutes: prep[order.id] ?? 15 }
            // Staff have just confirmed they handed the money back, which is what lets the refund be recorded.
            : (action === "cancel" || action === "decline") && needsInPersonRefund(order) ? { inPersonRefundReturned: true }
            : undefined,
        ),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) setActionError(result.error ?? "That did not work. Try again.");
      else if (result.refundStatus === "failed") setActionError("The refund failed. Try again.");
      await refresh();
    } catch {
      // The request may or may not have reached the server, so do not claim it failed.
      setActionError("The order action could not be confirmed. Check the order before trying again.");
    } finally {
      setBusy((b) => ({ ...b, [order.id]: undefined }));
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
    else setActionError("Could not change online ordering. Try again.");
  }

  const secondsLeft = (o: Order) => (o.acceptDeadline ? Math.max(0, Math.round((new Date(o.acceptDeadline).getTime() - now) / 1000)) : null);
  // Orders with no deadline (pay-later, from a table) count up instead of down: how long the guest has waited.
  const secondsWaiting = (o: Order) => Math.max(0, Math.round((now - new Date(o.createdAt).getTime()) / 1000));
  const isOwner = me?.role === "owner";

  // Refunds are two taps: the first arms the button and shows the amount, the second confirms. For money taken in
  // person the second tap means "I have already handed it back", which is what records the refund.
  const refundButton = (o: Order) =>
    isOwner &&
    (confirmRefund === o.id ? (
      <Button variant="danger" size="lg" loading={busy[o.id] === "cancel"} onClick={() => act(o, "cancel")}>
        {o.paymentMode === "online" ? `Refund ${money(o.totalCents)}?` : needsInPersonRefund(o) ? `I handed back ${money(o.totalCents)}` : "Cancel order?"}
      </Button>
    ) : (
      <Button
        variant="soft-danger"
        size="lg"
        aria-label={`Cancel order ${o.number}${o.paymentMode === "online" ? " and refund" : needsInPersonRefund(o) ? " and record the refund" : ""}`}
        icon="refund"
        disabled={!!busy[o.id]}
        onClick={() => setConfirmRefund(o.id)}
      />
    ));

  return (
    <div className="kds">
      <StaffTopbar current="/kitchen" me={me} fixedTheme />
      <div className="kds-bar">
        <h1 className="grow">Kitchen</h1>
        <span className={`badge ${offline ? "badge-danger" : "badge-success"}`} role="status">
          <span className={`dot ${offline ? "" : "dot-live"}`} />
          {offline ? "Offline" : "Live"}
        </span>
        <Button size="sm" icon={soundOn ? "bell" : "bellOff"} onClick={toggleSound} aria-pressed={soundOn}>
          {soundOn ? "Sound on" : "Sound off"}
        </Button>
        {accepting !== null && (
          <Button size="sm" variant={accepting ? "secondary" : "success"} icon={accepting ? "pause" : "play"} onClick={togglePause}>
            {accepting ? "Pause orders" : "Resume orders"}
          </Button>
        )}
      </div>

      <div className="kds-banner stack">
        {!soundOn && loaded && (
          <Alert tone="info" action={<Button size="sm" variant="primary" onClick={toggleSound}>Turn on sound</Button>}>
            Turn on sound to hear new orders. Browsers need one tap first.
          </Alert>
        )}
        {accepting === false && <Alert tone="warning">Online ordering is paused. Customers can't place new orders until you resume.</Alert>}
        {loadError && <Alert tone="danger">{loadError}</Alert>}
        {settingsError && <Alert tone="warning">{settingsError}</Alert>}
        {actionError && <Alert tone="danger">{actionError}</Alert>}
        {(offset > 0 || hasMore) && (
          <nav className="row" aria-label="Order pages" style={{ "--gap": "8px" } as React.CSSProperties}>
            <Button size="sm" icon="arrowLeft" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous orders</Button>
            <Button size="sm" disabled={!hasMore} onClick={() => setOffset(offset + PAGE_SIZE)}>More orders</Button>
          </nav>
        )}
      </div>

      <div className="kds-cols">
        <section aria-labelledby="col-new">
          <div className="kds-col-head">
            <h2 id="col-new">New</h2>
            <span className={`count-pill ${waiting.length ? "hot" : ""}`}>{waiting.length}</span>
          </div>
          {!loaded && <div className="kds-empty">Loading orders…</div>}
          {loaded && waiting.length === 0 && <div className="kds-empty">No new orders</div>}
          {waiting.map((o) => {
            const left = secondsLeft(o);
            const waited = secondsWaiting(o);
            const urgent = left !== null ? left < 60 : waited > 120;
            const pct = left === null ? Math.max(0, 100 - (waited / 300) * 100) : Math.min(100, Math.max(0, (left / ACCEPT_WINDOW_S) * 100));
            const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
            const choice = prep[o.id] ?? 15;
            return (
              <Ticket key={o.id} order={o} variant="new" timezone={timezone}>
                <div className={`timer ${urgent ? "urgent" : ""}`}>
                  <div className="timer-label">
                    <span>{left === null ? (urgent ? "Guest is waiting" : "Waiting") : urgent ? "Respond now" : "Respond within"}</span>
                    <span>{clock(left ?? waited)}</span>
                  </div>
                  <div className="timer-track" role="progressbar" aria-label={left === null ? "Time the guest has waited" : "Time left to respond"} aria-valuemin={0} aria-valuemax={ACCEPT_WINDOW_S} aria-valuenow={left ?? waited}>
                    <div className="timer-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="prep-row">
                  <span className="label">Ready in (minutes)</span>
                  <div className="chips" role="group" aria-label="Ready in minutes">
                    {PREP_CHOICES.map((m) => (
                      <button key={m} type="button" aria-pressed={choice === m} onClick={() => setPrep({ ...prep, [o.id]: m })}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ticket-actions">
                  {needsInPersonRefund(o) && confirmRefund === `${o.id}:decline` ? (
                    // Declining an order paid in person: the money must be handed back first, so only that is offered.
                    <>
                      <Button variant="danger" size="xl" className="grow" loading={busy[o.id] === "decline"} disabled={!!busy[o.id]} onClick={() => act(o, "decline")}>
                        I handed back {money(o.totalCents)}
                      </Button>
                      <Button size="xl" disabled={!!busy[o.id]} onClick={() => setConfirmRefund(null)}>Back</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="success" size="xl" className="grow" loading={busy[o.id] === "accept"} disabled={!!busy[o.id]} onClick={() => act(o, "accept")}>
                        Accept · {choice} min
                      </Button>
                      <Button size="xl" loading={busy[o.id] === "decline"} disabled={!!busy[o.id]} onClick={() => (needsInPersonRefund(o) ? setConfirmRefund(`${o.id}:decline`) : act(o, "decline"))}>
                        Decline
                      </Button>
                    </>
                  )}
                </div>
              </Ticket>
            );
          })}
        </section>

        <section aria-labelledby="col-cooking">
          <div className="kds-col-head">
            <h2 id="col-cooking">Cooking</h2>
            <span className="count-pill">{cooking.length}</span>
          </div>
          {loaded && cooking.length === 0 && <div className="kds-empty">Nothing cooking</div>}
          {cooking.map((o) => {
            const late = new Date(o.pickupAt).getTime() < now;
            return (
              <Ticket key={o.id} order={o} variant={late ? "late" : "cooking"} timezone={timezone}>
                {late && (
                  <div className="badge badge-danger" style={{ marginTop: 12 }}>
                    <Icon name="alert" size={14} /> Past pickup time
                  </div>
                )}
                <div className="ticket-actions">
                  <Button variant="success" size="lg" className="grow" loading={busy[o.id] === "ready"} disabled={!!busy[o.id]} onClick={() => act(o, "ready")}>
                    Mark ready
                  </Button>
                  {refundButton(o)}
                </div>
              </Ticket>
            );
          })}
        </section>

        <section aria-labelledby="col-ready">
          <div className="kds-col-head">
            <h2 id="col-ready">Ready</h2>
            <span className="count-pill">{ready.length}</span>
          </div>
          {loaded && ready.length === 0 && <div className="kds-empty">Nothing waiting</div>}
          {ready.map((o) => (
            <Ticket key={o.id} order={o} variant="ready" timezone={timezone}>
              <div className="ticket-actions">
                <Button variant="success" size="lg" className="grow" loading={busy[o.id] === "complete"} disabled={!!busy[o.id]} onClick={() => act(o, "complete")}>
                  {o.orderType === "dine_in" ? "Served" : "Picked up"}
                </Button>
                {refundButton(o)}
              </div>
            </Ticket>
          ))}
        </section>
      </div>
    </div>
  );
}

/** An order the guest already paid for in person. Cancelling or declining it means handing the money back. */
function needsInPersonRefund(order: Order): boolean {
  return order.paymentMode === "pay_later" && order.paidAt !== null;
}

function Ticket({ order, variant, timezone, children }: { order: Order; variant: "new" | "cooking" | "ready" | "late"; timezone: string | undefined; children: React.ReactNode }) {
  return (
    <article className={`ticket ticket-${variant}`} aria-label={`Order ${order.number} for ${order.customerName}`}>
      <div className="ticket-head">
        <div>
          <div className="ticket-num">#{order.number}</div>
          {/* A table order with no name just says "Table 06", which the badge already shows. */}
          {!(order.orderType === "dine_in" && order.customerName === `Table ${order.tableLabel}`) && <div className="ticket-name">{order.customerName}</div>}
        </div>
        {order.orderType === "dine_in" ? (
          <div style={{ textAlign: "right" }}>
            <span className="badge badge-brand" style={{ fontSize: "1rem", height: 32 }}>
              <Icon name="table" size={16} /> Table {order.tableLabel}
            </span>
            <div className="subtle" style={{ marginTop: 4 }}>{order.prepMinutes ? `promised ${order.prepMinutes} min` : "dine-in"}</div>
          </div>
        ) : order.orderType === "counter" ? (
          <div style={{ textAlign: "right" }}>
            <span className="badge badge-info" style={{ fontSize: "1rem", height: 32 }}><Icon name="bag" size={16} /> Takeaway</span>
            <div className="subtle" style={{ marginTop: 4 }}>{order.prepMinutes ? `promised ${order.prepMinutes} min` : "at the counter"}</div>
          </div>
        ) : (
          <div style={{ textAlign: "right" }}>
            <div className="strong num">{clockTime(order.pickupAt, timezone)}</div>
            <div className="subtle">{order.prepMinutes ? `promised ${order.prepMinutes} min` : "pickup"}</div>
          </div>
        )}
      </div>
      <ul className="ticket-items">
        {order.items.map((l, i) => (
          <li key={i}>
            <span className="qty">{l.quantity}×</span>
            <div>
              <div className="strong">{l.name}</div>
              {l.options.length > 0 && <div className="mods">{l.options.map((x) => x.name).join(" · ")}</div>}
              {l.note && <div className="note">{l.note}</div>}
            </div>
          </li>
        ))}
      </ul>
      <div className="subtle row" style={{ marginTop: 12, "--gap": "10px" } as React.CSSProperties}>
        {order.customerPhone && (
          <>
            <a href={`tel:${order.customerPhone}`} className="row" style={{ "--gap": "6px" } as React.CSSProperties}>
              <Icon name="phone" size={14} /> {order.customerPhone}
            </a>
            <span>·</span>
          </>
        )}
        <span className="num">
          {money(order.totalCents)}{" "}
          {order.paymentMode === "online"
            ? order.status === "awaiting_acceptance" ? "on hold" : "paid online"
            : order.paidAt ? "paid at the restaurant" : "· pays at the table"}
        </span>
      </div>
      {children}
    </article>
  );
}
