import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../lib/db";
import { brandCss, completeMode, contrast, hasBranding, inkOn, parseBranding } from "../lib/restaurant-branding";
import { toPublicStore, loadStore } from "../lib/storefront";
import { zogamBranding } from "../scripts/fixtures/zogam-cafe";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

describe("parsing stored branding", () => {
  it("treats nothing, an empty object and garbage as the default look", () => {
    expect(parseBranding(undefined)).toEqual({});
    expect(parseBranding({})).toEqual({});
    expect(parseBranding("red")).toEqual({});
    expect(hasBranding(parseBranding({}))).toBe(false);
  });

  it("accepts a valid palette, logo and extras", () => {
    const parsed = parseBranding(zogamBranding);
    expect(parsed.colors?.light.brand).toBe("#17623b");
    expect(parsed.logo?.src).toBe("/brands/zogam-cafe-badge.png");
    expect(hasBranding(parsed)).toBe(true);
  });

  it("drops everything when any part is invalid, so a bad row cannot half-apply or inject styles", () => {
    expect(parseBranding({ colors: { light: { brand: "red" } } })).toEqual({});
    expect(parseBranding({ colors: { light: { brand: "#17623b);}body{display:none" } } })).toEqual({});
    expect(parseBranding({ logo: { src: "https://evil.example/x.png", alt: "x", width: 10, height: 10 } })).toEqual({});
    expect(parseBranding({ logo: { src: "/brands/../secret.png", alt: "x", width: 10, height: 10 } })).toEqual({});
    expect(parseBranding({ tagline: "ok", surprise: true })).toEqual({});
  });
});

describe("colors", () => {
  it("builds the scoped CSS from validated values, with a dark block", () => {
    const css = brandCss(parseBranding(zogamBranding))!;
    expect(css).toContain(".ds .rb-store{--brand:#17623b;--brand-hover:#10492c;--brand-ink:#ffffff;--brand-soft:#e7f1e9;--brand-soft-ink:#14532d;--bg:#faf8f5}");
    expect(css).toContain("@media (prefers-color-scheme: dark){.ds .rb-store{--brand:#8ed6a2;");
    expect(brandCss({})).toBeNull();
    expect(brandCss({ tagline: "Hello" })).toBeNull();
  });

  it("fills in the tokens a restaurant leaves out, and never overrides the ones it gives", () => {
    const light = completeMode({ brand: "#1d4ed8", soft: "#eef2ff" }, false);
    expect(light.soft).toBe("#eef2ff");
    expect(light.ink).toBe("#ffffff"); // white reads on a strong blue
    expect(light.hover).toMatch(/^#[0-9a-f]{6}$/);
    expect(light.bg).toBeUndefined();
  });

  it("derives a lighter dark palette from a light-only brand and keeps text readable on buttons", () => {
    const css = brandCss({ colors: { light: { brand: "#1d4ed8" } } })!;
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)/);
    for (const brand of ["#17623b", "#d4af37", "#1d4ed8", "#ffe14d", "#000000", "#ffffff"]) {
      expect(contrast(brand, inkOn(brand)), `text on ${brand}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("Zogam Cafe's data", () => {
  it("migration 0015 stores exactly the values in the fixture", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "db/migrations/0015_restaurant_branding.sql"), "utf8");
    const match = sql.match(/set branding = '(\{[\s\S]*?\})'::jsonb/);
    expect(match, "the Zogam backfill is in the migration").not.toBeNull();
    expect(JSON.parse(match![1])).toEqual(zogamBranding);
  });
});

describe("through the database and the public storefront", () => {
  let fixture: Fixture;
  let slug: string;

  beforeAll(async () => {
    fixture = await createFixture("branding");
    slug = (await asOwner((c) => c.query("select slug from restaurants where id = $1", [fixture.restaurantId]))).rows[0].slug;
  });
  afterAll(async () => {
    await deleteFixture(fixture);
    await pool.end();
  });

  it("is the default look until branding is set", async () => {
    const store = await loadStore(slug);
    expect(store.restaurant.branding).toEqual({});
    expect(toPublicStore(store).restaurant.branding).toEqual({});
  });

  it("serves a restaurant's branding to its storefront", async () => {
    await asOwner((c) => c.query("update restaurants set branding = $2 where id = $1", [fixture.restaurantId, JSON.stringify({ colors: { light: { brand: "#1d4ed8" } }, tagline: "Fresh daily", search: true })]));
    const branding = toPublicStore(await loadStore(slug)).restaurant.branding;
    expect(branding.tagline).toBe("Fresh daily");
    expect(branding.search).toBe(true);
    expect(branding.colors?.light.brand).toBe("#1d4ed8");
  });

  it("ignores branding that does not validate instead of failing the storefront", async () => {
    await asOwner((c) => c.query("update restaurants set branding = $2 where id = $1", [fixture.restaurantId, JSON.stringify({ colors: { light: { brand: "javascript:alert(1)" } } })]));
    expect(toPublicStore(await loadStore(slug)).restaurant.branding).toEqual({});
  });
});
