import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { MAX_IMAGE_BYTES, sniffImageType } from "../lib/images";
import { zogamMenu } from "./fixtures/zogam-cafe";

const filename = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "") + ".jpg";

async function main() {
  const dir = process.env.ZOGAM_PHOTO_DIR;
  const url = process.env.DATABASE_OWNER_URL;
  if (!dir || !url) throw new Error("Set ZOGAM_PHOTO_DIR and DATABASE_OWNER_URL.");
  const apply = process.argv.includes("--apply");
  const replace = process.argv.includes("--replace-existing");
  if (process.argv.slice(2).some(arg => !["--apply", "--replace-existing"].includes(arg))) {
    throw new Error("Unknown argument.");
  }
  const files = new Set(await readdir(dir));
  const photos = new Map<string, Buffer>();
  for (const items of Object.values(zogamMenu)) {
    for (const [name] of items) {
      const file = filename(name);
      if (!files.has(file)) continue;
      const bytes = await readFile(join(dir, file));
      if (sniffImageType(bytes) !== "image/jpeg" || bytes.length > MAX_IMAGE_BYTES) {
        throw new Error(file + " must be a JPEG of at most 1.5 MB.");
      }
      photos.set(name, bytes);
    }
  }
  if (!photos.size) throw new Error("No matching menu photos found.");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(apply ? "begin" : "begin read only");
    const tenant = await client.query<{ id: string }>(
      "select id from restaurants where slug = $1" + (apply ? " for update" : ""), ["zogam-cafe"]
    );
    const restaurantId = tenant.rows[0]?.id;
    if (!restaurantId) throw new Error("Zogam Cafe does not exist.");
    const pending: { id: string; name: string; bytes: Buffer }[] = [];
    for (const [category, items] of Object.entries(zogamMenu)) {
      for (const [name] of items) {
        const bytes = photos.get(name);
        if (!bytes) continue;
        const result = await client.query<{ id: string; image_id: string | null }>(
          `select i.id, i.image_id from menu_items i join menu_categories c
             on c.id = i.category_id and c.restaurant_id = i.restaurant_id
           where i.restaurant_id = $1 and i.name = $2 and c.name = $3` +
            (apply ? " for update of i" : ""), [restaurantId, name, category]
        );
        if (result.rows.length > 1) throw new Error("Ambiguous item: " + name);
        const item = result.rows[0];
        if (!item) { console.log("SKIP missing: " + name); continue; }
        if (item.image_id && !replace) { console.log("KEEP existing: " + name); continue; }
        pending.push({ id: item.id, name, bytes });
        console.log((item.image_id ? "REPLACE " : "ADD ") + name);
      }
    }
    const count = await client.query<{ n: number }>(
      "select count(*)::int as n from images where restaurant_id = $1", [restaurantId]
    );
    if (count.rows[0].n + pending.length > 500) throw new Error("Photo limit would be exceeded.");
    if (apply) {
      for (const item of pending) {
        const image = await client.query<{ id: string }>(
          "insert into images (restaurant_id, content_type, data) values ($1, 'image/jpeg', $2) returning id",
          [restaurantId, item.bytes]
        );
        await client.query("update menu_items set image_id = $1 where id = $2 and restaurant_id = $3",
          [image.rows[0].id, item.id, restaurantId]);
      }
    }
    await client.query("commit");
    console.log((apply ? "Saved " : "Dry run: would save ") + pending.length + " photos. Menu prices and ordering unchanged.");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
