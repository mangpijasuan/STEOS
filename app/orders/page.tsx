"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { Alert, Button, Segmented, StaffTopbar, api, useMe } from "../ui";
import { OrdersTable } from "../orders-table";

type Order = { id: string; number: number; status: string; orderType: string; tableLabel: string | null; customerName: string; paid: boolean; totalCents: number; createdAt: string };
type Status = "all" | "active" | "completed" | "closed";

const PAGE = 25;

export default function Orders() {
  const me = useMe();
  const [status, setStatus] = useState<Status>("all");
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState<string | undefined>();
  const seq = useRef(0);

  const url = useCallback(
    (offset: number) => {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (status !== "all") p.set("status", status);
      if (type) p.set("type", type);
      if (query.trim()) p.set("q", query.trim());
      return `/api/staff/orders/history?${p}`;
    },
    [status, type, query],
  );

  // Reload when a filter changes (after a short pause while typing). Older answers are ignored.
  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const r = await api<{ orders: Order[]; hasMore: boolean }>(url(0));
      if (mine !== seq.current) return;
      if (r.ok) {
        setOrders(r.data.orders);
        setMore(r.data.hasMore);
        setError(null);
      } else setError(r.error);
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [url, query]);

  useEffect(() => {
    void api<{ timezone: string }>("/api/staff/settings").then((r) => r.ok && setTimezone(r.data.timezone));
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    const r = await api<{ orders: Order[]; hasMore: boolean }>(url(orders?.length ?? 0));
    setLoadingMore(false);
    if (r.ok) {
      setOrders((o) => [...(o ?? []), ...r.data.orders]);
      setMore(r.data.hasMore);
    } else setError(r.error);
  }

  return (
    <>
      <StaffTopbar current="/orders" me={me} />
      <main className="container page stack" style={{ "--gap": "16px", maxWidth: 1100 } as React.CSSProperties}>
        <div>
          <h1>Orders</h1>
          <p className="muted">Every order, newest first. Search by number or name, and print a receipt for any of them.</p>
        </div>
        <div className="filters">
          <div className="input-icon grow" style={{ minWidth: 220 }}>
            <Icon name="search" size={18} />
            <input className="input" type="search" placeholder="Order number or name" aria-label="Search orders" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div style={{ minWidth: 320 }}>
            <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "All" }, { value: "active", label: "In progress" }, { value: "completed", label: "Done" }, { value: "closed", label: "Closed" }]} />
          </div>
          <select className="select" style={{ width: 160 }} aria-label="Order type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            <option value="pickup">Pickup</option>
            <option value="dine_in">Dine-in</option>
            <option value="counter">Takeaway</option>
          </select>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <section className="card card-flush" aria-label="Orders">
          <OrdersTable orders={orders} timezone={timezone} />
          {orders && orders.length === 0 && <p className="subtle" style={{ padding: "0 16px 16px" }}>No orders match these filters.</p>}
        </section>
        {more && <Button style={{ alignSelf: "center" }} loading={loadingMore} onClick={loadMore}>Show more</Button>}
      </main>
    </>
  );
}
