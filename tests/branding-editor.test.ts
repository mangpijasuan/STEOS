import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { pool } from "../lib/db";
import { outbox } from "../lib/mailer";
import { GET as getBranding, PUT as putBranding } from "../app/api/staff/branding/route";
import { GET as publicMenu } from "../app/api/r/[slug]/menu/route";
import { applyBrandingEdit, colorProblem, type BrandingEdit } from "../lib/restaurant-branding";
import { zogamBranding } from "../scripts/fixtures/zogam-cafe";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

const blank: BrandingEdit = { color: null, colorDark: null, tagline: null, search: false, featured: [] };

describe("applying an owner's edit", () => {
  it("builds branding from nothing and keeps only what was chosen", () => {
    expect(applyBrandingEdit({}, blank)).toEqual({});
    const next = applyBrandingEdit({}, { ...blank, color: "#1D4ED8", tagline: "Fresh daily", search: true, featured: ["Pad Thai", "Pad Thai", "Curry"] });
    expect(next).toEqual({ colors: { light: { brand: "#1d4ed8" } }, tagline: "Fresh daily", featured: ["Pad Thai", "Curry"], search: true });
  });

  it("always keeps the logo, which is a file the owner cannot change here", () => {
    const next = applyBrandingEdit(zogamBranding, blank);
    expect(next.logo).toEqual(zogamBranding.logo);
    expect(next.colors).toBeUndefined();
    expect(next.tagline).toBeUndefined();
  });

  it("keeps a hand-tuned palette when the owner did not change that color, and works out a changed one afresh", () => {
    const keep = applyBrandingEdit(zogamBranding, { ...blank, color: "#17623b", colorDark: "#8ed6a2", tagline: "New line" });
    expect(keep.colors).toEqual(zogamBranding.colors);
    const changed = applyBrandingEdit(zogamBranding, { ...blank, color: "#1d4ed8", colorDark: "#8ed6a2" });
    expect(changed.colors?.light).toEqual({ brand: "#1d4ed8" });
    expect(changed.colors?.dark).toEqual(zogamBranding.colors.dark);
    expect(applyBrandingEdit(zogamBranding, { ...blank, color: "#17623b" }).colors?.dark).toBeUndefined();
  });

  it("refuses colors that are hard to read", () => {
    expect(colorProblem({ color: "#ffe14d", colorDark: null })).toMatch(/too light/);
    expect(colorProblem({ color: "#1d4ed8", colorDark: "#1a1a1a" })).toMatch(/too dark/);
    expect(colorProblem({ color: "#17623b", colorDark: "#8ed6a2" })).toBeNull();
    expect(colorProblem({ color: null, colorDark: null })).toBeNull();
  });
});

describe("the owner's branding API", () => {
  let a: Fixture;
  let b: Fixture;
  let slugA: string;
  let ownerToken: string;
  let staffToken: string;

  async function signIn(email: string) {
    outbox.length = 0;
    await requestLogin(email);
    const token = new URL(outbox[0].url).searchParams.get("token")!;
    return (await consumeLoginToken(token))!.sessionToken;
  }
  const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
  const req = (method: string, token: string | null, body?: unknown) =>
    new Request("http://localhost/test", {
      method,
      headers: { "content-type": "application/json", ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const save = (token: string | null, edit: Partial<BrandingEdit>) => putBranding(req("PUT", token, { ...blank, ...edit }), ctx(""));

  beforeAll(async () => {
    a = await createFixture("brand-a");
    b = await createFixture("brand-b");
    slugA = (await asOwner((c) => c.query("select slug from restaurants where id = $1", [a.restaurantId]))).rows[0].slug;
    ownerToken = await signIn(a.ownerEmail);
    staffToken = await signIn(a.staffEmail);
  });
  afterAll(async () => {
    await deleteFixture(a);
    await deleteFixture(b);
    await pool.end();
  });

  it("is owner-only, and needs a sign-in", async () => {
    expect((await save(null, { color: "#1d4ed8" })).status).toBe(401);
    expect((await save(staffToken, { color: "#1d4ed8" })).status).toBe(403);
    expect((await getBranding(req("GET", staffToken), ctx(""))).status).toBe(403);
    expect((await getBranding(req("GET", null), ctx(""))).status).toBe(401);
  });

  it("saves the owner's choices and shows them on the public storefront", async () => {
    const res = await save(ownerToken, { color: "#1d4ed8", tagline: "Fresh daily", search: true, featured: ["Test dish"] });
    expect(res.status).toBe(200);
    expect((await (await getBranding(req("GET", ownerToken), ctx(""))).json()).tagline).toBe("Fresh daily");
    const store = await (await publicMenu(req("GET", null), ctx(slugA))).json();
    expect(store.restaurant.branding).toEqual({ colors: { light: { brand: "#1d4ed8" } }, tagline: "Fresh daily", featured: ["Test dish"], search: true });
  });

  it("rejects bad input and hard-to-read colors without changing anything", async () => {
    for (const edit of [{ color: "blue" }, { color: "#1d4ed8", colorDark: "#zzzzzz" }, { tagline: "x".repeat(121) }, { featured: Array.from({ length: 9 }, (_, i) => `Dish ${i}`) }]) {
      expect((await save(ownerToken, edit)).status).toBe(400);
    }
    const tooLight = await save(ownerToken, { color: "#ffe14d" });
    expect(tooLight.status).toBe(400);
    expect((await tooLight.json()).error).toMatch(/too light/);
    expect((await (await getBranding(req("GET", ownerToken), ctx(""))).json()).tagline).toBe("Fresh daily");
  });

  it("clears the look back to the default, and never touches another restaurant", async () => {
    await asOwner((c) => c.query("update restaurants set branding = $2 where id = $1", [b.restaurantId, JSON.stringify({ tagline: "Other place" })]));
    expect((await save(ownerToken, {})).status).toBe(200);
    expect(await (await getBranding(req("GET", ownerToken), ctx(""))).json()).toEqual({});
    const other = await asOwner((c) => c.query("select branding from restaurants where id = $1", [b.restaurantId]));
    expect(other.rows[0].branding).toEqual({ tagline: "Other place" });
  });
});
