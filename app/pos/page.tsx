"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { Alert, Button, Segmented, Sheet, Skeleton, Stepper, StaffTopbar, api, useMe, useToasts } from "../ui";
import { ItemSheet, type CartLine, type Item as SheetItem } from "../r/[slug]/ItemSheet";
import { money, plural } from "@/lib/format";
import { photoUrl, toCents, type Category } from "../dashboard/editor";
import type { Board } from "../tables/types";

type Quote = {
  lines: { itemId: string; name: string; quantity: number; options: { name: string }[]; note: string | null; lineTotalCents: number }[];
  subtotalCents: number;
  discountCents: number;
  discountLabel: string | null;
  taxCents: number;
  totalCents: number;
  promoError: string | null;
};
type Placed = { id: string; number: number; totalCents: number; paid: boolean };
type Method = "cash" | "card_terminal" | "other";

const METHODS: { id: Method; label: string; icon: "cash" | "card" | "more" }[] = [
  { id: "cash", label: "Cash", icon: "cash" },
  { id: "card_terminal", label: "Card machine", icon: "card" },
  { id: "other", label: "Other", icon: "more" },
];

export default function Pos({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const { table: presetTable } = use(searchParams);
  const me = useMe();
  const isOwner = me?.role === "owner";
  const [menu, setMenu] = useState<Category[] | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<"dine_in" | "counter">("dine_in");
  const [tableId, setTableId] = useState(presetTable ?? "");
  const [customerName, setCustomerName] = useState("");
  const [promoDraft, setPromoDraft] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountKind, setDiscountKind] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [pricing, setPricing] = useState(false);
  const [picking, setPicking] = useState<SheetItem | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState<"later" | Method | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const { toast, toasts } = useToasts();

  // Menu and tables for the pickers.
  useEffect(() => {
    void (async () => {
      const [m, t] = await Promise.all([api<Category[]>("/api/staff/menu"), api<Board>("/api/staff/tables")]);
      if (!m.ok) return setLoadError(m.error);
      setMenu(m.data);
      if (t.ok) setBoard(t.data);
    })();
  }, []);

  const items = useMemo(() => new Map((menu ?? []).flatMap((c) => c.items).map((i) => [i.id, i])), [menu]);
  const asSheetItem = useCallback(
    (i: Category["items"][number]): SheetItem => ({ id: i.id, name: i.name, description: i.description, priceCents: i.priceCents, available: i.available, imageUrl: photoUrl(i), modifierGroups: i.modifierGroups }),
    [],
  );

  const discountCents = toCents(discountValue);
  const manual = isOwner && discountOpen && discountValue.trim() ? { kind: discountKind, value: discountKind === "fixed" ? discountCents : Number(discountValue) } : null;

  // Price on the server whenever the order changes. The till never works out money itself.
  useEffect(() => {
    if (cart.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuote(null);
      setProblems([]);
      return;
    }
    if (manual && (!manual.value || manual.value < 1)) return;
    setPricing(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await api<Quote>("/api/staff/pos/quote", {
        method: "POST",
        json: {
          items: cart.map((l) => ({ itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds, note: l.note || undefined })),
          orderType,
          tipCents: 0,
          promoCode: promoCode || undefined,
          discount: manual ?? undefined,
        },
      });
      if (cancelled) return;
      setPricing(false);
      if (r.ok) {
        setQuote(r.data);
        setProblems([]);
        if (r.data.promoError) {
          toast(r.data.promoError, "danger");
          setPromoCode("");
        }
      } else {
        setQuote(null);
        setProblems([r.error]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, orderType, promoCode, discountKind, discountValue, discountOpen]);

  // One key per attempt. Any change to the order starts a new attempt, so a changed order is never mistaken for a
  // double tap, while a double tap on the same order cannot ring it up twice.
  const attemptKey = useRef<string | null>(null);
  useEffect(() => {
    attemptKey.current = null;
  }, [cart, orderType, tableId, customerName, promoCode, discountKind, discountValue, discountOpen]);

  const addLine = useCallback((line: Omit<CartLine, "key">) => {
    setCart((c) => {
      const same = c.find((l) => l.itemId === line.itemId && l.note === line.note && l.optionIds.slice().sort().join() === line.optionIds.slice().sort().join());
      if (same) return c.map((l) => (l === same ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l));
      return [...c, { ...line, key: crypto.randomUUID() }];
    });
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (menu ?? [])
      .filter((c) => cat === "all" || c.id === cat)
      .map((c) => ({ ...c, items: c.items.filter((i) => !q || i.name.toLowerCase().includes(q)) }))
      .filter((c) => c.items.length > 0);
  }, [menu, cat, query]);
  const countByItem = useMemo(() => {
    const m = new Map<string, number>();
    cart.forEach((l) => m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.quantity));
    return m;
  }, [cart]);
  const hasPhotos = (menu ?? []).some((c) => c.items.some((i) => photoUrl(i)));

  const itemCount = cart.reduce((n, l) => n + l.quantity, 0);
  const tables = (board?.tables ?? []).filter((t) => t.active);
  const ready = cart.length > 0 && !!quote && !pricing && (orderType === "counter" || !!tableId);

  async function place(payment: { mode: "later" } | { mode: "now"; method: Method }) {
    setBusy(payment.mode === "later" ? "later" : payment.method);
    setPlaceError(null);
    const r = await api<Placed>("/api/staff/pos/orders", {
      method: "POST",
      headers: { "Idempotency-Key": (attemptKey.current ??= crypto.randomUUID()) },
      json: {
        items: cart.map((l) => ({ itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds, note: l.note || undefined })),
        orderType,
        tableId: orderType === "dine_in" ? tableId : undefined,
        customerName: customerName.trim() || undefined,
        tipCents: 0,
        promoCode: promoCode || undefined,
        discount: manual ?? undefined,
        payment,
      },
    });
    setBusy(null);
    if (!r.ok) {
      setPlaceError(r.error);
      setPaying(false);
      return;
    }
    setPaying(false);
    setPanelOpen(false);
    setPlaced(r.data);
  }

  function reset() {
    setCart([]);
    setTableId("");
    setCustomerName("");
    setPromoCode("");
    setPromoDraft("");
    setDiscountOpen(false);
    setDiscountValue("");
    setQuote(null);
    setPlaced(null);
    setPlaceError(null);
  }

  return (
    <>
      <StaffTopbar current="/pos" me={me} />
      <div className="container store-layout" style={{ paddingTop: 16 }}>
        <main>
          <div className="stack" style={{ "--gap": "12px", marginBottom: 14 } as React.CSSProperties}>
            <h1>New order</h1>
            <div className="input-icon">
              <Icon name="search" size={18} />
              <input className="input" type="search" placeholder="Search the menu" aria-label="Search the menu" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="catnav-inner" style={{ paddingBlock: 0 }} role="group" aria-label="Category">
              <button className="chip" aria-current={cat === "all"} onClick={() => setCat("all")}>All</button>
              {(menu ?? []).map((c) => <button key={c.id} className="chip" aria-current={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>)}
            </div>
          </div>

          {loadError && <Alert tone="danger">{loadError}</Alert>}
          {!menu && !loadError && <div className="menu-grid">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={100} style={{ borderRadius: 18 }} />)}</div>}
          {menu && visible.length === 0 && <div className="empty"><Icon name="search" size={32} /><p>No items match.</p></div>}

          {visible.map((category) => (
            <section key={category.id} className="menu-section" aria-labelledby={`p-${category.id}`}>
              <h2 id={`p-${category.id}`} style={{ marginBottom: 12 }}>{category.name}</h2>
              <div className={`menu-grid ${hasPhotos ? "photos" : ""}`}>
                {category.items.map((item) => {
                  const inCart = countByItem.get(item.id) ?? 0;
                  const photo = photoUrl(item);
                  const needsChoice = item.modifierGroups.length > 0;
                  return (
                    <div key={item.id} style={{ position: "relative" }}>
                      <button
                        className={`item-card ${hasPhotos ? "has-photo" : ""}`}
                        disabled={!item.available}
                        onClick={() => (needsChoice ? setPicking(asSheetItem(item)) : addLine({ itemId: item.id, quantity: 1, optionIds: [], note: "" }))}
                        aria-label={`${item.name}, ${money(item.priceCents)}${item.available ? "" : ", sold out"}`}
                      >
                        {hasPhotos &&
                          (photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="item-photo" src={photo} alt="" loading="lazy" />
                          ) : (
                            <span className="item-photo item-photo-empty" aria-hidden="true"><Icon name="image" size={28} /></span>
                          ))}
                        <div className="item-body">
                          <span className="item-name">{item.name}</span>
                          <span className="item-price">
                            {money(item.priceCents)}
                            {!item.available && <span className="badge badge-danger" style={{ marginLeft: 8 }}>Sold out</span>}
                          </span>
                        </div>
                      </button>
                      {inCart > 0 && <span className="in-cart" aria-label={`${inCart} in the order`}>{inCart}</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </main>

        <div className={`cart-backdrop ${panelOpen ? "open" : ""}`} onClick={() => setPanelOpen(false)} aria-hidden="true" />
        <aside className={`cart-panel ${panelOpen ? "open" : ""}`} aria-label="Order summary">
          <div className="cart-head">
            <div>
              <h2>Order summary</h2>
              {itemCount > 0 && <div className="subtle">{plural(itemCount, "item")}</div>}
            </div>
            <div className="row" style={{ "--gap": "4px" } as React.CSSProperties}>
              {cart.length > 0 && <Button variant="ghost" size="sm" onClick={reset}>Clear</Button>}
              <Button variant="ghost" icon="x" aria-label="Close order summary" className="cart-close" onClick={() => setPanelOpen(false)} />
            </div>
          </div>
          <div className="cart-scroll">
            <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>
              <Segmented label="Order type" value={orderType} onChange={setOrderType} options={[{ value: "dine_in", label: "Dine-in" }, { value: "counter", label: "Takeaway" }]} size="lg" />
              {orderType === "dine_in" && (
                <label className="field">
                  <span className="label">Table</span>
                  <select className="select" value={tableId} onChange={(e) => setTableId(e.target.value)} aria-invalid={cart.length > 0 && !tableId}>
                    <option value="">Choose a table…</option>
                    {(board?.floors.length ? [...board.floors.map((f) => ({ id: f.id, name: f.name })), { id: "", name: "Other" }] : [{ id: "", name: "" }]).map((f) => {
                      const list = tables.filter((t) => (t.floorId ?? "") === f.id);
                      if (list.length === 0) return null;
                      const options = list.map((t) => <option key={t.id} value={t.id}>Table {t.label} · {t.statusLabel}</option>);
                      return f.name ? <optgroup key={f.id || "other"} label={f.name}>{options}</optgroup> : options;
                    })}
                  </select>
                  {tables.length === 0 && board && <span className="hint">No tables yet. Add them under Tables → Set up tables.</span>}
                </label>
              )}
              <label className="field">
                <span className="label">Name (optional)</span>
                <input className="input" value={customerName} maxLength={80} onChange={(e) => setCustomerName(e.target.value)} placeholder={orderType === "dine_in" ? "Defaults to the table" : "Walk-in"} />
              </label>
            </div>

            {cart.length === 0 ? (
              <div className="empty" style={{ marginTop: 14 }}><Icon name="bag" size={32} /><p>No items yet.</p><p className="small">Tap a dish to add it.</p></div>
            ) : (
              <>
                <div style={{ marginTop: 8 }}>
                  {cart.map((line, index) => {
                    const priced = quote?.lines[index];
                    const item = items.get(line.itemId);
                    return (
                      <div key={line.key} className="cart-line">
                        <div className="strong">{item?.name ?? "Item"}</div>
                        <div className="strong num">{priced ? money(priced.lineTotalCents) : <Skeleton width={52} height={14} />}</div>
                        <div className="subtle" style={{ gridColumn: "1 / -1" }}>
                          {priced && priced.options.length > 0 && <div>{priced.options.map((o) => o.name).join(", ")}</div>}
                          {line.note && <div>“{line.note}”</div>}
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <Stepper size="sm" min={0} value={line.quantity} label={`Quantity of ${item?.name ?? "item"}`} onChange={(q) => setCart((c) => (q === 0 ? c.filter((l) => l.key !== line.key) : c.map((l) => (l.key === line.key ? { ...l, quantity: q } : l))))} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {problems.map((p) => <Alert key={p} tone="danger">{p}</Alert>)}

                <div className="stack" style={{ "--gap": "8px", marginTop: 12 } as React.CSSProperties}>
                  {quote?.discountLabel && !manual ? (
                    <div className="row-between">
                      <span className="badge badge-success"><Icon name="check" size={14} /> {quote.discountLabel} applied</span>
                      <Button variant="ghost" size="sm" onClick={() => { setPromoCode(""); setPromoDraft(""); }}>Remove</Button>
                    </div>
                  ) : !manual ? (
                    <form className="row" onSubmit={(e) => { e.preventDefault(); if (promoDraft.trim()) setPromoCode(promoDraft.trim()); }}>
                      <input className="input grow" style={{ textTransform: "uppercase" }} placeholder="Promo code" aria-label="Promo code" value={promoDraft} maxLength={24} onChange={(e) => setPromoDraft(e.target.value)} />
                      <Button type="submit" disabled={!promoDraft.trim()}>Apply</Button>
                    </form>
                  ) : null}
                  {isOwner && !promoCode && (
                    discountOpen ? (
                      <div className="row" style={{ alignItems: "flex-end" }}>
                        <div style={{ width: 130 }}>
                          <Segmented label="Discount type" value={discountKind} onChange={setDiscountKind} options={[{ value: "percent", label: "%" }, { value: "fixed", label: "$" }]} />
                        </div>
                        <input className="input num grow" inputMode="decimal" aria-label="Discount amount" placeholder={discountKind === "percent" ? "10" : "5.00"} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
                        <Button variant="ghost" size="sm" icon="x" aria-label="Remove discount" onClick={() => { setDiscountOpen(false); setDiscountValue(""); }} />
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" style={{ alignSelf: "flex-start" }} onClick={() => setDiscountOpen(true)}>Custom discount</Button>
                    )
                  )}
                </div>

                <div className="totals" aria-busy={pricing}>
                  <div className="row-between muted"><span>Subtotal</span><span>{quote ? money(quote.subtotalCents) : "—"}</span></div>
                  {quote && quote.discountCents > 0 && <div className="row-between" style={{ color: "var(--success)" }}><span>{quote.discountLabel}</span><span>− {money(quote.discountCents)}</span></div>}
                  <div className="row-between muted"><span>Tax</span><span>{quote ? money(quote.taxCents) : "—"}</span></div>
                  <div className="row-between grand"><span>Total</span><span>{quote ? money(quote.totalCents) : "—"}</span></div>
                </div>

                {placeError && <Alert tone="danger">{placeError}</Alert>}
                <div className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>
                  <Button variant="primary" size="lg" block icon="cash" disabled={!ready || busy !== null} onClick={() => setPaying(true)}>
                    Take payment{quote ? ` · ${money(quote.totalCents)}` : ""}
                  </Button>
                  <Button size="lg" block loading={busy === "later"} disabled={!ready || busy !== null} onClick={() => place({ mode: "later" })}>
                    Send to kitchen · pay later
                  </Button>
                  {orderType === "dine_in" && !tableId && <p className="hint" style={{ textAlign: "center" }}>Choose a table to continue.</p>}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {itemCount > 0 && !panelOpen && (
        <div className="cart-bar">
          <Button variant="primary" size="lg" block onClick={() => setPanelOpen(true)}>
            <span className="row" style={{ "--gap": "10px" } as React.CSSProperties}><span className="cart-count">{itemCount}</span>Review order</span>
            <span className="num">{quote ? money(quote.totalCents) : ""}</span>
          </Button>
        </div>
      )}

      {picking && <ItemSheet item={picking} onClose={() => setPicking(null)} onAdd={(line) => { addLine(line); toast(`Added ${picking.name}`); setPicking(null); }} />}
      {paying && quote && <PaySheet total={quote.totalCents} busy={busy} onPay={(method) => place({ mode: "now", method })} onClose={() => setPaying(false)} />}
      {placed && (
        <Sheet title={`Order #${placed.number} placed`} subtitle={placed.paid ? "Paid and sent to the kitchen" : "Sent to the kitchen, to be paid later"} onClose={reset}>
          <div className="stack">
            <div className="status-icon success" style={{ margin: "0 auto" }}><Icon name="check" size={30} /></div>
            <p className="muted" style={{ textAlign: "center" }}>{money(placed.totalCents)}{placed.paid ? " received" : " due"}</p>
            <a className="btn btn-lg" href={`/orders/${placed.id}/receipt?print=1`} target="_blank" rel="noreferrer"><Icon name="printer" size={20} /> Print receipt</a>
            <Button variant="primary" size="lg" onClick={reset}>New order</Button>
          </div>
        </Sheet>
      )}
      {!placed && !paying && !panelOpen && toasts}
    </>
  );
}

/** Choose how the guest paid. For cash, shows quick amounts and the change to give back. */
function PaySheet({ total, busy, onPay, onClose }: { total: number; busy: "later" | Method | null; onPay: (m: Method) => void; onClose: () => void }) {
  const [method, setMethod] = useState<Method>("cash");
  const [given, setGiven] = useState("");
  const tendered = toCents(given);
  const change = tendered !== null ? tendered - total : null;
  const quick = [...new Set([total, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000, Math.ceil(total / 2000) * 2000, Math.ceil(total / 5000) * 5000])].filter((n) => n >= total).slice(0, 4);

  return (
    <Sheet
      title="Take payment"
      subtitle={`${money(total)} due`}
      onClose={onClose}
      footer={
        <Button variant="success" size="xl" block icon="check" loading={busy === method} disabled={busy !== null || (method === "cash" && given.trim() !== "" && (change ?? -1) < 0)} onClick={() => onPay(method)}>
          {method === "cash" ? "Cash received" : method === "card_terminal" ? "Card payment done" : "Payment received"} · {money(total)}
        </Button>
      }
    >
      <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <Segmented label="Payment method" value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m.id, label: m.label }))} size="lg" />
        {method === "cash" && (
          <div className="stack">
            <span className="label">Cash given</span>
            <div className="row wrap" style={{ "--gap": "8px" } as React.CSSProperties}>
              {quick.map((q) => (
                <Button key={q} onClick={() => setGiven((q / 100).toFixed(2))}>{q === total ? "Exact" : money(q)}</Button>
              ))}
            </div>
            <span className="price-input"><input className="input num" inputMode="decimal" placeholder="0.00" aria-label="Cash given" value={given} onChange={(e) => setGiven(e.target.value)} /></span>
            {change !== null && (
              <Alert tone={change >= 0 ? "success" : "danger"}>{change >= 0 ? `Change to give back: ${money(change)}` : `${money(-change)} short`}</Alert>
            )}
          </div>
        )}
        {method === "card_terminal" && <p className="muted">Charge the guest on your own card machine, then press the button below.</p>}
        {method === "other" && <p className="muted">Use this for gift cards, vouchers or anything else you accepted.</p>}
      </div>
    </Sheet>
  );
}
