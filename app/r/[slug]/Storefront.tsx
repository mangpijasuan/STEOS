"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Checkout from "./Checkout";
import TableHelp from "../../t/TableHelp";

type Option = { id: string; name: string; priceDeltaCents: number; available: boolean };
type Group = { id: string; name: string; minChoices: number; maxChoices: number; options: Option[] };
type Item = { id: string; name: string; description: string; priceCents: number; available: boolean; imageUrl?: string | null; modifierGroups: Group[] };
type Category = { id: string; name: string; items: Item[] };
type Store = {
  restaurant: { name: string; timezone: string; taxRateBps: number; orderingOpen: boolean; openNow: boolean; asap: string | null };
  categories: Category[];
};
type CartLine = { key: string; itemId: string; quantity: number; optionIds: string[]; note: string };
type Quote = {
  lines: { itemId: string; name: string; quantity: number; options: { name: string }[]; note: string | null; lineTotalCents: number }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};
type Issue = { line: number | null; message: string };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const card = { border: "1px solid #ddd", borderRadius: 12, padding: 14, marginBottom: 12, background: "#fff" } as const;
const button = { padding: "12px 16px", borderRadius: 10, border: "none", background: "#c2410c", color: "#fff", fontSize: 16, cursor: "pointer" } as const;
const ghost = { padding: "10px 14px", borderRadius: 10, border: "1px solid #bbb", background: "#fff", fontSize: 15, cursor: "pointer" } as const;

/** Set when a guest scanned a table's QR code: no pickup time, name and phone are optional, and they may pay later. */
export type TableContext = { token: string; label: string; floorName: string | null; payLaterEnabled: boolean };

export default function Storefront({ slug, table }: { slug: string; table?: TableContext }) {
  const [store, setStore] = useState<Store | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [chosenPickup, setPickup] = useState<string | null>(null);
  const [quoted, setQuoted] = useState<{ key: string; quote: Quote } | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [picking, setPicking] = useState<Item | null>(null);
  const [tipPct, setTipPct] = useState(0);

  // Load menu and pickup times.
  useEffect(() => {
    (async () => {
      const [menuRes, slotRes] = await Promise.all([fetch(`/api/r/${slug}/menu`), table ? Promise.resolve(null) : fetch(`/api/r/${slug}/pickup-slots`)]);
      if (!menuRes.ok) {
        setLoadError(menuRes.status === 404 ? "We couldn't find this restaurant." : "Something went wrong. Please refresh.");
        return;
      }
      setStore(await menuRes.json());
      if (slotRes?.ok) setSlots((await slotRes.json()).slots);
    })().catch(() => setLoadError("Something went wrong. Please refresh."));
  }, [slug, table]);

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

  // Seated guests do not pick a time; the kitchen's estimate is used.
  const pickup = table
    ? "asap"
    : chosenPickup && slots.includes(chosenPickup)
      ? chosenPickup
      : store?.restaurant.asap ? "asap" : slots[0] ?? "";

  const quoteKey = JSON.stringify([slug, cart, pickup]);
  const quote = quoted?.key === quoteKey ? quoted.quote : null;

  // Ask the server to price the cart whenever it changes.
  useEffect(() => {
    if (cart.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuoted(null);
      setIssues([]);
      return;
    }
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
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (res.ok) {
          setQuoted({ key: quoteKey, quote: data });
          setIssues([]);
        } else {
          setQuoted(null);
          setIssues(data.issues ?? [{ line: null, message: data.error ?? "Could not price your cart" }]);
        }
      } catch {
        if (!controller.signal.aborted) {
          setQuoted(null);
          setIssues([{ line: null, message: "Could not price your cart. Check your connection and try again." }]);
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [cart, pickup, quoteKey, slug]);

  const itemName = useMemo(() => new Map((store?.categories ?? []).flatMap((c) => c.items).map((i) => [i.id, i.name])), [store]);
  const formatSlot = useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat(undefined, {
        timeZone: store?.restaurant.timezone,
        weekday: "short",
        timeZoneName: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(iso)),
    [store],
  );

  if (loadError) return <main><p role="alert">{loadError}</p></main>;
  if (!store) return <main><p>Loading menu…</p></main>;

  const { restaurant } = store;
  const canOrder = restaurant.orderingOpen && (!!table || !!pickup);
  const tipCents = quote ? Math.round((quote.subtotalCents * tipPct) / 100) : 0;

  return (
    <main style={{ paddingBottom: 80 }}>
      <h1 style={{ marginBottom: 4 }}>{restaurant.name}</h1>
      {table && (
        <p style={{ margin: "0 0 4px", fontWeight: 600 }}>
          Table {table.label}{table.floorName ? ` · ${table.floorName}` : ""}
        </p>
      )}
      <p style={{ marginTop: 0, color: "#555" }}>
        {!restaurant.orderingOpen
          ? "Ordering is paused right now."
          : table
            ? "Order from your table. Your food is brought to you."
            : restaurant.openNow && restaurant.asap
            ? `Open now. Earliest pickup ${formatSlot(restaurant.asap)}.`
            : slots.length
              ? `Closed right now. You can order for pickup from ${formatSlot(slots[0])}.`
              : "No pickup times are available right now."}
      </p>

      {store.categories.map((category) => (
        <section key={category.id}>
          <h2>{category.name}</h2>
          {category.items.map((item) => (
            <div key={item.id} style={{ ...card, opacity: item.available ? 1 : 0.55 }}>
              {item.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" loading="lazy" style={{ display: "block", width: "100%", height: 160, objectFit: "cover", borderRadius: 8, marginBottom: 10, background: "#eee" }} />
              )}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <strong>{item.name}</strong>
                  {item.description && <div style={{ color: "#666", fontSize: 14 }}>{item.description}</div>}
                  <div style={{ marginTop: 4 }}>{money(item.priceCents)}</div>
                </div>
                {item.available ? (
                  <button style={ghost} disabled={!restaurant.orderingOpen} onClick={() => setPicking(item)}>
                    Add
                  </button>
                ) : (
                  <span style={{ color: "#a00", alignSelf: "center" }}>Sold out</span>
                )}
              </div>
            </div>
          ))}
        </section>
      ))}

      {picking && (
        <ItemPicker
          item={picking}
          onCancel={() => setPicking(null)}
          onAdd={(line) => {
            setCart((c) => [...c, line]);
            setPicking(null);
          }}
        />
      )}

      <section style={{ ...card, marginTop: 24 }} aria-label="Your order">
        <h2 style={{ marginTop: 0 }}>Your order</h2>
        {cart.length === 0 && <p>Your cart is empty.</p>}
        {cart.map((line, index) => {
          const priced = quote?.lines[index];
          return (
            <div key={line.key} style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {line.quantity} × {itemName.get(line.itemId) ?? "Item"}
                </span>
                <span>{priced ? money(priced.lineTotalCents) : ""}</span>
              </div>
              {priced && priced.options.length > 0 && <div style={{ fontSize: 13, color: "#666" }}>{priced.options.map((o) => o.name).join(", ")}</div>}
              {line.note && <div style={{ fontSize: 13, color: "#666" }}>Note: {line.note}</div>}
              {issues.filter((i) => i.line === index).map((i) => (
                <div key={i.message} role="alert" style={{ color: "#a00", fontSize: 14 }}>{i.message}</div>
              ))}
              <button style={{ ...ghost, marginTop: 6, padding: "6px 10px", fontSize: 14 }} onClick={() => setCart((c) => c.filter((l) => l.key !== line.key))}>
                Remove
              </button>
            </div>
          );
        })}
        {issues.filter((i) => i.line === null).map((i) => (
          <p key={i.message} role="alert" style={{ color: "#a00" }}>{i.message}</p>
        ))}

        {cart.length > 0 && (
          <>
            {!table && <label style={{ display: "block", marginTop: 12 }}>
              Pickup time
              <select value={pickup} onChange={(e) => setPickup(e.target.value)} style={{ display: "block", padding: 10, marginTop: 4, width: "100%", fontSize: 16 }}>
                {restaurant.openNow && restaurant.asap && <option value="asap">As soon as possible ({formatSlot(restaurant.asap)})</option>}
                {slots.map((s) => (
                  <option key={s} value={s}>{formatSlot(s)}</option>
                ))}
              </select>
            </label>}
            {quote && (
              <div style={{ marginTop: 12 }}>
                <Row label="Subtotal" value={money(quote.subtotalCents)} />
                <Row label={`Tax (${(restaurant.taxRateBps / 100).toFixed(2)}%)`} value={money(quote.taxCents)} />
                {tipCents > 0 && <Row label="Tip" value={money(tipCents)} />}
                <Row label="Total" value={money(quote.totalCents + tipCents)} bold />
              </div>
            )}
            {quote && (
              <label style={{ display: "block", marginTop: 12 }}>
                Tip for the kitchen
                <select value={tipPct} onChange={(e) => setTipPct(Number(e.target.value))} style={{ display: "block", padding: 10, marginTop: 4, width: "100%", fontSize: 16 }}>
                  {[0, 10, 15, 20].map((p) => (
                    <option key={p} value={p}>{p === 0 ? "No tip" : `${p}%`}</option>
                  ))}
                </select>
              </label>
            )}
            {quote && (
              <Checkout
                slug={slug}
                table={table}
                lines={cart.map((l) => ({ itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds, note: l.note }))}
                pickup={pickup}
                tipCents={tipCents}
                totalCents={quote.totalCents + tipCents}
                canOrder={canOrder && issues.length === 0}
                onClearCart={() => setCart([])}
              />
            )}
          </>
        )}
      </section>
      {table && <TableHelp token={table.token} label={table.label} />}
    </main>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? 700 : 400, padding: "2px 0" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ItemPicker({ item, onAdd, onCancel }: { item: Item; onAdd: (line: CartLine) => void; onCancel: () => void }) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  const problems = item.modifierGroups
    .map((g) => {
      const count = g.options.filter((o) => chosen.has(o.id)).length;
      return count < g.minChoices ? `Choose at least ${g.minChoices} for ${g.name}` : null;
    })
    .filter(Boolean);

  function toggle(group: Group, option: Option) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(option.id)) {
        next.delete(option.id);
      } else {
        if (group.maxChoices === 1) group.options.forEach((o) => next.delete(o.id));
        const count = group.options.filter((o) => next.has(o.id)).length;
        if (count < group.maxChoices) next.add(option.id);
      }
      return next;
    });
  }

  const extra = item.modifierGroups.flatMap((g) => g.options).filter((o) => chosen.has(o.id)).reduce((s, o) => s + o.priceDeltaCents, 0);

  return (
    <div role="dialog" aria-label={item.name} style={{ ...card, border: "2px solid #c2410c" }}>
      {item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" style={{ display: "block", width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 8, marginBottom: 10, background: "#eee" }} />
      )}
      <h3 style={{ marginTop: 0 }}>{item.name}</h3>
      {item.modifierGroups.map((group) => (
        <fieldset key={group.id} style={{ border: "none", padding: 0, margin: "0 0 12px" }}>
          <legend style={{ fontWeight: 600 }}>
            {group.name} <span style={{ fontWeight: 400, color: "#666" }}>{group.minChoices > 0 ? "(required)" : "(optional)"}</span>
          </legend>
          {group.options.map((option) => (
            <label key={option.id} style={{ display: "flex", gap: 8, padding: "6px 0", opacity: option.available ? 1 : 0.5 }}>
              <input
                type={group.maxChoices === 1 ? "radio" : "checkbox"}
                name={group.id}
                disabled={!option.available}
                checked={chosen.has(option.id)}
                onChange={() => toggle(group, option)}
              />
              {option.name}
              {option.priceDeltaCents > 0 && <span style={{ color: "#666" }}>+{money(option.priceDeltaCents)}</span>}
            </label>
          ))}
        </fieldset>
      ))}
      <label>
        Special instructions
        <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 4, fontSize: 16, boxSizing: "border-box" }} />
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <button style={ghost} onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Fewer">−</button>
        <span>{quantity}</span>
        <button style={ghost} onClick={() => setQuantity((q) => Math.min(50, q + 1))} aria-label="More">+</button>
      </div>
      {problems.map((p) => (
        <p key={p} role="alert" style={{ color: "#a00", marginBottom: 0 }}>{p}</p>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          style={{ ...button, opacity: problems.length ? 0.5 : 1 }}
          disabled={problems.length > 0}
          onClick={() => onAdd({ key: crypto.randomUUID(), itemId: item.id, quantity, optionIds: [...chosen], note: note.trim() })}
        >
          Add to order · {money((item.priceCents + extra) * quantity)}
        </button>
        <button style={ghost} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
