"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../icons";
import { Alert, Button, Segmented, Sheet, Skeleton, Stepper, useToasts } from "../../ui";
import { clockTime, money, plural } from "@/lib/format";
import Checkout from "./Checkout";
import { HelpSheet } from "../../t/help";
import { ItemSheet, type CartLine, type Item, type Option, type Group } from "./ItemSheet";

type Category = { id: string; name: string; items: Item[] };
type Store = {
  restaurant: { name: string; timezone: string; taxRateBps: number; orderingOpen: boolean; openNow: boolean; asap: string | null };
  categories: Category[];
};
type Quote = {
  discountCents: number;
  discountLabel: string | null;
  promoError: string | null;
  lines: { itemId: string; name: string; quantity: number; options: { name: string }[]; note: string | null; lineTotalCents: number }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};
type Issue = { line: number | null; message: string };

const TIPS = [0, 10, 15, 20];

/** Set when a guest scanned a table's QR code: orders belong to that table and are paid now or later. */
export type TableContext = { token: string; label: string; floorName: string | null; payLaterEnabled: boolean };

export default function Storefront({ slug, table }: { slug: string; table?: TableContext }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [chosenPickup, setPickup] = useState<string | null>(null);
  const [quoted, setQuoted] = useState<{ key: string; quote: Quote } | null>(null);
  const [pricing, setPricing] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [picking, setPicking] = useState<Item | null>(null);
  const [tipPct, setTipPct] = useState(0);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoDraft, setPromoDraft] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const { toast, toasts } = useToasts();

  // Load menu and pickup times.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadError(null);
    (async () => {
      const [menuRes, slotRes] = await Promise.all([fetch(`/api/r/${slug}/menu`), table ? Promise.resolve(null) : fetch(`/api/r/${slug}/pickup-slots`)]);
      if (!menuRes.ok) {
        setLoadError(menuRes.status === 404 ? "We couldn't find this restaurant." : "The menu didn't load.");
        return;
      }
      setStore(await menuRes.json());
      if (slotRes?.ok) setSlots((await slotRes.json()).slots);
    })().catch(() => setLoadError("The menu didn't load. Check your connection."));
  }, [slug, reloadKey, table]);

  // While a guest has the menu open, tell the waiters' board once a minute so the table shows as "Browsing".
  useEffect(() => {
    if (!table) return;
    const beat = () => document.visibilityState === "visible" && void fetch(`/api/t/${table.token}/presence`, { method: "POST" }).catch(() => undefined);
    const timer = setInterval(beat, 60_000);
    return () => clearInterval(timer);
  }, [table]);

  // Remember the cart on this device. Storage can be unavailable, so every access is guarded. A table's cart is kept
  // apart from the pickup cart.
  const cartKey = table ? `cart:${slug}:table` : `cart:${slug}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(cartKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setCart(JSON.parse(saved));
    } catch {}
  }, [cartKey]);
  useEffect(() => {
    try {
      localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {}
  }, [cart, cartKey]);

  // The pickup time is worked out from what the server currently offers, not stored: if the chosen time stops being
  // offered, the earliest available one is used instead of a time the server would refuse. Seated guests do not pick.
  const pickup = table
    ? "asap"
    : chosenPickup && slots.includes(chosenPickup)
      ? chosenPickup
      : store?.restaurant.asap ? "asap" : slots[0] ?? "";

  // A quote belongs to exactly the cart, pickup time and code it priced; anything else is stale and is not shown.
  const quoteKey = JSON.stringify([slug, cart, pickup, promoCode]);
  const quote = quoted?.key === quoteKey ? quoted.quote : null;

  // Ask the server to price the cart whenever it changes. Prices are never computed in the browser.
  useEffect(() => {
    if (cart.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuoted(null);
      setPricing(false);
      setIssues([]);
      return;
    }
    setPricing(true);
    // A newer change aborts the request in flight, so a slow answer can never overwrite a fresher one.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/r/${slug}/quote`, {
          signal: controller.signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cart.map((l) => ({ itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds, note: l.note || undefined })),
            pickupTime: pickup === "asap" || !pickup ? undefined : pickup,
            promoCode: promoCode || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        setPricing(false);
        if (res.ok) {
          setQuoted({ key: quoteKey, quote: data });
          setIssues([]);
          // The server says whether the code worked. A code that does not apply is dropped, and the reason shown.
          if (data.promoError) {
            setPromoCode("");
            setPromoMessage(data.promoError);
          } else if (promoCode) setPromoMessage(null);
        } else {
          setQuoted(null);
          setIssues(data.issues ?? [{ line: null, message: data.error ?? "Could not price your order" }]);
        }
      } catch {
        if (!controller.signal.aborted) {
          setPricing(false);
          setQuoted(null);
          setIssues([{ line: null, message: "Could not price your cart. Check your connection and try again." }]);
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cart, pickup, slug, promoCode, quoteKey]);

  // Highlight the category currently on screen in the sticky nav.
  useEffect(() => {
    if (!store) return;
    const sections = document.querySelectorAll<HTMLElement>("[data-category]");
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCat(visible.target.getAttribute("data-category"));
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [store]);

  // Escape closes the phone cart sheet.
  useEffect(() => {
    if (!cartOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCartOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cartOpen]);

  const items = useMemo(() => new Map((store?.categories ?? []).flatMap((c) => c.items).map((i) => [i.id, i])), [store]);
  const countByItem = useMemo(() => {
    const m = new Map<string, number>();
    cart.forEach((l) => m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.quantity));
    return m;
  }, [cart]);
  const tz = store?.restaurant.timezone;
  // Slot times carry the time zone abbreviation, so a time that straddles a clock change cannot be misread.
  const formatSlot = useCallback(
    (iso: string) => new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: "short", timeZoneName: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)),
    [tz],
  );

  const addLine = useCallback(
    (line: Omit<CartLine, "key">, name: string) => {
      setCart((c) => {
        // The same item with the same choices and note just adds to that line.
        const same = c.find((l) => l.itemId === line.itemId && l.note === line.note && l.optionIds.slice().sort().join() === line.optionIds.slice().sort().join());
        if (same) return c.map((l) => (l === same ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l));
        return [...c, { ...line, key: crypto.randomUUID() }];
      });
      toast(`Added ${line.quantity > 1 ? `${line.quantity} × ` : ""}${name}`);
    },
    [toast],
  );

  if (loadError) {
    return (
      <main className="container container-sm page">
        <div className="empty">
          <Icon name="store" size={36} />
          <p className="strong" style={{ color: "var(--text)" }}>{loadError}</p>
          {!loadError.startsWith("We couldn't find") && (
            <Button variant="primary" style={{ marginTop: 14 }} onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          )}
        </div>
      </main>
    );
  }
  if (!store) return <StoreSkeleton />;

  const { restaurant } = store;
  // Seated guests do not need pickup times or opening hours; they only need the kitchen to be taking orders.
  const canOrder = restaurant.orderingOpen && (!!table || !!pickup);
  // A section shows big photo cards only when most of its dishes have a photo. Otherwise it is a clean list, with a small
  // photo on the dishes that have one, so a menu that is still gaining photos never fills up with empty grey tiles.
  const photoRich = (items: { imageUrl?: string | null }[]) => items.some((i) => i.imageUrl) && items.filter((i) => i.imageUrl).length * 2 >= items.length;
  const tipCents = quote ? Math.round((quote.subtotalCents * tipPct) / 100) : 0;
  const itemCount = cart.reduce((n, l) => n + l.quantity, 0);
  const totalCents = quote ? quote.totalCents + tipCents : null;

  const status = !restaurant.orderingOpen
    ? { tone: "badge-warning", label: "Ordering paused", detail: "Online ordering is paused right now. Please check back soon." }
    : table
      ? { tone: "badge-success", label: `Table ${table.label}`, detail: table.floorName ? `${table.floorName} · order from your seat` : "Order from your seat" }
      : restaurant.openNow && restaurant.asap
      ? { tone: "badge-success", label: "Open now", detail: `Pickup from ${formatSlot(restaurant.asap)}` }
      : slots.length
        ? { tone: "badge", label: "Closed now", detail: `Order ahead for pickup from ${formatSlot(slots[0])}` }
        : { tone: "badge", label: "Closed", detail: "No pickup times are available right now." };

  return (
    <>
      <header className="store-hero">
        <div className="container">
          <h1>{restaurant.name}</h1>
          <div className="store-meta">
            <span className={`badge ${status.tone}`}>
              <span className="dot" />
              {status.label}
            </span>
            <span>
              <Icon name="clock" size={16} />
              {status.detail}
            </span>
            {!table && (
              <span>
                <Icon name="bag" size={16} />
                Pickup only
              </span>
            )}
            {table && (
              <Button size="sm" icon="bell" onClick={() => setHelpOpen(true)}>
                Call waiter or ask for the bill
              </Button>
            )}
          </div>
        </div>
      </header>

      {store.categories.length > 1 && (
        <nav className="catnav" aria-label="Menu sections">
          <div className="container catnav-inner">
            {store.categories.map((c) => (
              <button
                key={c.id}
                className="chip"
                aria-current={activeCat === c.id}
                onClick={() => document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                {c.name}
              </button>
            ))}
          </div>
        </nav>
      )}

      <div className="container store-layout">
        <main>
          {store.categories.length === 0 && (
            <div className="empty">
              <Icon name="store" size={36} />
              <p>The menu is being updated. Please check back soon.</p>
            </div>
          )}
          {store.categories.map((category) => {
            const hasPhotos = photoRich(category.items);
            return (
            <section key={category.id} id={`cat-${category.id}`} data-category={category.id} className="menu-section" aria-labelledby={`h-${category.id}`}>
              <h2 id={`h-${category.id}`} className="menu-heading">{category.name}<span className="menu-count">{category.items.length}</span></h2>
              <div className={`menu-grid ${hasPhotos ? "photos" : "rows"}`}>
                {category.items.map((item) => {
                  const inCart = countByItem.get(item.id) ?? 0;
                  const orderable = item.available && restaurant.orderingOpen;
                  const quickAdd = item.modifierGroups.every((g) => g.minChoices === 0);
                  return (
                    <div key={item.id} style={{ position: "relative" }}>
                      <button className={`item-card ${hasPhotos ? "has-photo" : `row${item.imageUrl ? " with-thumb" : ""}`}`} disabled={!orderable} onClick={() => setPicking(item)} aria-label={`${item.name}, ${money(item.priceCents)}${item.available ? "" : ", sold out"}`}>
                        {hasPhotos &&
                          (item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="item-photo" src={item.imageUrl} alt="" loading="lazy" />
                          ) : (
                            <span className="item-photo item-photo-empty" aria-hidden="true"><Icon name="image" size={28} /></span>
                          ))}
                        <div className="item-body">
                          <span className="item-name">{item.name}</span>
                          {item.description && <span className="item-desc clamp-2">{item.description}</span>}
                          <span className="item-price">
                            {money(item.priceCents)}
                            {!item.available && <span className="badge badge-danger" style={{ marginLeft: 8 }}>Sold out</span>}
                          </span>
                        </div>
                        {!hasPhotos && item.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="item-thumb" src={item.imageUrl} alt="" loading="lazy" />
                        )}
                      </button>
                      {inCart > 0 && <span className="in-cart" aria-label={`${inCart} in your order`}>{inCart}</span>}
                      {orderable && (
                        <button
                          className="add-fab"
                          aria-label={quickAdd ? `Add one ${item.name}` : `Choose options for ${item.name}`}
                          onClick={() => (quickAdd ? addLine({ itemId: item.id, quantity: 1, optionIds: [], note: "" }, item.name) : setPicking(item))}
                        >
                          <Icon name="plus" size={18} strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
            );
          })}
        </main>

        <div className={`cart-backdrop ${cartOpen ? "open" : ""}`} onClick={() => setCartOpen(false)} aria-hidden="true" />
        <aside className={`cart-panel ${cartOpen ? "open" : ""}`} aria-label="Your order">
          <div className="cart-head">
            <div>
              <h2>Your order</h2>
              {itemCount > 0 && <div className="subtle">{plural(itemCount, "item")}</div>}
            </div>
            <Button variant="ghost" icon="x" aria-label="Close your order" className="cart-close" onClick={() => setCartOpen(false)} />
          </div>
          <div className="cart-scroll">
            {cart.length === 0 ? (
              <div className="empty">
                <Icon name="bag" size={32} />
                <p>Your order is empty.</p>
                <p className="small">Tap an item to add it.</p>
              </div>
            ) : (
              <>
                <div>
                  {cart.map((line, index) => {
                    const priced = quote?.lines[index];
                    const item = items.get(line.itemId);
                    const lineIssues = issues.filter((i) => i.line === index);
                    return (
                      <div key={line.key} className="cart-line">
                        <div className="strong">{item?.name ?? "Item"}</div>
                        <div className="strong num">{priced ? money(priced.lineTotalCents) : <Skeleton width={52} height={14} />}</div>
                        <div className="subtle" style={{ gridColumn: "1 / -1" }}>
                          {priced && priced.options.length > 0 && <div>{priced.options.map((o) => o.name).join(", ")}</div>}
                          {line.note && <div>“{line.note}”</div>}
                        </div>
                        {lineIssues.map((i) => (
                          <div key={i.message} className="error-text" role="alert" style={{ gridColumn: "1 / -1" }}>{i.message}</div>
                        ))}
                        <div style={{ gridColumn: "1 / -1" }}>
                          <Stepper
                            size="sm"
                            min={0}
                            value={line.quantity}
                            label={`Quantity of ${item?.name ?? "item"}`}
                            onChange={(q) => setCart((c) => (q === 0 ? c.filter((l) => l.key !== line.key) : c.map((l) => (l.key === line.key ? { ...l, quantity: q } : l))))}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {issues.filter((i) => i.line === null).map((i) => (
                  <Alert key={i.message} tone="danger">{i.message}</Alert>
                ))}

                <div className="stack" style={{ marginTop: 14 }}>
                  {!table && (
                    <label className="field">
                      <span className="label">Pickup time</span>
                      <select className="select" value={pickup} onChange={(e) => setPickup(e.target.value)} disabled={!canOrder}>
                        {restaurant.openNow && restaurant.asap && <option value="asap">As soon as possible · {formatSlot(restaurant.asap)}</option>}
                        {slots.map((s) => (
                          <option key={s} value={s}>{formatSlot(s)}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="field">
                    <span className="label">Tip for the kitchen</span>
                    <Segmented label="Tip" value={tipPct} onChange={setTipPct} options={TIPS.map((p) => ({ value: p, label: p === 0 ? "None" : `${p}%` }))} />
                  </div>
                </div>

                <div className="stack" style={{ "--gap": "8px", marginTop: 12 } as React.CSSProperties}>
                  {quote?.discountLabel ? (
                    <div className="row-between">
                      <span className="badge badge-success"><Icon name="check" size={14} /> {quote.discountLabel} applied</span>
                      <Button variant="ghost" size="sm" onClick={() => { setPromoCode(""); setPromoDraft(""); setPromoMessage(null); }}>Remove</Button>
                    </div>
                  ) : promoOpen ? (
                    <form className="row" onSubmit={(e) => { e.preventDefault(); if (promoDraft.trim()) { setPromoMessage(null); setPromoCode(promoDraft.trim()); } }}>
                      <input className="input grow" style={{ textTransform: "uppercase" }} placeholder="Promo code" aria-label="Promo code" value={promoDraft} maxLength={24} onChange={(e) => setPromoDraft(e.target.value)} aria-invalid={!!promoMessage} />
                      <Button type="submit" disabled={!promoDraft.trim()}>Apply</Button>
                    </form>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setPromoOpen(true)} style={{ alignSelf: "flex-start" }}>Have a promo code?</Button>
                  )}
                  {promoMessage && <span className="error-text" role="alert">{promoMessage}</span>}
                </div>

                <div className="totals" aria-busy={pricing}>
                  <div className="row-between muted"><span>Subtotal</span><span>{quote ? money(quote.subtotalCents) : "—"}</span></div>
                  {quote && quote.discountCents > 0 && <div className="row-between" style={{ color: "var(--success)" }}><span>{quote.discountLabel}</span><span>− {money(quote.discountCents)}</span></div>}
                  <div className="row-between muted"><span>Tax ({(restaurant.taxRateBps / 100).toFixed(2)}%)</span><span>{quote ? money(quote.taxCents) : "—"}</span></div>
                  {tipCents > 0 && <div className="row-between muted"><span>Tip</span><span>{money(tipCents)}</span></div>}
                  <div className="row-between grand"><span>Total</span><span>{totalCents !== null ? money(totalCents) : "—"}</span></div>
                </div>

                {quote && totalCents !== null && (
                  <Checkout
                    slug={slug}
                    lines={cart.map((l) => ({ itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds, note: l.note }))}
                    pickup={pickup}
                    tipCents={tipCents}
                    totalCents={totalCents}
                    canOrder={canOrder && issues.length === 0 && !pricing}
                    onClearCart={() => setCart([])}
                    promoCode={quote?.discountLabel ? promoCode : undefined}
                    table={table}
                  />
                )}
                {!canOrder && <Alert tone="warning">{status.detail}</Alert>}
              </>
            )}
          </div>
        </aside>
      </div>

      {itemCount > 0 && !cartOpen && (
        <div className="cart-bar">
          <Button variant="primary" size="lg" block onClick={() => setCartOpen(true)}>
            <span className="row" style={{ "--gap": "10px" } as React.CSSProperties}>
              <span className="cart-count">{itemCount}</span>
              View order
            </span>
            <span className="num">{totalCents !== null ? money(totalCents) : ""}</span>
          </Button>
        </div>
      )}

      {picking && (
        <ItemSheet
          item={picking}
          onClose={() => setPicking(null)}
          onAdd={(line) => {
            addLine(line, picking.name);
            setPicking(null);
          }}
        />
      )}
      {helpOpen && table && <HelpSheet token={table.token} label={table.label} onClose={() => setHelpOpen(false)} />}
      {!cartOpen && toasts}
    </>
  );
}

function StoreSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading menu">
      <header className="store-hero">
        <div className="container stack">
          <Skeleton height={34} width="55%" />
          <Skeleton height={18} width="40%" />
        </div>
      </header>
      <div className="container store-layout">
        <div className="menu-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card stack" style={{ "--gap": "10px" } as React.CSSProperties}>
              <Skeleton height={18} width="60%" />
              <Skeleton height={14} />
              <Skeleton height={14} width="30%" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
