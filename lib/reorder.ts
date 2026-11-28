// "Order again": remember what a guest ordered last, on their own device, and offer it back with one tap.
// Only dish ids, choices, notes and names are kept (no name, phone, card or price) and nothing leaves the browser.
// Prices are never worked out here: the server prices every cart, so the offered cart is priced like any other.
import { z } from "zod";

export const REORDER_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const savedLine = z
  .object({
    itemId: z.uuid(),
    name: z.string().max(120),
    quantity: z.number().int().min(1).max(50),
    optionIds: z.array(z.uuid()).max(30),
    note: z.string().max(200),
  })
  .strict();

export const savedOrderSchema = z
  .object({ v: z.literal(1), savedAt: z.number().int().positive(), lines: z.array(savedLine).min(1).max(50) })
  .strict();

export type SavedOrder = z.infer<typeof savedOrderSchema>;
export type OrderLineInput = { itemId: string; quantity: number; optionIds: string[]; note: string };

export const lastOrderKey = (slug: string) => `steos:last-order:${slug}`;

/** Reads what the browser stored. Anything missing, corrupt, from another version or older than 90 days is "nothing saved". */
export function parseSavedOrder(raw: string | null, now = Date.now()): SavedOrder | null {
  if (!raw) return null;
  try {
    const parsed = savedOrderSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (now - parsed.data.savedAt > REORDER_MAX_AGE_MS || parsed.data.savedAt > now + 60_000) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** What to remember about a cart that has just been ordered. Dishes whose names are unknown are left out. */
export function snapshotOrder(cart: OrderLineInput[], nameOf: (itemId: string) => string | undefined, now = Date.now()): SavedOrder | null {
  const lines = cart.flatMap((l) => {
    const name = nameOf(l.itemId);
    return name ? [{ itemId: l.itemId, name: name.slice(0, 120), quantity: l.quantity, optionIds: [...l.optionIds], note: l.note.slice(0, 200) }] : [];
  });
  return lines.length ? { v: 1, savedAt: now, lines: lines.slice(0, 50) } : null;
}

export type MenuItemLike = {
  id: string;
  available: boolean;
  modifierGroups: { id: string; minChoices: number; maxChoices: number; options: { id: string; available: boolean }[] }[];
};

/**
 * Turns a saved order back into cart lines using today's menu. A line is dropped, and named, when its dish is gone or sold out,
 * a choice it used is gone or sold out, or the dish's choice rules changed so the old choices no longer satisfy them.
 */
export function reorderLines(saved: SavedOrder, items: ReadonlyMap<string, MenuItemLike>): { lines: OrderLineInput[]; dropped: string[] } {
  const lines: OrderLineInput[] = [];
  const dropped: string[] = [];
  for (const line of saved.lines) {
    const item = items.get(line.itemId);
    const ok =
      !!item &&
      item.available &&
      new Set(line.optionIds).size === line.optionIds.length &&
      line.optionIds.every((id) => item.modifierGroups.some((g) => g.options.some((o) => o.id === id && o.available))) &&
      item.modifierGroups.every((g) => {
        const count = g.options.filter((o) => line.optionIds.includes(o.id)).length;
        return count >= g.minChoices && count <= g.maxChoices;
      });
    if (ok) lines.push({ itemId: line.itemId, quantity: line.quantity, optionIds: [...line.optionIds], note: line.note });
    else dropped.push(line.name);
  }
  return { lines, dropped };
}
