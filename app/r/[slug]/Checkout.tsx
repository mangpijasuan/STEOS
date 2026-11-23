"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
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

type TableMode = { token: string; label: string; payLaterEnabled: boolean };

export default function Checkout(props: {
  slug: string;
  /** Set for a seated guest: name and phone are optional, and they may pay at the table. */
  table?: TableMode;
  /** A code the quote accepted. It is checked again on the server, which is what decides the price. */
  promoCode?: string;
  lines: CheckoutLine[];
  pickup: string;
  tipCents: number;
  totalCents: number;
  canOrder: boolean;
  onClearCart: () => void;
}) {
  const { slug, table, promoCode, lines, pickup, tipCents, totalCents, canOrder, onClearCart } = props;
  const [payLater, setPayLater] = useState(!!table?.payLaterEnabled);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<Started | null>(null);

  // One key per attempt. Any change to the order starts a new attempt, so a changed cart is never mistaken for a retry.
  const attempt = useRef<{ signature: string; key: string; proof: string } | null>(null);
  const signature = JSON.stringify([slug, table?.token ?? null, table ? payLater : null, promoCode ?? null, lines, pickup, tipCents, name.trim(), phone.trim()]);
  useEffect(() => {
    attempt.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStarted(null);
  }, [signature]);

  async function begin() {
    setError(null);
    setBusy(true);
    try {
      if (attempt.current?.signature !== signature) {
        attempt.current = { signature, key: crypto.randomUUID(), proof: crypto.randomUUID() };
      }
      const requestAttempt = attempt.current;
      const res = await fetch(table ? `/api/t/${table.token}/checkout` : `/api/r/${slug}/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestAttempt.key,
          "Checkout-Session": requestAttempt.proof,
        },
        body: JSON.stringify({
          items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds, note: l.note || undefined })),
          tipCents,
          promoCode,
          ...(table ? { payLater } : { pickupTime: pickup === "asap" ? undefined : pickup }),
          customer: { name, phone },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (attempt.current !== requestAttempt) return;
      if (!res.ok) {
        setError(data.issues?.[0]?.message ?? (data.issues?.[0]?.path ? "Please check your name and phone number." : data.error) ?? "Something went wrong.");
        return;
      }
      if (!data.payment) {
        window.location.assign(`/order/${data.orderToken}`);
        return;
      }
      setStarted(data);
    } catch {
      setError("Could not reach checkout. Check your connection and try again.");
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

  // A seated guest is identified by the table, so contact details are optional; a phone number, if given, must be valid.
  const ready = table
    ? canOrder && !busy && (phone.trim() === "" || phone.trim().length >= 7)
    : name.trim().length > 0 && phone.trim().length >= 7 && canOrder && !busy;
  const sendsToKitchen = table && payLater;
  return (
    <div style={{ marginTop: 12 }}>
      {table?.payLaterEnabled && (
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 12px" }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>How would you like to pay?</legend>
          {[
            { later: true, title: "Pay at the table", note: "The kitchen starts right away. Pay the waiter when you are done." },
            { later: false, title: "Pay now by card", note: "Your card is held and charged when the kitchen accepts." },
          ].map((o) => (
            <label key={String(o.later)} style={{ display: "flex", gap: 10, alignItems: "flex-start", border: `2px solid ${payLater === o.later ? "#c2410c" : "#ddd"}`, borderRadius: 10, padding: 10, marginBottom: 8, cursor: "pointer" }}>
              <input type="radio" name="pay-mode" checked={payLater === o.later} onChange={() => setPayLater(o.later)} style={{ marginTop: 4 }} />
              <span>
                <strong>{o.title}</strong>
                <span style={{ display: "block", color: "#666", fontSize: 14 }}>{o.note}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <label style={{ display: "block" }}>
        {table ? "Name (optional)" : "Name"}
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" style={input} />
      </label>
      <label style={{ display: "block", marginTop: 8 }}>
        {table ? "Phone (optional)" : "Phone (for pickup updates)"}
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={25} style={input} />
      </label>
      {error && <p role="alert" style={{ color: "#a00" }}>{error}</p>}
      <button style={{ ...button, marginTop: 12, opacity: ready ? 1 : 0.5 }} disabled={!ready} onClick={begin}>
        {busy ? "One moment…" : !canOrder ? "Ordering unavailable" : sendsToKitchen ? `Place order · ${money(totalCents)}` : `Continue to payment · ${money(totalCents)}`}
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
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/order/${token}` },
        redirect: "if_required",
      });
      if (result.error) {
        setError(result.error.message ?? "Your card was not accepted.");
        return;
      }
      onDone();
      window.location.assign(`/order/${token}`);
    } catch {
      setError("Could not confirm the payment. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
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
