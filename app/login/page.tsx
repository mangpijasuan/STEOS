"use client";

import { useState, type FormEvent } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const res = await fetch("/api/auth/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setMessage(data.message ?? data.error ?? "Something went wrong");
    setBusy(false);
  }

  return (
    <main>
      <h1>Staff sign in</h1>
      <form onSubmit={submit}>
        <label>
          Email
          <br />
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: 8, minWidth: 260 }} />
        </label>
        <p>
          <button type="submit" disabled={busy} style={{ padding: "8px 16px" }}>
            Email me a sign-in link
          </button>
        </p>
      </form>
      {message && <p>{message}</p>}
    </main>
  );
}
