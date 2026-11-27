import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APPEARANCE_KEY, APPEARANCE_SCRIPT, nextAppearance, parseAppearance } from "../app/appearance";
import { contrast } from "../lib/restaurant-branding";

const css = fs.readFileSync(path.join(process.cwd(), "app/ds.css"), "utf8");

/** The --token: #hex declarations of the first rule whose selector contains `selector`. */
function tokens(selector: string): Record<string, string> {
  const at = css.indexOf(selector);
  expect(at, `${selector} is in ds.css`).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]));
}

describe("the Appearance choice", () => {
  it("steps through Match device, Light and Dark and starts over", () => {
    expect(nextAppearance("auto")).toBe("light");
    expect(nextAppearance("light")).toBe("dark");
    expect(nextAppearance("dark")).toBe("auto");
  });

  it("treats anything unknown as Match device", () => {
    expect(parseAppearance("dark")).toBe("dark");
    expect(parseAppearance("light")).toBe("light");
    for (const v of [null, undefined, "", "auto", "blue", 3]) expect(parseAppearance(v)).toBe("auto");
  });

  it("has a head script that applies only a valid saved choice before the page paints", () => {
    expect(APPEARANCE_KEY).toBe("steos:appearance");
    expect(APPEARANCE_SCRIPT).toContain(JSON.stringify(APPEARANCE_KEY));
    const run = (stored: string | null) => {
      const root: { dataset: Record<string, string> } = { dataset: {} };
      new Function("localStorage", "document", APPEARANCE_SCRIPT)({ getItem: () => stored }, { documentElement: root });
      return root.dataset.appearance;
    };
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
    expect(run("auto")).toBeUndefined();
    expect(run("<script>")).toBeUndefined();
    expect(run(null)).toBeUndefined();
    // storage that throws (private browsing) must not break the page
    expect(() => new Function("localStorage", "document", APPEARANCE_SCRIPT)({ getItem: () => { throw new Error("blocked"); } }, { documentElement: { dataset: {} } })).not.toThrow();
  });
});

describe("the platform's dark theme (midnight navy and gold)", () => {
  const dark = tokens('.ds[data-brand="platform"][data-theme="dark"]');

  it("is the same whether the device is dark, or Dark was chosen, or it is the kitchen", () => {
    const media = tokens('.ds[data-brand="platform"]:where(:not([data-theme="light"], :root[data-appearance="light"] .ds))');
    expect(media).toEqual(dark);
    expect(css).toContain(':root[data-appearance="dark"] .ds[data-brand="platform"]:not([data-theme="light"])');
    expect(dark.bg).toBe("#0a111f");
    expect(dark.brand).toBe("#d4af37");
  });

  it("keeps every text color readable on the surfaces it sits on (WCAG AA, 4.5:1)", () => {
    for (const surface of ["bg", "surface", "surface-2"]) {
      for (const text of ["text", "text-2", "text-3", "brand"]) {
        expect(contrast(dark[text], dark[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(dark["text-2"], dark["surface-3"]), "text-2 on surface-3").toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["brand-ink"], dark.brand), "text on a gold button").toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["brand-ink"], dark["brand-hover"]), "text on a hovered gold button").toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark["brand-soft-ink"], dark["brand-soft"]), "text on the soft gold tint").toBeGreaterThanOrEqual(4.5);
  });

  it("separates cards from the page and from each other (visible borders)", () => {
    expect(contrast(dark["border-strong"], dark.surface)).toBeGreaterThanOrEqual(1.5);
    expect(contrast(dark.surface, dark.bg)).toBeGreaterThanOrEqual(1.05);
  });
});
