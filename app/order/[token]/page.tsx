"use client";

import { use, useEffect, useState } from "react";
import { Icon, type IconName } from "../../icons";
import { Skeleton } from "../../ui";
import { clockTime, money } from "@/lib/format";

type Order = {
  restaurant: { name: string; slug: string; timezone: string };
  number: number;
  status: string;
  customerName: string;
  pickupAt: string;
  prepMinutes: number | null;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  items: { name: string; quantity: number; options: { name: string }[]; note: string | null; lineTotalCents: number }[];
};

type Look = { title: string; body: string; icon: IconName; tone: "live" | "success" | "danger" | "neutral"; step: number };

// step: how far along the 4-step tracker the order is (0 = placed … 3 = picked up), -1 = stopped.
const STATES: Record<string, Look> = {
  pending_payment: { title: "Confirming your payment", body: "This takes a few seconds. Keep this page open.", icon: "card", tone: "live", step: 0 },
  awaiting_acceptance: { title: "Sent to the kitchen", body: "Waiting for the restaurant to accept, usually within a few minutes. Your card is on hold, not charged yet.", icon: "receipt", tone: "live", step: 0 },
  accepted: { title: "Being prepared", body: "The kitchen accepted your order and your card has been charged.", icon: "fire", tone: "live", step: 1 },
  ready: { title: "Ready for pickup", body: "Your order is ready. Head to the counter and give your name.", icon: "bag", tone: "success", step: 2 },
  completed: { title: "Picked up", body: "Enjoy your meal, and thanks for ordering direct.", icon: "check", tone: "success", step: 3 },
  declined: { title: "The restaurant couldn't take this order", body: "You weren't charged. The hold on your card has been released.", icon: "x", tone: "danger", step: -1 },
  expired: { title: "The restaurant didn't respond in time", body: "You weren't charged. The hold on your card has been released.", icon: "clock", tone: "neutral", step: -1 },
  cancelled: { title: "Order cancelled", body: "If you were charged, a full refund is on its way to your card.", icon: "refund", tone: "neutral", step: -1 },
  payment_failed: { title: "Payment didn't go through", body: "You weren't charged. Go back to the menu to try again.", icon: "card", tone: "danger", step: -1 },
};
const STEPS = ["Placed", "Preparing", "Ready", "Picked up"];
const FINAL = new Set(["completed", "declined", "expired", "cancelled", "payment_failed"]);

export default function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [missing, setMissing] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const res = await fetch(`/api/orders/${token}`, { cache: "no-store" }).catch(() => null);
      if (stop) return;
      setOffline(!res);
      if (res?.status === 404) return setMissing(true);
      let next: Order | null = null;
      if (res?.ok) {
        next = await res.json();
        setOrder(next);
      }
      // Stop polling once nothing more can happen to the order.
      if (!next || !FINAL.has(next.status)) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [token]);

  useEffect(() => {
    if (order) document.title = `${STATES[order.status]?.title ?? "Your order"} · ${order.restaurant.name}`;
  }, [order]);

  if (missing) {
    return (
      <main className="container container-sm page">
        <div className="empty">
          <Icon name="receipt" size={36} />
          <p className="strong" style={{ color: "var(--text)" }}>We couldn't find this order.</p>
          <p className="small">Check that you opened the full link.</p>
        </div>
      </main>
    );
  }
  if (!order) {
    return (
      <main className="container container-sm page stack" aria-busy="true">
        <div className="card stack" style={{ alignItems: "center" }}>
          <Skeleton height={64} width={64} style={{ borderRadius: "50%" }} />
          <Skeleton height={24} width="60%" />
          <Skeleton height={16} width="80%" />
        </div>
      </main>
    );
  }

  const look = STATES[order.status] ?? { title: "Order update", body: "", icon: "info", tone: "neutral", step: -1 };
  const pickup = clockTime(order.pickupAt, order.restaurant.timezone, true);
  const live = !FINAL.has(order.status);

  return (
    <main className="container container-sm page stack" style={{ "--gap": "16px" } as React.CSSProperties}>
      <div className="row-between">
        <div>
          <div className="strong">{order.restaurant.name}</div>
          <div className="subtle">Order #{order.number} · {order.customerName}</div>
        </div>
        {live && (
          <span className={`badge ${offline ? "badge-warning" : "badge-success"}`}>
            <span className={`dot ${offline ? "" : "dot-live"}`} />
            {offline ? "Reconnecting" : "Live"}
          </span>
        )}
      </div>

      <section className="card status-hero" aria-live="polite">
        <div className={`status-icon ${look.tone === "live" ? "live" : look.tone}`}>
          <Icon name={look.icon} size={30} />
        </div>
        <h1 style={{ fontSize: "1.6rem", marginBottom: 8 }}>{look.title}</h1>
        <p className="muted" style={{ maxWidth: 420, margin: "0 auto" }}>{look.body}</p>
        {look.step >= 0 && (
          <>
            <ol className="progress" style={{ marginTop: 22 }} aria-label="Order progress">
              {STEPS.map((s, i) => (
                <li key={s} className={i < look.step || order.status === "completed" ? "done" : i === look.step ? "current" : ""} aria-current={i === look.step ? "step" : undefined}>
                  {s}
                </li>
              ))}
            </ol>
            {order.status !== "completed" && (
              <div className="pickup-box" style={{ marginTop: 18 }}>
                <Icon name="clock" size={20} />
                <span>
                  Pickup <strong>{pickup}</strong>
                  {order.prepMinutes && order.status === "accepted" ? <span className="muted"> · about {order.prepMinutes} min</span> : null}
                </span>
              </div>
            )}
          </>
        )}
        {look.step < 0 && (
          <a className="btn btn-primary" style={{ marginTop: 18 }} href={`/r/${order.restaurant.slug}`}>
            <Icon name="arrowLeft" size={18} /> Back to the menu
          </a>
        )}
      </section>

      <section className="card" aria-labelledby="receipt">
        <h2 id="receipt" style={{ marginBottom: 6 }}>Receipt</h2>
        <div>
          {order.items.map((i, n) => (
            <div key={n} className="row-between" style={{ padding: "8px 0", alignItems: "flex-start" }}>
              <div>
                <span className="strong num">{i.quantity}×</span> {i.name}
                {i.options.length > 0 && <div className="subtle">{i.options.map((o) => o.name).join(", ")}</div>}
                {i.note && <div className="subtle">“{i.note}”</div>}
              </div>
              <span className="num">{money(i.lineTotalCents)}</span>
            </div>
          ))}
        </div>
        <div className="totals">
          <div className="row-between muted"><span>Subtotal</span><span>{money(order.subtotalCents)}</span></div>
          <div className="row-between muted"><span>Tax</span><span>{money(order.taxCents)}</span></div>
          {order.tipCents > 0 && <div className="row-between muted"><span>Tip</span><span>{money(order.tipCents)}</span></div>}
          <div className="row-between grand"><span>Total</span><span>{money(order.totalCents)}</span></div>
        </div>
      </section>
      <p className="subtle" style={{ textAlign: "center" }}>Bookmark this page to check on your order. It updates by itself.</p>
    </main>
  );
}
