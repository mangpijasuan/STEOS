"use client";

import { useState } from "react";

type Kind = "waiter" | "water" | "bill_cash" | "bill_card";

const OPTIONS: { kind: Kind; title: string }[] = [
  { kind: "waiter", title: "Call a waiter" },
  { kind: "water", title: "Water or a refill" },
  { kind: "bill_cash", title: "Bring the bill (cash)" },
  { kind: "bill_card", title: "Bring the bill (card)" },
];

/** Lets a seated guest ask for service from their phone. Asking twice for the same thing does nothing extra. */
export default function TableHelp({ token, label }: { token: string; label: string }) {
  const [sent, setSent] = useState<Set<Kind>>(new Set());
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(kind: Kind) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/t/${token}/requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
      if (res.ok) setSent((s) => new Set(s).add(kind));
      else setError((await res.json().catch(() => ({}))).error ?? "We could not send that. Please try again.");
    } catch {
      setError("Could not reach the restaurant. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Need something?" style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, marginTop: 12, background: "#fff" }}>
      <h2 style={{ marginTop: 0 }}>Need something?</h2>
      <p style={{ marginTop: 0, color: "#555" }}>Table {label}. Tap and a waiter will come over.</p>
      {error && <p role="alert" style={{ color: "#a00" }}>{error}</p>}
      {sent.size > 0 && <p role="status" style={{ color: "#166534" }}>A waiter has been notified. They will be with you shortly.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {OPTIONS.map((o) => (
          <button
            key={o.kind}
            type="button"
            disabled={sent.has(o.kind) || busy !== null}
            onClick={() => ask(o.kind)}
            style={{ padding: "12px 10px", borderRadius: 10, border: "1px solid #bbb", background: "#fff", fontSize: 15, cursor: "pointer", minHeight: 48 }}
          >
            {sent.has(o.kind) ? "Requested ✓" : busy === o.kind ? "Sending…" : o.title}
          </button>
        ))}
      </div>
    </section>
  );
}
