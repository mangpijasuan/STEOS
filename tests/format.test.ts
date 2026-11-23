import { describe, expect, it } from "vitest";
import { money, moneyShort } from "../lib/format";

describe("money", () => {
  it("formats dollars and cents", () => {
    expect(money(0)).toBe("$0.00");
    expect(money(1188)).toBe("$11.88");
    expect(money(123456789)).toBe("$1,234,567.89");
  });
  it("puts the sign of a negative amount in front of the dollar sign", () => {
    expect(money(-2000)).toBe("-$20.00");
    expect(money(-5)).toBe("-$0.05");
    expect(moneyShort(-2000)).toBe("-$20");
    expect(moneyShort(-1188)).toBe("-$11.88");
  });
  it("keeps whole-dollar short labels short", () => {
    expect(moneyShort(1200)).toBe("$12");
    expect(moneyShort(1250)).toBe("$12.50");
  });
});
