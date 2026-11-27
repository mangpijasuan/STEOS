// Seeds a disposable database for the browser tests (e2e/*.spec.ts). Run against a throwaway database only: it deletes and
// recreates the two test restaurants. Uses the owner connection, like the other seed scripts.
//
// It creates:
//   e2e-kitchen  an ordinary restaurant: a menu (one dish with a required choice), open all day, QR tables, owner and staff
//   zogam-cafe   a minimal restaurant with Zogam Cafe's slug, so the branded storefront code path runs
// and writes a signed-in session for the owner and the staff member (as Playwright storage state) plus the ids and
// QR tokens the tests need to e2e/.auth/.
//
// Sessions are made with the same database functions the app's sign-in uses, so the tests exercise the real session code.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) throw new Error("DATABASE_OWNER_URL is not set");

const authDir = path.resolve(__dirname, ".auth");
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

/** Test restaurants are open 00:00 to 23:45, so put them in a fixed-offset zone where it is about midday right now. */
function middayZone(now = new Date()): string {
  let offset = 12 - now.getUTCHours();
  if (offset > 12) offset -= 24;
  if (offset < -12) offset += 24;
  return offset === 0 ? "Etc/UTC" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
}

async function createRestaurant(client: Client, name: string, slug: string, menu: Record<string, [string, number, string[]?][]>, dineIn: boolean) {
  const { rows: [restaurant] } = await client.query(
    `insert into restaurants (name, slug, timezone, tax_rate_bps, dine_in_enabled, pay_later_enabled, min_prep_minutes)
     values ($1, $2, $3, 875, $4, true, 10) returning id`,
    [name, slug, middayZone(), dineIn],
  );
  const restaurantId = restaurant.id as string;
  await client.query(
    `insert into business_hours (restaurant_id, location_id, weekday, opens, closes)
     select $1, l.id, d, '00:00', '23:45' from locations l, generate_series(0, 6) d where l.restaurant_id = $1 and l.is_default`,
    [restaurantId],
  );
  let categoryOrder = 0;
  for (const [categoryName, items] of Object.entries(menu)) {
    const { rows: [category] } = await client.query("insert into menu_categories (restaurant_id, name, sort_order) values ($1, $2, $3) returning id", [restaurantId, categoryName, categoryOrder++]);
    let itemOrder = 0;
    for (const [itemName, priceCents, protein] of items) {
      const { rows: [item] } = await client.query(
        "insert into menu_items (restaurant_id, category_id, name, description, price_cents, sort_order) values ($1, $2, $3, $4, $5, $6) returning id",
        [restaurantId, category.id, itemName, `${itemName}, made fresh`, priceCents, itemOrder++],
      );
      if (protein) {
        // A required single choice, like Zogam Cafe's protein choice.
        const { rows: [group] } = await client.query(
          "insert into modifier_groups (restaurant_id, item_id, name, min_choices, max_choices) values ($1, $2, 'Protein', 1, 1) returning id",
          [restaurantId, item.id],
        );
        let optionOrder = 0;
        for (const option of protein) {
          await client.query("insert into modifier_options (restaurant_id, group_id, name, sort_order) values ($1, $2, $3, $4)", [restaurantId, group.id, option, optionOrder++]);
        }
      }
    }
  }
  return restaurantId;
}

/** Signs a staff member in with the app's own database functions and returns Playwright storage state for the cookie. */
async function signIn(client: Client, email: string) {
  const loginToken = crypto.randomBytes(32).toString("base64url");
  const sessionToken = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const issued = await client.query("select auth_issue_login($1, $2, $3) as issued", [email, sha256(loginToken), expires]);
  if (!issued.rows[0].issued) throw new Error(`No staff account for ${email}`);
  const exchanged = await client.query("select auth_exchange_login($1, $2, $3) as issued", [sha256(loginToken), sha256(sessionToken), expires]);
  if (!exchanged.rows[0].issued) throw new Error(`Could not start a session for ${email}`);
  return {
    cookies: [{ name: "sr_session", value: sessionToken, domain: "localhost", path: "/", expires: Math.floor(expires.getTime() / 1000), httpOnly: true, secure: false, sameSite: "Lax" as const }],
    origins: [],
  };
}

async function main() {
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("delete from restaurants where slug in ('e2e-kitchen', 'zogam-cafe')");

    const kitchenId = await createRestaurant(
      client,
      "E2E Kitchen",
      "e2e-kitchen",
      {
        Mains: [
          ["Chicken rice bowl", 1295],
          ["Noodle bowl", 1095, ["Chicken", "Tofu", "Beef"]],
        ],
        Drinks: [["Iced tea", 350]],
      },
      true,
    );
    await createRestaurant(client, "Zogam Cafe", "zogam-cafe", { Appetizers: [["Thai Spring Rolls (3 pc)", 495]], Noodles: [["Pad Thai", 1095, ["Pork", "Chicken", "Tofu"]]] }, false);

    await client.query("insert into staff_users (restaurant_id, email, name, role) values ($1, 'owner@e2e.test', 'E2E Owner', 'owner'), ($1, 'staff@e2e.test', 'E2E Staff', 'staff')", [kitchenId]);
    await client.query(
      "insert into staff_users (restaurant_id, email, name, role) select id, 'owner@zogam-e2e.test', 'Zogam Owner', 'owner' from restaurants where slug = 'zogam-cafe'",
    );

    const tables: Record<string, string> = {};
    for (const label of ["1", "2", "3"]) {
      const qrToken = `e2e-table-${label}-${crypto.randomBytes(12).toString("base64url")}`;
      await client.query("insert into dining_tables (restaurant_id, label, seats, sort_order, qr_token) values ($1, $2, 4, $3, $4)", [kitchenId, label, Number(label), qrToken]);
      tables[label] = qrToken;
    }
    await client.query("commit");

    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, "owner.json"), JSON.stringify(await signIn(client, "owner@e2e.test")));
    fs.writeFileSync(path.join(authDir, "staff.json"), JSON.stringify(await signIn(client, "staff@e2e.test")));
    fs.writeFileSync(path.join(authDir, "zogam-owner.json"), JSON.stringify(await signIn(client, "owner@zogam-e2e.test")));
    fs.writeFileSync(path.join(authDir, "seed.json"), JSON.stringify({ tables }));
    console.log("E2E data seeded: e2e-kitchen (owner@e2e.test, staff@e2e.test, 3 tables) and zogam-cafe");
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
