import { describe, expect, it } from "vitest";
import { parseTableLabels } from "../lib/tableLabels";

describe("parseTableLabels", () => {
  it("expands ranges and lists", () => {
    expect(parseTableLabels("1-4")).toEqual({ labels: ["1", "2", "3", "4"] });
    expect(parseTableLabels("A1, A2\nPatio 1")).toEqual({ labels: ["A1", "A2", "Patio 1"] });
    expect(parseTableLabels("1-3, 10, B")).toEqual({ labels: ["1", "2", "3", "10", "B"] });
  });
  it("keeps leading zeros so labels print neatly", () => {
    expect(parseTableLabels("01-03")).toEqual({ labels: ["01", "02", "03"] });
    expect(parseTableLabels("08-11")).toEqual({ labels: ["08", "09", "10", "11"] });
  });
  it("treats hyphenated names that are not number ranges as names", () => {
    expect(parseTableLabels("A-1, T1-T5")).toEqual({ labels: ["A-1", "T1-T5"] });
  });
  it("removes duplicates, ignoring case", () => {
    expect(parseTableLabels("a, A, b")).toEqual({ labels: ["a", "b"] });
  });
  it("explains what is wrong", () => {
    expect(parseTableLabels("")).toHaveProperty("error");
    expect(parseTableLabels("5-2").error).toMatch(/backwards/);
    expect(parseTableLabels("1-500").error).toMatch(/up to 100/);
    expect(parseTableLabels("a/b").error).toMatch(/can't be a table name/);
    expect(parseTableLabels("this name is far too long").error).toMatch(/12 characters/);
  });
});
