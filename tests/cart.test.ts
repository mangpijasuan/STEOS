import { describe, expect, it } from "vitest";
import { priceCart, taxCents, type MenuTree } from "../lib/cart";
import { HttpError } from "../lib/http";

const opt = (id: string, name: string, priceDeltaCents = 0, available = true) => ({ id, name, priceDeltaCents, available });
const menu = [
  {
    id: "c1",
    name: "Mains",
    items: [
      {
        id: "i1", name: "Curry", description: "", priceCents: 1200, available: true, imageUrl: null,
        modifierGroups: [
          { id: "g1", name: "Spice", minChoices: 1, maxChoices: 1, options: [opt("o1", "Mild"), opt("o2", "Hot")] },
          { id: "g2", name: "Extras", minChoices: 0, maxChoices: 2, options: [opt("o3", "Egg", 150), opt("o4", "Rice", 200), opt("o5", "Tofu", 100, false)] },
        ],
      },
      { id: "i2", name: "Soup", description: "", priceCents: 800, available: false, imageUrl: null, modifierGroups: [] },
    ],
  },
] as unknown as MenuTree;

const issuesOf = (fn: () => unknown) => {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(HttpError); return (e as HttpError).details as { message: string }[]; }
  throw new Error("expected failure");
};

describe("tax", () => {
  it("rounds half up", () => {
    expect(taxCents(1000, 875)).toBe(88); // 87.5 -> 88
    expect(taxCents(1199, 875)).toBe(105); // 104.9
    expect(taxCents(0, 875)).toBe(0);
  });
});

describe("priceCart", () => {
  it("prices options, quantity and tax on the server", () => {
    const cart = priceCart(menu, [{ itemId: "i1", quantity: 2, optionIds: ["o2", "o3"] }], { taxRateBps: 875, tipCents: 100 });
    expect(cart.subtotalCents).toBe(2 * (1200 + 150));
    expect(cart.taxCents).toBe(taxCents(2700, 875));
    expect(cart.totalCents).toBe(2700 + cart.taxCents + 100);
  });

  it("does not tax tips", () => {
    const a = priceCart(menu, [{ itemId: "i1", quantity: 1, optionIds: ["o1"] }], { taxRateBps: 875 });
    const b = priceCart(menu, [{ itemId: "i1", quantity: 1, optionIds: ["o1"] }], { taxRateBps: 875, tipCents: 500 });
    expect(b.taxCents).toBe(a.taxCents);
  });

  it("rejects an empty cart, unknown items and sold-out items", () => {
    expect(issuesOf(() => priceCart(menu, [], { taxRateBps: 0 }))[0].message).toMatch(/empty/);
    expect(issuesOf(() => priceCart(menu, [{ itemId: "zzz", quantity: 1, optionIds: [] }], { taxRateBps: 0 }))[0].message).toMatch(/no longer/);
    expect(issuesOf(() => priceCart(menu, [{ itemId: "i2", quantity: 1, optionIds: [] }], { taxRateBps: 0 }))[0].message).toMatch(/sold out/);
  });

  it("enforces modifier minimum and maximum", () => {
    expect(issuesOf(() => priceCart(menu, [{ itemId: "i1", quantity: 1, optionIds: [] }], { taxRateBps: 0 }))[0].message).toMatch(/at least 1/);
    expect(issuesOf(() => priceCart(menu, [{ itemId: "i1", quantity: 1, optionIds: ["o1", "o2"] }], { taxRateBps: 0 }))[0].message).toMatch(/at most 1/);
  });

  it("rejects sold-out, foreign and duplicate options", () => {
    expect(issuesOf(() => priceCart(menu, [{ itemId: "i1", quantity: 1, optionIds: ["o1", "o5"] }], { taxRateBps: 0 }))[0].message).toMatch(/sold out/);
    expect(issuesOf(() => priceCart(menu, [{ itemId: "i1", quantity: 1, optionIds: ["o1", "other-restaurant-option"] }], { taxRateBps: 0 }))[0].message).toMatch(/no longer available/);
    expect(issuesOf(() => priceCart(menu, [{ itemId: "i1", quantity: 1, optionIds: ["o1", "o1"] }], { taxRateBps: 0 }))[0].message).toMatch(/twice/);
  });
});
