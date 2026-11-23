import { pool, withTenant } from "./db";
import { HttpError } from "./http";
import { allow } from "./ratelimit";
import { sql } from "drizzle-orm";

export const MAX_IMAGE_BYTES = 1_500_000;
const MAX_IMAGES_PER_RESTAURANT = 500;

type ImageType = "image/jpeg" | "image/png" | "image/webp";

/** Identifies the real file type from its first bytes. The Content-Type header is never trusted on its own. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // RIFF....WEBP
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** Reads a request body but stops, without buffering the rest, once it is larger than allowed. */
async function readLimited(req: Request, max: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) throw new HttpError(413, "That photo is too large. Photos are shrunk before upload; try another file.");
  if (!req.body) throw new HttpError(400, "No image received");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new HttpError(413, "That photo is too large. Photos are shrunk before upload; try another file.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Saves an uploaded photo for a restaurant and returns its id and public URL. */
export async function saveImage(restaurantId: string, req: Request): Promise<{ id: string; url: string }> {
  if (!(await allow(`upload:${restaurantId}`, 60, 60 * 60 * 1000))) throw new HttpError(429, "Too many uploads. Try again in a while.");
  const bytes = await readLimited(req, MAX_IMAGE_BYTES);
  if (bytes.byteLength === 0) throw new HttpError(400, "No image received");
  const type = sniffImageType(bytes);
  if (!type) throw new HttpError(415, "Use a JPEG, PNG or WebP photo");

  const id = await withTenant(restaurantId, async (db) => {
    const count = await db.execute(sql`select count(*)::int as n from images`);
    if ((count.rows[0] as { n: number }).n >= MAX_IMAGES_PER_RESTAURANT) {
      throw new HttpError(409, "This restaurant has reached its photo limit. Remove unused photos first.");
    }
    const row = await db.execute(
      sql`insert into images (restaurant_id, content_type, data) values (${restaurantId}, ${type}, ${Buffer.from(bytes)}) returning id`,
    );
    return (row.rows[0] as { id: string }).id;
  });
  return { id, url: imageUrl(id) };
}

export const imageUrl = (id: string) => `/api/images/${id}`;

export async function loadPublicImage(id: string): Promise<{ contentType: string; data: Buffer } | null> {
  const found = await pool.query("select content_type, data from public_image($1)", [id]);
  const row = found.rows[0];
  return row ? { contentType: row.content_type as string, data: row.data as Buffer } : null;
}

/** Deletes photos no item uses, once older than 60 minutes. */
export async function pruneOrphanImages(): Promise<number> {
  const res = await pool.query("select prune_orphan_images(60) as removed");
  return res.rows[0].removed as number;
}
