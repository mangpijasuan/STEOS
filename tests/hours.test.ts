import { describe, expect, it } from "vitest";
import { asapPickup, type Store } from "../lib/storefront";
import { computeSlots, isOpenNow, isValidClosing, MIDNIGHT, zonedTimeToUtc } from "../lib/hours";

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
        minPrepMinutes: 20, maxAdvanceDays: 2, acceptingOrders: true, defaultLocationId: null, branding: {},
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

describe("closing at midnight (24:00)", () => {
  // 2026-11-20 is a Friday; Chicago is UTC-6 in November, so Friday 23:45 local is 2026-11-21T05:45Z.
  const friday = (hhmm: string) => new Date(`2026-11-21T${String(Number(hhmm.slice(0, 2)) + 6 - 24).padStart(2, "0")}:${hhmm.slice(3)}:00Z`);

  it("accepts 24:00 only as a closing time", () => {
    expect(MIDNIGHT).toBe("24:00");
    expect(isValidClosing("24:00")).toBe(true);
    expect(isValidClosing("23:59")).toBe(true);
    expect(isValidClosing("24:01")).toBe(false);
    expect(isValidClosing("25:00")).toBe(false);
    expect(isValidClosing("")).toBe(false);
  });

  it("is open to the last minute of the day and closed once the next day begins", () => {
    const periods = [{ weekday: 5, opens: "11:00", closes: "24:00" }];
    expect(isOpenNow(friday("23:59"), TZ, periods)).toBe(true);
    expect(isOpenNow(friday("24:00"), TZ, periods)).toBe(false); // Saturday 00:00, which has no hours
  });

  it("offers the 23:30 and 23:45 pickup times that a 23:45 close leaves out", () => {
    const now = new Date("2026-11-21T05:20:00Z"); // Friday 23:20 local
    const options = { now, timeZone: TZ, minPrepMinutes: 10, maxAdvanceDays: 0 };
    const late = computeSlots({ ...options, periods: daily("11:00", "24:00") });
    expect(late.map((d) => d.toISOString())).toEqual(["2026-11-21T05:30:00.000Z", "2026-11-21T05:45:00.000Z"]);
    const early = computeSlots({ ...options, periods: daily("11:00", "23:45") });
    expect(early.map((d) => d.toISOString())).toEqual(["2026-11-21T05:30:00.000Z"]);
  });

  it("never offers a slot at midnight itself", () => {
    const slots = computeSlots({ now: new Date("2026-11-21T02:00:00Z"), timeZone: TZ, periods: daily("11:00", "24:00"), minPrepMinutes: 20, maxAdvanceDays: 0 });
    expect(slots[slots.length - 1].toISOString()).toBe("2026-11-21T05:45:00.000Z"); // Friday 23:45 local
  });

  it("works on the daylight saving days (a 23-hour and a 25-hour day)", () => {
    // Spring forward, Sunday 2026-03-08: after 02:00 Chicago is UTC-5, so 23:45 local is 04:45Z the next day.
    const spring = computeSlots({ now: new Date("2026-03-09T01:00:00Z"), timeZone: TZ, periods: daily("11:00", "24:00"), minPrepMinutes: 20, maxAdvanceDays: 0 });
    expect(spring[spring.length - 1].toISOString()).toBe("2026-03-09T04:45:00.000Z");
    // Fall back, Sunday 2026-11-01: Chicago is UTC-6 again, so 23:45 local is 05:45Z the next day.
    const fall = computeSlots({ now: new Date("2026-11-02T02:00:00Z"), timeZone: TZ, periods: daily("11:00", "24:00"), minPrepMinutes: 20, maxAdvanceDays: 0 });
    expect(fall[fall.length - 1].toISOString()).toBe("2026-11-02T05:45:00.000Z");
  });

  it("lets a restaurant stay open past midnight with early hours on the next day", () => {
    const periods = [
      { weekday: 5, opens: "18:00", closes: "24:00" },
      { weekday: 6, opens: "00:00", closes: "02:00" },
    ];
    const slots = computeSlots({ now: new Date("2026-11-21T04:00:00Z"), timeZone: TZ, periods, minPrepMinutes: 10, maxAdvanceDays: 1 }); // Friday 22:00 local
    const iso = slots.map((d) => d.toISOString());
    expect(iso).toContain("2026-11-21T05:45:00.000Z"); // Friday 23:45
    expect(iso).toContain("2026-11-21T06:00:00.000Z"); // Saturday 00:00
    expect(iso[iso.length - 1]).toBe("2026-11-21T07:45:00.000Z"); // Saturday 01:45
    expect(iso).toEqual([...iso].sort());
  });
});
