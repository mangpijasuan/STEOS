import { describe, expect, it } from "vitest";
import { asapPickup, type Store } from "../lib/storefront";
import { computeSlots, isOpenNow, zonedTimeToUtc } from "../lib/hours";

const TZ = "America/Chicago";
const daily = (opens: string, closes: string) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens, closes }));

describe("hours", () => {
  it("converts wall-clock time to UTC in winter and summer", () => {
    expect(zonedTimeToUtc(2026, 1, 15, 12, 0, TZ).toISOString()).toBe("2026-01-15T18:00:00.000Z");
    expect(zonedTimeToUtc(2026, 7, 15, 12, 0, TZ).toISOString()).toBe("2026-07-15T17:00:00.000Z");
  });

  it("handles the daylight saving change day", () => {
    // US clocks spring forward on 2026-03-08: 11:00 local is CDT (UTC-5)
    expect(zonedTimeToUtc(2026, 3, 8, 11, 0, TZ).toISOString()).toBe("2026-03-08T16:00:00.000Z");
  });

  it("skips nonexistent spring times and offers both real fall times in chronological order", () => {
    const periods = [{ weekday: 0, opens: "01:00", closes: "04:00" }];
    const options = { timeZone: "America/New_York", periods, minPrepMinutes: 5, maxAdvanceDays: 0 };
    const spring = computeSlots({ ...options, now: new Date("2026-03-08T05:00:00Z") });
    expect(spring).toHaveLength(8);
    expect(new Set(spring.map(Number)).size).toBe(8);
    const fall = computeSlots({ ...options, now: new Date("2026-11-01T04:00:00Z") });
    expect(fall).toHaveLength(16);
    expect(fall.map(Number)).toEqual(fall.map(Number).sort((a, b) => a - b));
    expect(fall).toContainEqual(new Date("2026-11-01T05:30:00Z"));
    expect(fall).toContainEqual(new Date("2026-11-01T06:30:00Z"));
  });

  it("offers ASAP pickup only within the current opening period", () => {
    const store: Store = {
      restaurant: {
        id: "test", name: "Test", slug: "test", timezone: TZ, taxRateBps: 0, status: "active",
        minPrepMinutes: 20, maxAdvanceDays: 2, acceptingOrders: true, defaultLocationId: null,
      },
      periods: daily("11:00", "21:00"),
      menu: [],
    };
    expect(asapPickup(store, new Date("2026-11-21T02:48:00Z"))).toBeNull();
    expect(asapPickup(store, new Date("2026-11-20T18:00:00Z"))).toEqual(new Date("2026-11-20T18:30:00Z"));
  });

  it("knows when the restaurant is open", () => {
    const periods = daily("11:00", "21:00");
    expect(isOpenNow(new Date("2026-11-20T18:00:00Z"), TZ, periods)).toBe(true); // 12:00 local
    expect(isOpenNow(new Date("2026-11-20T16:59:00Z"), TZ, periods)).toBe(false); // 10:59 local
    expect(isOpenNow(new Date("2026-11-21T03:00:00Z"), TZ, periods)).toBe(false); // 21:00 local, closed
  });

  it("offers 15-minute slots after the prep time, ending 15 minutes before close", () => {
    const now = new Date("2026-11-20T18:00:00Z"); // Friday 12:00 local
    const slots = computeSlots({ now, timeZone: TZ, periods: daily("11:00", "21:00"), minPrepMinutes: 20, maxAdvanceDays: 0 });
    expect(slots[0].toISOString()).toBe("2026-11-20T18:30:00.000Z"); // 12:30 local
    expect(slots[slots.length - 1].toISOString()).toBe("2026-11-21T02:45:00.000Z"); // 20:45 local
  });

  it("includes following days up to the advance limit", () => {
    const now = new Date("2026-11-20T18:00:00Z");
    const one = computeSlots({ now, timeZone: TZ, periods: daily("11:00", "21:00"), minPrepMinutes: 20, maxAdvanceDays: 0 });
    const three = computeSlots({ now, timeZone: TZ, periods: daily("11:00", "21:00"), minPrepMinutes: 20, maxAdvanceDays: 2 });
    expect(three.length).toBeGreaterThan(one.length);
  });

  it("returns nothing for a restaurant with no hours", () => {
    expect(computeSlots({ now: new Date(), timeZone: TZ, periods: [], minPrepMinutes: 20, maxAdvanceDays: 2 })).toEqual([]);
  });
});
