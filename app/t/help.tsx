"use client";

import { useState } from "react";
import { Icon, type IconName } from "../icons";
import { Alert, Button, Sheet, api } from "../ui";

type Kind = "waiter" | "water" | "bill_cash" | "bill_card";

const OPTIONS: { kind: Kind; title: string; note: string; icon: IconName }[] = [
  { kind: "waiter", title: "Call a waiter", note: "For anything: questions, allergies, a hand", icon: "bell" },
  { kind: "water", title: "Water or a refill", note: "We'll bring it to your table", icon: "sparkle" },
  { kind: "bill_cash", title: "Bring the bill · cash", note: "A waiter will come to take payment", icon: "cash" },
  { kind: "bill_card", title: "Bring the bill · card", note: "A waiter will bring the card machine", icon: "card" },
];

/** Lets a guest ask for service from their phone. Asking twice for the same thing does nothing extra. */
export function HelpSheet({ token, label, onClose, only }: { token: string; label: string; onClose: () => void; only?: Kind[] }) {
  const [sent, setSent] = useState<Set<Kind>>(new Set());
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(kind: Kind) {
    setBusy(kind);
    setError(null);
    const res = await api(`/api/t/${token}/requests`, { method: "POST", json: { kind } });
    setBusy(null);
    if (res.ok) setSent((s) => new Set(s).add(kind));
    else setError(res.error);
  }

  return (
    <Sheet title="Need something?" subtitle={`Table ${label}`} onClose={onClose}>
      <div className="stack">
        {error && <Alert tone="danger">{error}</Alert>}
        {sent.size > 0 && <Alert tone="success">A waiter has been notified. They'll be with you shortly.</Alert>}
        {OPTIONS.filter((o) => !only || only.includes(o.kind)).map((o) => {
          const done = sent.has(o.kind);
          return (
            <button key={o.kind} type="button" className="option" style={{ background: "var(--surface)", textAlign: "left", minHeight: 64 }} disabled={done || busy !== null} onClick={() => ask(o.kind)}>
              <span className="logo" style={{ background: done ? "var(--success-soft)" : "var(--brand-soft)", color: done ? "var(--success)" : "var(--brand)", width: 40, height: 40 }}>
                <Icon name={done ? "check" : o.icon} size={20} />
              </span>
              <span className="grow">
                <span className="strong" style={{ display: "block" }}>{o.title}</span>
                <span className="subtle">{done ? "Requested" : o.note}</span>
              </span>
              {busy === o.kind && <span className="spinner" aria-label="Sending" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
