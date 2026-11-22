"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useMemo, useRef, useState } from "react";

export type CheckoutLine = { itemId: string; quantity: number; optionIds: string[]; note: string };
type Started = {
  orderToken: string;
  order: { totalCents: number };
  payment: { provider: "stripe" | "fake"; clientSecret: string; publishableKey: string | null; connectedAccountId: string | null } | null;
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const button = { padding: "12px 16px", borderRadius: 10, border: "none", background: "#c2410c", color: "#fff", fontSize: 16, cursor: "pointer", width: "100%" } as const;
const input = { display: "block", width: "100%", padding: 10, marginTop: 4, fontSize: 16, boxSizing: "border-box" } as const;

export default function Checkout(props: {
  slug: string;
  lines: CheckoutLine[];
  pickup: string;
  tipCents: number;
  totalCents: number;
  canOrder: boolean;
  onClearCart: () => void;
}) {
  const { slug, lines, pickup, tipCents, totalCents, canOrder, onClearCart } = props;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<Started | null>(null);

  // One key per attempt. Any change to the order starts a new attempt, so a changed cart is never mistaken for a retry.
  const key = useRef<string | null>(null);
  const signature = JSON.stringify([lines, pickup, tipCents]);
  useEffect(() => {
    key.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStarted(null);
  }, [signature]);

  async function begin() {
    setError(null);
    setBusy(true);
    try {
      key.current ??= crypto.randomUUID();
      const res = await fetch(`/api/r/${slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key.current },
        body: JSON.stringify({
          items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds, note: l.note || undefined })),
          tipCents,
          pickupTime: pickup === "asap" ? undefined : pickup,
          customer: { name, phone },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.issues?.[0]?.message ?? (data.issues?.[0]?.path ? "Please check your name and phone number." : data.error) ?? "Something went wrong.");
        return;
      }
      setStarted(data);
    } finally {
      setBusy(false);
    }
  }

  if (started?.payment) {
    return (
      <div style={{ marginTop: 12 }}>
        <p style={{ margin: "0 0 8px" }}>Total to pay: <strong>{money(started.order.totalCents)}</strong>. Your card is only held until the restaurant accepts.</p>
        {started.payment.provider === "fake" ? (
          <FakePay token={started.orderToken} onDone={onClearCart} />
        ) : (
          <StripePay started={started} onDone={onClearCart} />
        )}
      </div>
    );
  }
  if (started && !started.payment) {
    window.location.href = `/order/${started.orderToken}`;
    return null;
  }

  const ready = name.trim().length > 0 && phone.trim().length >= 7 && canOrder && !busy;
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ display: "block" }}>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" style={input} />
      </label>
      <label style={{ display: "block", marginTop: 8 }}>
        Phone (for pickup updates)
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={25} style={input} />
      </label>
      {error && <p role="alert" style={{ color: "#a00" }}>{error}</p>}
      <button style={{ ...button, marginTop: 12, opacity: ready ? 1 : 0.5 }} disabled={!ready} onClick={begin}>
        {busy ? "One moment…" : canOrder ? `Continue to payment · ${money(totalCents)}` : "Ordering unavailable"}
      </button>
    </div>
  );
}

function FakePay({ token, onDone }: { token: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function pay(outcome: "authorized" | "failed") {
    setBusy(true);
    await fetch("/api/dev/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderToken: token, outcome }) });
    onDone();
    window.location.href = `/order/${token}`;
  }
  return (
    <div style={{ border: "1px dashed #999", borderRadius: 10, padding: 12 }}>
      <p style={{ marginTop: 0 }}>Test mode: no real card is used.</p>
      <button style={button} disabled={busy} onClick={() => pay("authorized")}>Simulate a successful card</button>
      <button style={{ ...button, background: "#555", marginTop: 8 }} disabled={busy} onClick={() => pay("failed")}>Simulate a declined card</button>
    </div>
  );
}

function StripePay({ started, onDone }: { started: Started; onDone: () => void }) {
  const pay = started.payment!;
  const stripePromise = useMemo(
    () => (pay.publishableKey ? loadStripe(pay.publishableKey, pay.connectedAccountId ? { stripeAccount: pay.connectedAccountId } : undefined) : null),
    [pay.publishableKey, pay.connectedAccountId],
  );
  if (!stripePromise) return <p role="alert">Card payments are not set up yet.</p>;
  return (
    <Elements stripe={stripePromise} options={{ clientSecret: pay.clientSecret }}>
      <StripeForm token={started.orderToken} onDone={onDone} />
    </Elements>
  );
}

function StripeForm({ token, onDone }: { token: string; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/order/${token}` }, redirect: "if_required" });
    if (result.error) {
      setError(result.error.message ?? "Your card was not accepted.");
      setBusy(false);
      return;
    }
    onDone();
    window.location.href = `/order/${token}`;
  }

  return (
    <form onSubmit={submit}>
      <PaymentElement />
      {error && <p role="alert" style={{ color: "#a00" }}>{error}</p>}
      <button style={{ ...button, marginTop: 12, opacity: busy ? 0.5 : 1 }} disabled={busy || !stripe}>
        {busy ? "Processing…" : "Place order"}
      </button>
    </form>
  );
}
