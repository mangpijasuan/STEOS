import { describe, expect, it } from "vitest";
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
