"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
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

export type CheckoutTable = { token: string; label: string; payLaterEnabled: boolean };

export default function Checkout(props: {
  slug: string;
  lines: CheckoutLine[];
  pickup: string;
  tipCents: number;
  totalCents: number;
  canOrder: boolean;
  onClearCart: () => void;
  promoCode?: string;
  /** Set for guests at a table: name and phone are optional, and they can pay now or later. */
  table?: CheckoutTable;
}) {
  const { slug, lines, pickup, tipCents, totalCents, canOrder, onClearCart, table, promoCode } = props;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<null | "now" | "later">(null);
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

  // One key (and one retry proof) per attempt. Any change to the order, or to how it is paid, starts a new attempt, so a
  // changed order is never mistaken for a retry of the old one.
  const attempt = useRef<{ signature: string; key: string; proof: string } | null>(null);
  const orderSignature = JSON.stringify([slug, table?.token ?? null, promoCode ?? null, lines, pickup, tipCents, name.trim(), phone.trim()]);
  useEffect(() => {
    attempt.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStarted(null);
  }, [orderSignature]);

  // Guests at a table can leave both blank; if they type a phone number it must still be a real one.
  const nameOk = table ? true : name.trim().length > 0;
  const phoneOk = table ? phone.trim() === "" || phone.replace(/\D/g, "").length >= 7 : phone.replace(/\D/g, "").length >= 7;

  async function begin(e?: React.FormEvent, payLater = false) {
    e?.preventDefault();
    setTouched(true);
    if (!nameOk || !phoneOk || !canOrder || busy) return;
    setError(null);
    setBusy(payLater ? "later" : "now");
    try {
      const signature = JSON.stringify([orderSignature, table ? payLater : null]);
      if (attempt.current?.signature !== signature) {
        attempt.current = { signature, key: crypto.randomUUID(), proof: crypto.randomUUID() };
      }
      const requestAttempt = attempt.current;
      try {
        localStorage.setItem(DETAILS_KEY, JSON.stringify({ name: name.trim(), phone: phone.trim() }));
      } catch {}
      const items = lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds, note: l.note || undefined }));
      const res = await fetch(table ? `/api/t/${table.token}/checkout` : `/api/r/${slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestAttempt.key, "Checkout-Session": requestAttempt.proof },
        body: JSON.stringify(
          table
            ? { items, tipCents, payLater, promoCode, customer: { name: name.trim(), phone: phone.trim() } }
            : { items, tipCents, pickupTime: pickup === "asap" ? undefined : pickup, promoCode, customer: { name, phone } },
        ),
      }).catch(() => null);
      if (!res) {
        // The same key is kept, so trying again cannot create a second order.
        setError("No connection. Check your internet and try again; you won't be charged twice.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      // The order changed while this was in flight: this answer belongs to an attempt that no longer exists.
      if (attempt.current !== requestAttempt) return;
      if (!res.ok) {
        setError(data.issues?.[0]?.message ?? (data.issues?.[0]?.path ? "Please check your name and phone number." : data.error) ?? "Something went wrong. Please try again.");
        return;
      }
      setStarted(data);
    } catch {
      setError("Could not reach checkout. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  // An order with nothing to pay online (pay later) goes straight to its status page. Done in an effect, not
  // while rendering, so the page change happens exactly once.
  const goTo = started && !started.payment ? `/order/${started.orderToken}` : null;
  useEffect(() => {
    if (goTo) window.location.assign(goTo);
  }, [goTo]);
  if (goTo) {
    return (
      <div className="row" style={{ justifyContent: "center", padding: 16 }} role="status">
        <span className="spinner" aria-hidden="true" /> Sending your order…
      </div>
    );
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
    <form className="stack" style={{ marginTop: 6 }} onSubmit={(e) => begin(e, false)} noValidate>
      <h3>{table ? `Order for table ${table.label}` : "Your details"}</h3>
      <label className="field">
        <span className="label">{table ? "Name (optional)" : "Name"}</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" aria-invalid={touched && !nameOk} placeholder={table ? "So the waiter knows who ordered" : "Who's picking up?"} />
        {touched && !nameOk && <span className="error-text">Enter a name for the order.</span>}
      </label>
      <label className="field">
        <span className="label">{table ? "Phone (optional)" : "Phone"}</span>
        <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={25} aria-invalid={touched && !phoneOk} placeholder={table ? "Only if you'd like updates" : "For pickup updates"} />
        {touched && !phoneOk && <span className="error-text">Enter a phone number we can reach you on.</span>}
      </label>
      {error && <Alert tone="danger">{error}</Alert>}
      {table ? (
        <div className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
          <Button type="submit" variant="primary" size="lg" block loading={busy === "now"} disabled={!canOrder || busy === "later"}>
            {busy === "now" ? "Placing order…" : canOrder ? `Order & pay now · ${money(totalCents)}` : "Ordering unavailable"}
          </Button>
          {table.payLaterEnabled && (
            <Button size="lg" block loading={busy === "later"} disabled={!canOrder || busy === "now"} onClick={() => begin(undefined, true)}>
              {busy === "later" ? "Sending to the kitchen…" : "Order now, pay later at the table"}
            </Button>
          )}
          <p className="hint" style={{ textAlign: "center" }}>
            {table.payLaterEnabled ? "Pay now by card, or order first and pay the waiter when you're done." : "Pay by card. Your card is only charged when the kitchen accepts."}
          </p>
        </div>
      ) : (
        <Button type="submit" variant="primary" size="lg" block loading={busy !== null} disabled={!canOrder}>
          {busy ? "Placing order…" : canOrder ? `Continue to payment · ${money(totalCents)}` : "Ordering unavailable"}
        </Button>
      )}
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
    try {
      const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/order/${token}` }, redirect: "if_required" });
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
    <form onSubmit={submit} className="stack">
      <PaymentElement />
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!stripe}>
        {busy ? "Processing…" : `Place order · ${money(total)}`}
      </Button>
    </form>
  );
}
