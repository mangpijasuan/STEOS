import { HttpError } from "./http";
import type { getMenu } from "./menu";

export type MenuTree = Awaited<ReturnType<typeof getMenu>>;
export type CartLineInput = { itemId: string; quantity: number; optionIds: string[]; note?: string };
export type Issue = { line: number | null; message: string };

export type PricedLine = {
  itemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  options: { id: string; name: string; priceDeltaCents: number }[];
  note: string | null;
  lineTotalCents: number;
};

export type PricedCart = {
  lines: PricedLine[];
  /** Food total before any discount. */
  subtotalCents: number;
  discountCents: number;
  discountLabel: string | null;
  taxCents: number;
  tipCents: number;
  totalCents: number;
};

/** Tax in cents, rounded half up. Rates are basis points (875 = 8.75%). */
export function taxCents(subtotalCents: number, taxRateBps: number): number {
  return Math.floor((subtotalCents * taxRateBps + 5000) / 10000);
}

/** Given the food subtotal, says how much to take off, or throws if the discount does not apply to this cart. */
export type DiscountRule = (subtotalCents: number) => { cents: number; label: string };

/**
 * Validates a cart against the live menu and prices it. The browser's prices are never trusted:
 * only item ids, option ids, quantities and notes come from the customer.
 * A discount comes off the food subtotal first, and tax is charged on what is left. Tips are not taxed.
 */
export function priceCart(menu: MenuTree, input: CartLineInput[], opts: { taxRateBps: number; tipCents?: number; discount?: DiscountRule }): PricedCart {
  const issues: Issue[] = [];
  if (input.length === 0) throw new HttpError(422, "Cart has problems", [{ line: null, message: "Your cart is empty" }]);

  const items = new Map(menu.flatMap((c) => c.items).map((i) => [i.id, i]));
  const lines: PricedLine[] = [];

  input.forEach((line, index) => {
    const item = items.get(line.itemId);
    if (!item) return void issues.push({ line: index, message: "This item is no longer on the menu" });
    if (!item.available) return void issues.push({ line: index, message: `${item.name} is sold out` });

    const chosen = new Set<string>();
    const picked: PricedLine["options"] = [];
    let ok = true;

    for (const optionId of line.optionIds) {
      if (chosen.has(optionId)) {
        issues.push({ line: index, message: "The same option was chosen twice" });
        ok = false;
        continue;
      }
      chosen.add(optionId);
      const group = item.modifierGroups.find((g) => g.options.some((o) => o.id === optionId));
      const option = group?.options.find((o) => o.id === optionId);
      if (!group || !option) {
        issues.push({ line: index, message: `An option for ${item.name} is no longer available` });
        ok = false;
      } else if (!option.available) {
        issues.push({ line: index, message: `${option.name} is sold out` });
        ok = false;
      } else {
        picked.push({ id: option.id, name: option.name, priceDeltaCents: option.priceDeltaCents });
      }
    }

    for (const group of item.modifierGroups) {
      const count = group.options.filter((o) => chosen.has(o.id)).length;
      if (count < group.minChoices) {
        issues.push({ line: index, message: `Choose at least ${group.minChoices} for ${group.name} on ${item.name}` });
        ok = false;
      }
      if (count > group.maxChoices) {
        issues.push({ line: index, message: `Choose at most ${group.maxChoices} for ${group.name} on ${item.name}` });
        ok = false;
      }
    }
    if (!ok) return;

    const unitPriceCents = item.priceCents + picked.reduce((sum, o) => sum + o.priceDeltaCents, 0);
    const note = line.note?.trim() ? line.note.trim() : null;
    lines.push({
      itemId: item.id,
      name: item.name,
      quantity: line.quantity,
      unitPriceCents,
      options: picked,
      note,
      lineTotalCents: unitPriceCents * line.quantity,
    });
  });

  if (issues.length) throw new HttpError(422, "Cart has problems", issues);

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const rule = opts.discount?.(subtotalCents) ?? null;
  // A discount can never be more than the food, so a total can never go negative.
  const discountCents = rule ? Math.min(subtotalCents, Math.max(0, Math.round(rule.cents))) : 0;
  const tax = taxCents(subtotalCents - discountCents, opts.taxRateBps);
  const tipCents = opts.tipCents ?? 0;
  return {
    lines,
    subtotalCents,
    discountCents,
    discountLabel: discountCents > 0 ? rule!.label : null,
    taxCents: tax,
    tipCents,
    totalCents: subtotalCents - discountCents + tax + tipCents,
  };
}
