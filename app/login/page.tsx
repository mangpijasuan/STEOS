"use client";

import { useEffect, useState, type FormEvent } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "expired") {
      setMessage("This sign-in link has expired or already been used. Request a new one below.");
    }
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(data.message ?? data.error ?? "Something went wrong");
    } catch {
      setMessage("Could not send the request. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
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
      {message && <p role="status">{message}</p>}
    </main>
  );
}
