"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import { Alert, Button, PlatformFooter } from "../ui";
import { BrandMark } from "../brand-mark";
import { Icon } from "../icons";

const COOLDOWN_S = 30;

export default function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = use(searchParams);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || cooldown > 0) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSentTo(email.trim());
        setCooldown(COOLDOWN_S);
      } else {
        // A 429 says "Too many attempts"; a malformed address says so; anything else is generic.
        setProblem((data.issues?.length ? "Enter a valid email address." : data.error) ?? "Something went wrong. Please try again.");
      }
    } catch {
      setProblem("Could not send the request. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card stack" style={{ "--gap": "20px" } as React.CSSProperties}>
        <div className="stack" style={{ alignItems: "center", textAlign: "center", "--gap": "10px" } as React.CSSProperties}>
          <BrandMark size={52} />
          <h1 style={{ fontSize: "1.6rem" }}>Staff sign in</h1>
          <p className="muted">We'll email you a link. No password to remember.</p>
        </div>

        {error === "expired" && !sentTo && <Alert tone="warning">This sign-in link has expired or already been used. Request a new one below.</Alert>}

        {sentTo ? (
          <div className="card stack" role="status" style={{ textAlign: "center", "--gap": "12px" } as React.CSSProperties}>
            <span className="status-icon success" style={{ margin: "0 auto" }}><Icon name="mail" size={28} /></span>
            <h2>Check your email</h2>
            <p className="muted">If <strong>{sentTo}</strong> belongs to a staff account, a sign-in link is on its way. It works once and expires in 15 minutes.</p>
            <Button block disabled={cooldown > 0} loading={busy} onClick={() => submit()}>
              {cooldown > 0 ? `Send again in ${cooldown}s` : "Send a new link"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSentTo(null)}>Use a different email</Button>
          </div>
        ) : (
          <form className="card stack" onSubmit={submit} noValidate style={{ "--gap": "14px" } as React.CSSProperties}>
            <label className="field">
              <span className="label">Work email</span>
              <input className="input" type="email" required autoFocus autoComplete="email" inputMode="email" placeholder="you@restaurant.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!problem} />
            </label>
            {problem && <span className="error-text" role="alert">{problem}</span>}
            <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!email.includes("@")}>
              Email me a sign-in link
            </Button>
          </form>
        )}
      </div>
      <PlatformFooter />
    </main>
  );
}
