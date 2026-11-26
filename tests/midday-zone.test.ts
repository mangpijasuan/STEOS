import { describe, expect, it } from "vitest";
import { middayZone } from "./helpers";

describe("middayZone", () => {
  it("is a valid zone where it is about midday, whatever the UTC time", () => {
    for (let hour = 0; hour < 24; hour++) {
      const now = new Date(Date.UTC(2026, 10, 24, hour, 30));
      const zone = middayZone(now);
      const local = Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(now));
      expect(Math.abs(local - 12), `${zone} at ${hour}:30 UTC is ${local}:30 local`).toBeLessThanOrEqual(1);
    }
  });
});
