// Seeds one demo restaurant with an owner and a small menu. Safe to run twice.
import crypto from "node:crypto";
import { Client } from "pg";

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) throw new Error("DATABASE_OWNER_URL is not set");
const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "owner@example.com";

/** Mon-Sat 11:00-21:00, Sun 12:00-20:00, for the restaurant's default location, if it has no hours yet. */
async function ensureHours(client: Client, restaurantId: string) {
  const loc = await client.query("select id from locations where restaurant_id = $1 and is_default", [restaurantId]);
  const locationId = loc.rows[0]?.id as string | undefined;
  if (!locationId) return;
  const have = await client.query("select 1 from business_hours where location_id = $1 limit 1", [locationId]);
  if (have.rowCount) return;
  for (let weekday = 0; weekday < 7; weekday++) {
    const [opens, closes] = weekday === 0 ? ["12:00", "20:00"] : ["11:00", "21:00"];
    await client.query(
      "insert into business_hours (restaurant_id, location_id, weekday, opens, closes) values ($1, $2, $3, $4, $5)",
      [restaurantId, locationId, weekday, opens, closes],
    );
  }
}

/** Two floors, twelve tables and two waiters, so the table board has something to show. Only adds what is missing. */
async function ensureTables(client: Client, restaurantId: string) {
  await client.query("update restaurants set dine_in_enabled = true where id = $1", [restaurantId]);
  for (const [email, name] of [["ahmed@example.com", "Ahmed K."], ["mike@example.com", "Mike R."]]) {
    await client.query(
      "insert into staff_users (restaurant_id, email, name, role) values ($1, $2, $3, 'staff') on conflict do nothing",
      [restaurantId, email, name],
    );
  }
  const staff = (await client.query("select id from staff_users where restaurant_id = $1 and role = 'staff' order by email", [restaurantId])).rows;
  const floors: Record<string, string> = {};
  for (const [i, name] of ["1st Floor", "2nd Floor"].entries()) {
    const row = await client.query(
      "insert into floors (restaurant_id, name, sort_order) values ($1, $2, $3) on conflict (restaurant_id, name) do update set name = excluded.name returning id",
      [restaurantId, name, i],
    );
    floors[name] = row.rows[0].id;
  }
  for (let n = 1; n <= 12; n++) {
    const label = String(n).padStart(2, "0");
    const floor = n <= 8 ? floors["1st Floor"] : floors["2nd Floor"];
    await client.query(
      `insert into dining_tables (restaurant_id, floor_id, label, seats, sort_order, qr_token, assigned_to)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (restaurant_id, label) do nothing`,
      [restaurantId, floor, label, n % 3 === 0 ? 6 : 4, n, crypto.randomBytes(24).toString("base64url"), staff.length ? staff[n % staff.length].id : null],
    );
  }
}

async function main() {
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const existing = await client.query("select id from restaurants where slug = 'demo-kitchen'");
    if (existing.rowCount) {
      await ensureHours(client, existing.rows[0].id);
      await ensureTables(client, existing.rows[0].id);
      console.log("Demo restaurant already exists; opening hours and tables ensured");
      return;
    }
    await client.query("begin");
    const restaurant = await client.query(
      "insert into restaurants (name, slug, tax_rate_bps) values ('Demo Kitchen', 'demo-kitchen', 875) returning id",
    );
    const restaurantId = restaurant.rows[0].id as string;
    await client.query("insert into staff_users (restaurant_id, email, name, role) values ($1, $2, 'Demo Owner', 'owner')", [
      restaurantId,
      ownerEmail,
    ]);

    const menu: Record<string, [string, string, number][]> = {
      Mains: [
        ["Chicken rice bowl", "Grilled chicken, jasmine rice, pickled vegetables", 1295],
        ["Vegetable noodles", "Stir-fried noodles with seasonal vegetables", 1150],
      ],
      Drinks: [
        ["Iced tea", "Fresh brewed, unsweetened", 350],
        ["Soda", "Cola, lemon-lime or root beer", 300],
      ],
    };
    let order = 0;
    for (const [categoryName, items] of Object.entries(menu)) {
      const category = await client.query(
        "insert into menu_categories (restaurant_id, name, sort_order) values ($1, $2, $3) returning id",
        [restaurantId, categoryName, order++],
      );
      let itemOrder = 0;
      for (const [name, description, priceCents] of items) {
        await client.query(
          "insert into menu_items (restaurant_id, category_id, name, description, price_cents, sort_order) values ($1, $2, $3, $4, $5, $6)",
          [restaurantId, category.rows[0].id, name, description, priceCents, itemOrder++],
        );
      }
    }
    await ensureHours(client, restaurantId);
    await ensureTables(client, restaurantId);
    await client.query("commit");
    console.log(`Seeded Demo Kitchen. Owner login email: ${ownerEmail}`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
