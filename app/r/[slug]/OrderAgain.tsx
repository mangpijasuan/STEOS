"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../icons";
import { Button } from "../../ui";
import { lastOrderKey, parseSavedOrder, reorderLines, snapshotOrder, type MenuItemLike, type OrderLineInput, type SavedOrder } from "@/lib/reorder";

/** Remembers the cart that was just ordered, on this device only. Storage can be unavailable, so it never throws. */
export function rememberOrder(slug: string, cart: OrderLineInput[], nameOf: (itemId: string) => string | undefined) {
  try {
    const snapshot = snapshotOrder(cart, nameOf);
    if (snapshot) localStorage.setItem(lastOrderKey(slug), JSON.stringify(snapshot));
  } catch {}
}

/** One tap to put the guest's last order back in the cart. It lists dishes only: the server prices the cart as usual. */
export function OrderAgain({ slug, items, names, cartEmpty, onAdd }: {
  slug: string;
  items: ReadonlyMap<string, MenuItemLike>;
  names: ReadonlyMap<string, string>;
  cartEmpty: boolean;
  onAdd: (lines: OrderLineInput[], dropped: string[]) => void;
}) {
  const [saved, setSaved] = useState<SavedOrder | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaved(parseSavedOrder(localStorage.getItem(lastOrderKey(slug))));
    } catch {}
  }, [slug]);

  const result = useMemo(() => (saved ? reorderLines(saved, items) : null), [saved, items]);
  if (!saved || !result || hidden || !cartEmpty || result.lines.length === 0) return null;

  const summary = result.lines
    .map((l) => `${l.quantity} × ${names.get(l.itemId) ?? saved.lines.find((s) => s.itemId === l.itemId)?.name ?? "dish"}`)
    .join(" · ");
  return (
    <section className="reorder" aria-label="Order again">
      <div className="reorder-copy">
        <h2><Icon name="refund" size={18} /> Order again</h2>
        <p className="reorder-items">{summary}</p>
        {result.dropped.length > 0 && <p className="subtle">Not available right now: {result.dropped.join(", ")}.</p>}
      </div>
      <div className="reorder-actions">
        <Button variant="primary" onClick={() => onAdd(result.lines, result.dropped)}>Add to my order</Button>
        <Button variant="ghost" onClick={() => setHidden(true)}>Not now</Button>
      </div>
    </section>
  );
}
