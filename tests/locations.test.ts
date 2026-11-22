import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { locations } from "../db/schema";
import { pool, withTenant } from "../lib/db";
import { createFixture, deleteFixture, type Fixture } from "./helpers";

let a: Fixture;
let b: Fixture;

beforeAll(async () => {
  a = await createFixture("loc-a");
  b = await createFixture("loc-b");
});

afterAll(async () => {
  await deleteFixture(a);
  await deleteFixture(b);
  await pool.end();
});

describe("locations", () => {
  it("gives every new restaurant exactly one default location", async () => {
    const rows = await withTenant(a.restaurantId, (db) => db.select().from(locations));
    expect(rows).toHaveLength(1);
    expect(rows[0].isDefault).toBe(true);
    expect(rows[0].restaurantId).toBe(a.restaurantId);
  });

  it("only shows a restaurant its own locations", async () => {
    const rows = await withTenant(a.restaurantId, (db) => db.select().from(locations));
    expect(rows.every((l) => l.restaurantId === a.restaurantId)).toBe(true);
    const none = await pool.query("select id from locations");
    expect(none.rows).toHaveLength(0);
  });

  it("lets a restaurant add more branches", async () => {
    const created = await withTenant(a.restaurantId, (db) =>
      db.insert(locations).values({ restaurantId: a.restaurantId, name: "Second branch", city: "Tulsa" }).returning(),
    );
    expect(created[0].isDefault).toBe(false);
    const rows = await withTenant(a.restaurantId, (db) => db.select().from(locations));
    expect(rows).toHaveLength(2);
  });

  it("rejects a second default location", async () => {
    await expect(
      withTenant(a.restaurantId, (db) =>
        db.insert(locations).values({ restaurantId: a.restaurantId, name: "Another default", isDefault: true }),
      ),
    ).rejects.toThrow();
  });

  it("rejects creating a location for another restaurant", async () => {
    await expect(
      withTenant(a.restaurantId, (db) => db.insert(locations).values({ restaurantId: b.restaurantId, name: "Sneaky" })),
    ).rejects.toThrow();
  });

  it("cannot update another restaurant's location", async () => {
    const updated = await withTenant(a.restaurantId, (db) =>
      db.update(locations).set({ name: "Hacked" }).where(eq(locations.restaurantId, b.restaurantId)).returning(),
    );
    expect(updated).toHaveLength(0);
  });
});
