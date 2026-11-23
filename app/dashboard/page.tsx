"use client";

import { useCallback, useEffect, useState } from "react";

type Item = { id: string; name: string; priceCents: number; available: boolean };
type Category = { id: string; name: string; items: Item[] };
type Me = { email: string; name: string; role: string };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const meRes = await fetch("/api/staff/me");
    if (meRes.status === 401) {
      window.location.href = "/login";
      return;
    }
    setMe(await meRes.json());
    const menuRes = await fetch("/api/staff/menu");
    if (menuRes.ok) setMenu(await menuRes.json());
    else setError("Could not load the menu");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function toggle(item: Item) {
    const res = await fetch(`/api/staff/menu/items/${item.id}/availability`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: !item.available }),
    });
    if (res.ok) await load();
    else setError("Could not update that item");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main>
      <p><a href="/kitchen" style={{ fontSize: 18, fontWeight: 700 }}>Open the kitchen screen →</a></p>
      <p>{me?.role === "owner" && (<><a href="/menu">Menu editor</a> · <a href="/tables">Tables</a> · <a href="/manage">Hours and settings</a> · <a href="/reports">Sales report</a> · <a href="/pricing">Pricing plan</a></>)}</p>
      <h1>Menu</h1>
      {me && (
        <p>
          Signed in as {me.name || me.email} ({me.role}) · <button onClick={logout}>Sign out</button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {menu.map((category) => (
        <section key={category.id}>
          <h2>{category.name}</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {category.items.map((item) => (
              <li key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #ddd" }}>
                <span style={{ opacity: item.available ? 1 : 0.5 }}>
                  {item.name} · {money(item.priceCents)}
                </span>
                <button onClick={() => toggle(item)}>{item.available ? "Mark sold out" : "Back in stock"}</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
