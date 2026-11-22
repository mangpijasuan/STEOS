import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { menuCategories, menuItems, restaurants, staffUsers } from "../db/schema";
import { pool, withTenant } from "../lib/db";
import { createFixture, deleteFixture, type Fixture } from "./helpers";

let a: Fixture;
let b: Fixture;

beforeAll(async () => {
  a = await createFixture("alpha");
  b = await createFixture("bravo");
});

afterAll(async () => {
  await deleteFixture(a);
  await deleteFixture(b);
  await pool.end();
});

describe("tenant isolation (row-level security)", () => {
  it("shows a restaurant only its own rows", async () => {
    const result = await withTenant(a.restaurantId, async (db) => ({
      restaurants: await db.select().from(restaurants),
      staff: await db.select().from(staffUsers),
      categories: await db.select().from(menuCategories),
      items: await db.select().from(menuItems),
    }));
    expect(result.restaurants.map((r) => r.id)).toEqual([a.restaurantId]);
    expect(result.staff.every((s) => s.restaurantId === a.restaurantId)).toBe(true);
    expect(result.categories.map((c) => c.id)).toEqual([a.categoryId]);
    expect(result.items.map((i) => i.id)).toEqual([a.itemId]);
  });

  it("cannot read another restaurant's row even by exact id", async () => {
    const rows = await withTenant(a.restaurantId, (db) => db.select().from(menuItems).where(eq(menuItems.id, b.itemId)));
    expect(rows).toHaveLength(0);
  });

  it("returns nothing when no restaurant is set", async () => {
    const { rows } = await pool.query("select id from menu_items");
    expect(rows).toHaveLength(0);
  });

  it("rejects writing a row that belongs to another restaurant", async () => {
    await expect(
      withTenant(a.restaurantId, (db) =>
        db.insert(menuCategories).values({ restaurantId: b.restaurantId, name: "Sneaky" }),
      ),
    ).rejects.toThrow();
  });

  it("rejects an item that points at another restaurant's category", async () => {
    await expect(
      withTenant(a.restaurantId, (db) =>
        db.insert(menuItems).values({ restaurantId: a.restaurantId, categoryId: b.categoryId, name: "Cross link", priceCents: 100 }),
      ),
    ).rejects.toThrow();
  });

  it("updates and deletes nothing in another restaurant", async () => {
    const updated = await withTenant(a.restaurantId, (db) =>
      db.update(menuItems).set({ name: "Hacked" }).where(eq(menuItems.id, b.itemId)).returning(),
    );
    const deleted = await withTenant(a.restaurantId, (db) =>
      db.delete(menuItems).where(and(eq(menuItems.id, b.itemId))).returning(),
    );
    expect(updated).toHaveLength(0);
    expect(deleted).toHaveLength(0);
    const still = await withTenant(b.restaurantId, (db) => db.select().from(menuItems).where(eq(menuItems.id, b.itemId)));
    expect(still[0]?.name).toBe("Test dish");
  });

  it("does not let the app role create restaurants", async () => {
    await expect(
      pool.query("insert into restaurants (name, slug) values ('Nope', 'nope-nope')"),
    ).rejects.toThrow(/permission denied/);
  });

  it("does not let a tenant setting leak into the next request", async () => {
    await withTenant(a.restaurantId, (db) => db.select().from(menuItems));
    const { rows } = await pool.query("select id from menu_items");
    expect(rows).toHaveLength(0);
  });
});
