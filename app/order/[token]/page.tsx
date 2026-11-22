"use client";

import { use, useEffect, useState } from "react";

type Order = {
  restaurant: { name: string; timezone: string };
  number: number;
  status: string;
  customerName: string;
  pickupAt: string;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  items: { name: string; quantity: number; options: { name: string }[]; note: string | null; lineTotalCents: number }[];
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const MESSAGES: Record<string, { title: string; body: string }> = {
  pending_payment: { title: "Waiting for payment", body: "We are confirming your card. This page updates by itself." },
  awaiting_acceptance: { title: "Order sent to the kitchen", body: "Your card is on hold. You are only charged when the restaurant accepts, usually within a few minutes." },
  accepted: { title: "Order accepted", body: "The kitchen is preparing your order. Your card has been charged." },
  ready: { title: "Ready for pickup", body: "Your order is ready." },
  completed: { title: "Picked up", body: "Thank you!" },
  declined: { title: "The restaurant could not take this order", body: "You were not charged. The hold on your card is released." },
  expired: { title: "The restaurant did not respond in time", body: "You were not charged. The hold on your card is released." },
  cancelled: { title: "Order cancelled", body: "You were not charged." },
  payment_failed: { title: "Payment did not go through", body: "You were not charged. Please go back and try again." },
};

export default function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stop = false;
    async function poll() {
      const res = await fetch(`/api/orders/${token}`).catch(() => null);
      if (stop || !res) return;
      if (res.status === 404) return setMissing(true);
      if (res.ok) setOrder(await res.json());
    }
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [token]);

  if (missing) return <main><p role="alert">We could not find this order.</p></main>;
  if (!order) return <main><p>Loading your order…</p></main>;

  const msg = MESSAGES[order.status] ?? { title: order.status, body: "" };
  const pickup = new Intl.DateTimeFormat(undefined, { timeZone: order.restaurant.timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(order.pickupAt));
  return (
    <main>
      <h1 style={{ marginBottom: 4 }}>{order.restaurant.name}</h1>
      <p style={{ marginTop: 0, color: "#555" }}>Order #{order.number} for {order.customerName}</p>
      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, background: "#fff" }} aria-live="polite">
        <h2 style={{ marginTop: 0 }}>{msg.title}</h2>
        <p>{msg.body}</p>
        <p>Pickup: <strong>{pickup}</strong></p>
      </section>
      <section style={{ marginTop: 16 }}>
        <h2>Your order</h2>
        {order.items.map((i, n) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
            <span>
              {i.quantity} × {i.name}
              {i.options.length > 0 && <span style={{ color: "#666" }}> ({i.options.map((o) => o.name).join(", ")})</span>}
            </span>
            <span>{money(i.lineTotalCents)}</span>
          </div>
        ))}
        <hr />
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>Tax</span><span>{money(order.taxCents)}</span></div>
        {order.tipCents > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Tip</span><span>{money(order.tipCents)}</span></div>}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>Total</span><span>{money(order.totalCents)}</span></div>
      </section>
    </main>
  );
}
