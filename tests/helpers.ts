import crypto from "node:crypto";
import { Client } from "pg";
import { TEST_OWNER_URL } from "./config";

export type Fixture = {
  restaurantId: string;
  ownerEmail: string;
  staffEmail: string;
  categoryId: string;
  itemId: string;
};

/** Runs SQL as the table owner, which bypasses row-level security. Used only to build test data. */
export async function asOwner<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: TEST_OWNER_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function createFixture(label: string): Promise<Fixture> {
  const suffix = crypto.randomBytes(4).toString("hex");
  const slug = `${label}-${suffix}`;
  return asOwner(async (c) => {
    const r = await c.query("insert into restaurants (name, slug) values ($1, $2) returning id", [`Test ${label}`, slug]);
    const restaurantId = r.rows[0].id as string;
    const ownerEmail = `owner-${suffix}@example.com`;
    const staffEmail = `staff-${suffix}@example.com`;
    await c.query("insert into staff_users (restaurant_id, email, role) values ($1, $2, 'owner'), ($1, $3, 'staff')", [
      restaurantId,
      ownerEmail,
      staffEmail,
    ]);
    const cat = await c.query("insert into menu_categories (restaurant_id, name) values ($1, 'Mains') returning id", [restaurantId]);
    const item = await c.query(
      "insert into menu_items (restaurant_id, category_id, name, price_cents) values ($1, $2, 'Test dish', 1000) returning id",
      [restaurantId, cat.rows[0].id],
    );
    return { restaurantId, ownerEmail, staffEmail, categoryId: cat.rows[0].id, itemId: item.rows[0].id };
  });
}

export async function deleteFixture(f: Fixture): Promise<void> {
  await asOwner((c) => c.query("delete from restaurants where id = $1", [f.restaurantId]));
}
