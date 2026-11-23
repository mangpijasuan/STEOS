"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../icons";
import { Alert, Button } from "../../ui";
import { money } from "@/lib/format";

export type CheckoutLine = { itemId: string; quantity: number; optionIds: string[]; note: string };
type Started = {
  orderToken: string;
  order: { totalCents: number };
  payment: { provider: "stripe" | "fake"; clientSecret: string; publishableKey: string | null; connectedAccountId: string | null } | null;
};

// The customer's details are remembered on this device to make the next order faster.
const DETAILS_KEY = "sros:customer";

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
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<Started | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DETAILS_KEY) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved?.name) setName(saved.name);
      if (saved?.phone) setPhone(saved.phone);
    } catch {}
  }, []);

  // One key per attempt. Any change to the order starts a new attempt, so a changed cart is never mistaken for a retry.
  const key = useRef<string | null>(null);
  const signature = JSON.stringify([lines, pickup, tipCents]);
  useEffect(() => {
    key.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStarted(null);
  }, [signature]);

  const nameOk = name.trim().length > 0;
  const phoneOk = phone.replace(/\D/g, "").length >= 7;

  async function begin(e?: React.FormEvent) {
    e?.preventDefault();
    setTouched(true);
    if (!nameOk || !phoneOk || !canOrder || busy) return;
    setError(null);
    setBusy(true);
    try {
      key.current ??= crypto.randomUUID();
      try {
        localStorage.setItem(DETAILS_KEY, JSON.stringify({ name: name.trim(), phone: phone.trim() }));
      } catch {}
      const res = await fetch(`/api/r/${slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key.current },
        body: JSON.stringify({
          items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds, note: l.note || undefined })),
          tipCents,
          pickupTime: pickup === "asap" ? undefined : pickup,
          customer: { name, phone },
        }),
      }).catch(() => null);
      if (!res) {
        // The same key is kept, so trying again cannot create a second order.
        setError("No connection. Check your internet and try again; you won't be charged twice.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.issues?.[0]?.message ?? (data.issues?.[0]?.path ? "Please check your name and phone number." : data.error) ?? "Something went wrong. Please try again.");
        return;
      }
      setStarted(data);
    } finally {
      setBusy(false);
    }
  }

  if (started && !started.payment) {
    window.location.href = `/order/${started.orderToken}`;
    return null;
  }

  if (started?.payment) {
    return (
      <div className="stack" style={{ marginTop: 6 }}>
        <div className="row-between">
          <h3>Payment</h3>
          <span className="subtle row" style={{ "--gap": "6px" } as React.CSSProperties}>
            <Icon name="card" size={16} /> Secure
          </span>
        </div>
        <p className="small muted">Your card is only held until the restaurant accepts. If they can't take the order, the hold is released.</p>
        {started.payment.provider === "fake" ? (
          <FakePay token={started.orderToken} total={started.order.totalCents} onDone={onClearCart} />
        ) : (
          <StripePay started={started} onDone={onClearCart} />
        )}
        <Button variant="ghost" size="sm" onClick={() => setStarted(null)}>
          Edit details
        </Button>
      </div>
    );
  }

  return (
    <form className="stack" style={{ marginTop: 6 }} onSubmit={begin} noValidate>
      <h3>Your details</h3>
      <label className="field">
        <span className="label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" aria-invalid={touched && !nameOk} placeholder="Who's picking up?" />
        {touched && !nameOk && <span className="error-text">Enter a name for the order.</span>}
      </label>
      <label className="field">
        <span className="label">Phone</span>
        <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={25} aria-invalid={touched && !phoneOk} placeholder="For pickup updates" />
        {touched && !phoneOk && <span className="error-text">Enter a phone number we can reach you on.</span>}
      </label>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!canOrder}>
        {busy ? "Placing order…" : canOrder ? `Continue to payment · ${money(totalCents)}` : "Ordering unavailable"}
      </Button>
    </form>
  );
}

function FakePay({ token, total, onDone }: { token: string; total: number; onDone: () => void }) {
  const [busy, setBusy] = useState<"authorized" | "failed" | null>(null);
  async function pay(outcome: "authorized" | "failed") {
    setBusy(outcome);
    await fetch("/api/dev/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderToken: token, outcome }) });
    onDone();
    window.location.href = `/order/${token}`;
  }
  return (
    <div className="testpay stack">
      <span className="badge badge-warning" style={{ alignSelf: "flex-start" }}>Test mode · no real card</span>
      <Button variant="primary" size="lg" block loading={busy === "authorized"} disabled={busy !== null} onClick={() => pay("authorized")}>
        Simulate a successful card · {money(total)}
      </Button>
      <Button block loading={busy === "failed"} disabled={busy !== null} onClick={() => pay("failed")}>
        Simulate a declined card
      </Button>
    </div>
  );
}

function StripePay({ started, onDone }: { started: Started; onDone: () => void }) {
  const pay = started.payment!;
  const stripePromise = useMemo(
    () => (pay.publishableKey ? loadStripe(pay.publishableKey, pay.connectedAccountId ? { stripeAccount: pay.connectedAccountId } : undefined) : null),
    [pay.publishableKey, pay.connectedAccountId],
  );
  if (!stripePromise) return <Alert tone="danger">Card payments are not set up for this restaurant yet.</Alert>;
  return (
    <Elements stripe={stripePromise} options={{ clientSecret: pay.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#c2410c", borderRadius: "12px" } } }}>
      <StripeForm token={started.orderToken} total={started.order.totalCents} onDone={onDone} />
    </Elements>
  );
}

function StripeForm({ token, total, onDone }: { token: string; total: number; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
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
    <form onSubmit={submit} className="stack">
      <PaymentElement />
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!stripe}>
        {busy ? "Processing…" : `Place order · ${money(total)}`}
      </Button>
    </form>
  );
}
