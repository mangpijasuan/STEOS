import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { z } from "zod";
import { MAX_IMAGE_BYTES, sniffImageType } from "../lib/images";
import { zogamBranding, zogamMenu } from "./fixtures/zogam-cafe";

const photoFilename = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}.jpg`;

async function main() {
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  if (!ownerUrl) throw new Error("DATABASE_OWNER_URL is required.");
  const ownerEmail = z.email().parse(process.env.ZOGAM_OWNER_EMAIL?.trim().toLowerCase());
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();

  try {
    await client.query("begin");
    const tenant = await client.query<{ id: string }>(
      `insert into restaurants (name, slug, accepting_orders, branding)
       values ('Zogam Cafe', 'zogam-cafe', false, $1)
       on conflict (slug) do nothing
       returning id`,
      [JSON.stringify(zogamBranding)],
    );
    const restaurantId = tenant.rows[0]?.id;
    if (!restaurantId) {
      await client.query("commit");
      console.log("Zogam Cafe already exists. Manage its current menu in /menu.");
      return;
    }

    const photoDir = process.env.ZOGAM_PHOTO_DIR;
    const photoFiles = new Set(photoDir ? await readdir(photoDir) : []);

    await client.query(
      "insert into staff_users (restaurant_id, email, name, role) values ($1, $2, 'Zogam Cafe Owner', 'owner')",
      [restaurantId, ownerEmail],
    );

    let imported = 0;
    let photosImported = 0;
    const pending = [];
    for (const [categoryOrder, [categoryName, items]] of Object.entries(zogamMenu).entries()) {
      const category = await client.query<{ id: string }>(
        "insert into menu_categories (restaurant_id, name, sort_order) values ($1, $2, $3) returning id",
        [restaurantId, categoryName, categoryOrder],
      );
      for (const [itemOrder, [name, description, priceCents, choices, ownerReview]] of items.entries()) {
        if (ownerReview) pending.push(`${name} — ${ownerReview}`);
        if (priceCents === null) continue;

        const filename = photoFilename(name);
        let imageId: string | null = null;
        if (photoDir && photoFiles.has(filename)) {
          const bytes = await readFile(join(photoDir, filename));
          const imageType = sniffImageType(bytes);
          if (imageType !== "image/jpeg" || bytes.byteLength > MAX_IMAGE_BYTES) {
            throw new Error(`${filename} must be a JPEG of at most 1.5 MB.`);
          }
          const image = await client.query<{ id: string }>(
            "insert into images (restaurant_id, content_type, data) values ($1, $2, $3) returning id",
            [restaurantId, imageType, bytes],
          );
          imageId = image.rows[0].id;
          photosImported++;
        }

        const item = await client.query<{ id: string }>(
          `insert into menu_items (restaurant_id, category_id, name, description, price_cents, sort_order, image_id)
           values ($1, $2, $3, $4, $5, $6, $7)
           returning id`,
          [restaurantId, category.rows[0].id, name, description, priceCents, itemOrder, imageId],
        );
        for (const [groupOrder, [groupName, options]] of (choices ?? []).entries()) {
          const group = await client.query<{ id: string }>(
            `insert into modifier_groups (restaurant_id, item_id, name, min_choices, max_choices, sort_order)
             values ($1, $2, $3, 1, 1, $4)
             returning id`,
            [restaurantId, item.rows[0].id, groupName, groupOrder],
          );
          for (const [optionOrder, [optionName, delta]] of options.entries()) {
            await client.query(
              `insert into modifier_options (restaurant_id, group_id, name, price_delta_cents, sort_order)
               values ($1, $2, $3, $4, $5)`,
              [restaurantId, group.rows[0].id, optionName, delta, optionOrder],
            );
          }
        }
        imported++;
      }
    }

    await client.query("commit");
    console.log(`Imported ${imported} items and ${photosImported} photos for /r/zogam-cafe. Online ordering is paused.`);
    console.log("Review the printed menu prices and choices in /menu before opening online ordering.");
    for (const note of pending) console.log(note);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
