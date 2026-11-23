"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../icons";
import { Alert, Button, Skeleton, StaffTopbar, api, useMe, useToasts } from "../ui";
import { money, plural } from "@/lib/format";

type Item = { id: string; name: string; priceCents: number; available: boolean };
type Category = { id: string; name: string; items: Item[] };

export default function Dashboard() {
  const me = useMe();
  const [menu, setMenu] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const { toast, toasts } = useToasts();

  const load = useCallback(async () => {
    const r = await api<Category[]>("/api/staff/menu");
    if (r.ok) {
      setMenu(r.data);
      setError(null);
    } else setError(r.error);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function toggle(item: Item) {
    const next = !item.available;
    // Update the screen immediately; put it back if the server says no.
    const set = (available: boolean) => setMenu((m) => m && m.map((c) => ({ ...c, items: c.items.map((i) => (i.id === item.id ? { ...i, available } : i)) })));
    set(next);
    setPending((p) => new Set(p).add(item.id));
    const r = await api(`/api/staff/menu/items/${item.id}/availability`, { method: "PATCH", json: { available: next } });
    setPending((p) => {
      const n = new Set(p);
      n.delete(item.id);
      return n;
    });
    if (r.ok) toast(next ? `${item.name} is back in stock` : `${item.name} marked sold out`);
    else {
      set(!next);
      toast(r.error, "danger");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!menu) return null;
    return menu.map((c) => ({ ...c, items: q ? c.items.filter((i) => i.name.toLowerCase().includes(q)) : c.items })).filter((c) => c.items.length > 0);
  }, [menu, query]);
  const soldOut = menu?.flatMap((c) => c.items).filter((i) => !i.available).length ?? 0;
  const total = menu?.flatMap((c) => c.items).length ?? 0;

  return (
    <>
      <StaffTopbar current="/dashboard" me={me} />
      <main className="container container-md page stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <div className="row-between wrap">
          <div>
            <h1>Menu</h1>
            <p className="muted">{menu ? `${plural(total, "item")}${soldOut ? ` · ${soldOut} sold out` : ""}` : "Loading…"}</p>
          </div>
          <a className="btn btn-primary" href="/kitchen"><Icon name="chef" size={18} /> Open kitchen screen</a>
        </div>

        {error && <Alert tone="danger" action={<Button size="sm" onClick={load}>Retry</Button>}>{error}</Alert>}

        <div className="sticky-search">
          <div className="input-icon">
            <Icon name="search" size={18} />
            <input className="input" type="search" placeholder="Search the menu" aria-label="Search the menu" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {!filtered && (
          <div className="card card-flush">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="menu-row"><Skeleton height={18} width="50%" /></div>
            ))}
          </div>
        )}
        {filtered?.length === 0 && (
          <div className="empty">
            <Icon name="search" size={32} />
            <p>{query ? `No items match “${query}”.` : "No menu items yet."}</p>
          </div>
        )}
        {filtered?.map((category) => (
          <section key={category.id} aria-labelledby={`c-${category.id}`}>
            <h2 id={`c-${category.id}`} style={{ margin: "8px 2px 10px" }}>{category.name}</h2>
            <div className="card card-flush list">
              {category.items.map((item) => (
                <div key={item.id} className={`menu-row ${item.available ? "" : "off"}`}>
                  <div className="grow">
                    <div className="menu-row-name">{item.name}</div>
                    <div className="subtle num">{money(item.priceCents)}</div>
                  </div>
                  <span className={`badge ${item.available ? "badge-success" : "badge-danger"}`}>{item.available ? "Available" : "Sold out"}</span>
                  <label className="switch" title={item.available ? "Mark sold out" : "Back in stock"}>
                    <input type="checkbox" role="switch" checked={item.available} disabled={pending.has(item.id)} onChange={() => toggle(item)} aria-label={`${item.name} available`} />
                    <span />
                  </label>
                </div>
              ))}
            </div>
          </section>
        ))}
        <p className="subtle">Adding and editing items from this screen is coming next. The editing API is already in place.</p>
      </main>
      {toasts}
    </>
  );
}
