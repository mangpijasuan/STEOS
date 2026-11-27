import { describe, expect, it } from "vitest";
import { REORDER_MAX_AGE_MS, lastOrderKey, parseSavedOrder, reorderLines, snapshotOrder, type MenuItemLike, type SavedOrder } from "../lib/reorder";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = Date.UTC(2026, 10, 27, 12);
const noodle = id(1), tea = id(2), chicken = id(11), tofu = id(12), ice = id(21);

// Noodle bowl: choose exactly one protein. Iced tea: optional ice, at most one.
const menu = (over: Partial<Record<string, Partial<MenuItemLike>>> = {}): Map<string, MenuItemLike> =>
  new Map<string, MenuItemLike>([
    [noodle, { id: noodle, available: true, modifierGroups: [{ id: id(100), minChoices: 1, maxChoices: 1, options: [{ id: chicken, available: true }, { id: tofu, available: true }] }], ...over[noodle] }],
    [tea, { id: tea, available: true, modifierGroups: [{ id: id(101), minChoices: 0, maxChoices: 1, options: [{ id: ice, available: true }] }], ...over[tea] }],
  ]);
const saved = (lines: SavedOrder["lines"]): SavedOrder => ({ v: 1, savedAt: NOW, lines });
const noodleLine = { itemId: noodle, name: "Noodle bowl", quantity: 2, optionIds: [chicken], note: "no peanuts" };
const teaLine = { itemId: tea, name: "Iced tea", quantity: 1, optionIds: [], note: "" };

describe("remembering an order", () => {
  it("keeps only dishes, choices, notes and names, under a per-restaurant key", () => {
    const snap = snapshotOrder([{ itemId: noodle, quantity: 2, optionIds: [chicken], note: "no peanuts" }], (i) => (i === noodle ? "Noodle bowl" : undefined), NOW)!;
    expect(snap).toEqual({ v: 1, savedAt: NOW, lines: [noodleLine] });
    expect(Object.keys(snap.lines[0]).sort()).toEqual(["itemId", "name", "note", "optionIds", "quantity"]);
    expect(lastOrderKey("zogam-cafe")).toBe("steos:last-order:zogam-cafe");
    expect(lastOrderKey("zogam-cafe")).not.toBe(lastOrderKey("other"));
  });

  it("leaves out dishes whose names are unknown, and remembers nothing for an empty result", () => {
    expect(snapshotOrder([{ itemId: noodle, quantity: 1, optionIds: [], note: "" }], () => undefined, NOW)).toBeNull();
    expect(snapshotOrder([], () => "x", NOW)).toBeNull();
  });
});

describe("reading what the browser stored", () => {
  const raw = (o: unknown) => JSON.stringify(o);
  it("accepts a valid order and rejects anything else as 'nothing saved'", () => {
    expect(parseSavedOrder(raw(saved([noodleLine])), NOW)).toEqual(saved([noodleLine]));
    for (const bad of [null, "", "not json", "{}", "[]", raw({ v: 2, savedAt: NOW, lines: [noodleLine] }), raw({ v: 1, savedAt: NOW, lines: [] }),
      raw({ v: 1, savedAt: NOW, lines: [{ ...noodleLine, itemId: "not-a-uuid" }] }), raw({ v: 1, savedAt: NOW, lines: [{ ...noodleLine, quantity: 0 }] }),
      raw({ v: 1, savedAt: NOW, lines: [{ ...noodleLine, quantity: 51 }] }), raw({ v: 1, savedAt: NOW, lines: [{ ...noodleLine, price: 1 }] }),
      raw({ v: 1, savedAt: NOW, lines: [{ ...noodleLine, note: "x".repeat(201) }] }), raw({ v: 1, savedAt: NOW, lines: [{ ...noodleLine, name: "<script>".repeat(30) }] })]) {
      expect(parseSavedOrder(bad as string | null, NOW), String(bad).slice(0, 60)).toBeNull();
    }
  });

  it("forgets an order older than 90 days, or one dated in the future", () => {
    expect(parseSavedOrder(raw({ ...saved([noodleLine]), savedAt: NOW - REORDER_MAX_AGE_MS + 1000 }), NOW)).not.toBeNull();
    expect(parseSavedOrder(raw({ ...saved([noodleLine]), savedAt: NOW - REORDER_MAX_AGE_MS - 1000 }), NOW)).toBeNull();
    expect(parseSavedOrder(raw({ ...saved([noodleLine]), savedAt: NOW + 10 * 60_000 }), NOW)).toBeNull();
  });
});

describe("putting a remembered order back using today's menu", () => {
  it("restores every line when nothing has changed", () => {
    const r = reorderLines(saved([noodleLine, teaLine]), menu());
    expect(r.dropped).toEqual([]);
    expect(r.lines).toEqual([{ itemId: noodle, quantity: 2, optionIds: [chicken], note: "no peanuts" }, { itemId: tea, quantity: 1, optionIds: [], note: "" }]);
  });

  it("drops, and names, a dish that is sold out or gone, and keeps the rest", () => {
    expect(reorderLines(saved([noodleLine, teaLine]), menu({ [noodle]: { available: false } }))).toEqual({ lines: [{ itemId: tea, quantity: 1, optionIds: [], note: "" }], dropped: ["Noodle bowl"] });
    const removed = menu(); removed.delete(noodle);
    expect(reorderLines(saved([noodleLine, teaLine]), removed).dropped).toEqual(["Noodle bowl"]);
  });

  it("drops a line whose choice is gone or sold out", () => {
    const soldOut = menu({ [noodle]: { modifierGroups: [{ id: id(100), minChoices: 1, maxChoices: 1, options: [{ id: chicken, available: false }, { id: tofu, available: true }] }] } });
    expect(reorderLines(saved([noodleLine]), soldOut)).toEqual({ lines: [], dropped: ["Noodle bowl"] });
    const gone = menu({ [noodle]: { modifierGroups: [{ id: id(100), minChoices: 1, maxChoices: 1, options: [{ id: tofu, available: true }] }] } });
    expect(reorderLines(saved([noodleLine]), gone).dropped).toEqual(["Noodle bowl"]);
  });

  it("drops a line when the dish's choice rules changed so the old choices no longer fit", () => {
    // a new required group appeared that the old order never chose from
    const newRequired = menu({ [tea]: { modifierGroups: [{ id: id(101), minChoices: 1, maxChoices: 1, options: [{ id: ice, available: true }] }] } });
    expect(reorderLines(saved([teaLine]), newRequired).dropped).toEqual(["Iced tea"]);
    // fewer choices allowed than before
    const two = { ...noodleLine, optionIds: [chicken, tofu] };
    expect(reorderLines(saved([two]), menu()).dropped).toEqual(["Noodle bowl"]);
  });

  it("never carries a duplicated or foreign choice id into the cart", () => {
    expect(reorderLines(saved([{ ...noodleLine, optionIds: [chicken, chicken] }]), menu()).lines).toEqual([]);
    expect(reorderLines(saved([{ ...noodleLine, optionIds: [id(999)] }]), menu()).lines).toEqual([]);
  });
});
