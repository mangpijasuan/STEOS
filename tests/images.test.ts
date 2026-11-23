import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, consumeLoginToken, requestLogin } from "../lib/auth";
import { pool } from "../lib/db";
import { MAX_IMAGE_BYTES, pruneOrphanImages, sniffImageType } from "../lib/images";
import { outbox } from "../lib/mailer";
import { POST as upload } from "../app/api/staff/images/route";
import { GET as serve } from "../app/api/images/[id]/route";
import { PUT as updateItem } from "../app/api/staff/menu/items/[id]/route";
import { GET as publicMenu } from "../app/api/r/[slug]/menu/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

let a: Fixture;
let b: Fixture;
let ownerToken: string;
let staffToken: string;
let otherOwnerToken: string;
let slugA: string;

async function signIn(email: string): Promise<string> {
  outbox.length = 0;
  await requestLogin(email);
  const token = new URL(outbox[0].url).searchParams.get("token")!;
  return (await consumeLoginToken(token))!.sessionToken;
}

// Smallest valid-looking files: only the signature bytes matter to the server.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

const send = (token: string | null, body: Uint8Array | string | null, type = "image/png") =>
  upload(
    new Request("http://localhost/api/staff/images", {
      method: "POST",
      headers: { "content-type": type, ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) },
      body: body as BodyInit | null,
    }),
    {},
  );
const get = (id: string, headers: Record<string, string> = {}) =>
  serve(new Request(`http://localhost/api/images/${id}`, { headers }), { params: Promise.resolve({ id }) });
const putItem = (token: string, itemId: string, body: unknown) =>
  updateItem(
    new Request("http://localhost/x", { method: "PUT", headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: itemId }) },
  );

beforeAll(async () => {
  a = await createFixture("img-a");
  b = await createFixture("img-b");
  slugA = (await asOwner((c) => c.query("select slug from restaurants where id = $1", [a.restaurantId]))).rows[0].slug;
  ownerToken = await signIn(a.ownerEmail);
  staffToken = await signIn(a.staffEmail);
  otherOwnerToken = await signIn(b.ownerEmail);
});

afterAll(async () => {
  await deleteFixture(a);
  await deleteFixture(b);
  await pool.end();
});

describe("file type detection", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });
  it("rejects everything else, whatever the header says", () => {
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });
});

describe("uploading", () => {
  it("accepts a photo from the owner and serves it publicly with long caching", async () => {
    const res = await send(ownerToken, PNG);
    expect(res.status).toBe(201);
    const { id, url } = await res.json();
    expect(url).toBe(`/api/images/${id}`);

    const served = await get(id);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toContain("immutable");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(served.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);

    const again = await get(id, { "if-none-match": `"${id}"` });
    expect(again.status).toBe(304);
  });

  it("detects the real type even when the header lies", async () => {
    const res = await send(ownerToken, JPEG, "image/png");
    const { id } = await res.json();
    expect((await get(id)).headers.get("content-type")).toBe("image/jpeg");
  });

  it("refuses staff, signed-out visitors, and non-images", async () => {
    expect((await send(staffToken, PNG)).status).toBe(403);
    expect((await send(null, PNG)).status).toBe(401);
    expect((await send(ownerToken, "<svg xmlns='http://www.w3.org/2000/svg'></svg>", "image/svg+xml")).status).toBe(415);
    expect((await send(ownerToken, new Uint8Array([]))).status).toBe(400);
  });

  it("refuses files over the size limit", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    expect((await send(ownerToken, big)).status).toBe(413);
  });

  it("answers 404 for an unknown or malformed id", async () => {
    expect((await get("2f0c8a52-1b5e-4c1e-9a3e-1f0d3b1a2c4d")).status).toBe(404);
    expect((await get("not-a-uuid")).status).toBe(400);
  });
});

describe("attaching photos to menu items", () => {
  it("shows the photo on the public menu, and deletes the old photo when it is replaced", async () => {
    const first = (await (await send(ownerToken, PNG)).json()).id as string;
    const second = (await (await send(ownerToken, WEBP)).json()).id as string;

    expect((await putItem(ownerToken, a.itemId, { imageId: first })).status).toBe(200);
    const menu = await (await publicMenu(new Request("http://localhost/x"), { params: Promise.resolve({ slug: slugA }) })).json();
    expect(menu.categories[0].items[0].imageUrl).toBe(`/api/images/${first}`);

    expect((await putItem(ownerToken, a.itemId, { imageId: second })).status).toBe(200);
    expect((await get(first)).status).toBe(404);
    expect((await get(second)).status).toBe(200);

    expect((await putItem(ownerToken, a.itemId, { imageId: null })).status).toBe(200);
    expect((await get(second)).status).toBe(404);
  });

  it("keeps a shared photo until its last dish is detached", async () => {
    const photo = (await (await send(ownerToken, PNG)).json()).id as string;
    const second = await asOwner(async (client) => {
      const { rows } = await client.query(
        "insert into menu_items (restaurant_id, category_id, name, price_cents) values ($1, $2, 'Second dish', 1000) returning id",
        [a.restaurantId, a.categoryId],
      );
      return rows[0].id as string;
    });
    expect((await putItem(ownerToken, a.itemId, { imageId: photo })).status).toBe(200);
    expect((await putItem(ownerToken, second, { imageId: photo })).status).toBe(200);
    expect((await putItem(ownerToken, a.itemId, { imageId: null })).status).toBe(200);
    expect((await get(photo)).status).toBe(200);
    const saved = await asOwner((client) => client.query("select image_id from menu_items where id = $1", [second]));
    expect(saved.rows[0].image_id).toBe(photo);
    expect((await putItem(ownerToken, second, { imageId: null })).status).toBe(200);
    expect((await get(photo)).status).toBe(404);
  });

  it("will not attach another restaurant's photo", async () => {
    const theirs = (await (await send(otherOwnerToken, PNG)).json()).id as string;
    const res = await putItem(ownerToken, a.itemId, { imageId: theirs });
    expect(res.status).toBe(409);
    expect((await get(theirs)).status).toBe(200);
  });

  it("lets only the owning restaurant's rows see the table (row-level security)", async () => {
    const mine = (await (await send(ownerToken, PNG)).json()).id as string;
    const app = await pool.query("select count(*)::int as n from images");
    expect(app.rows[0].n).toBe(0); // no tenant set on a plain connection
    const owner = await asOwner((c) => c.query("select restaurant_id from images where id = $1", [mine]));
    expect(owner.rows[0].restaurant_id).toBe(a.restaurantId);
  });
});

describe("cleanup", () => {
  it("removes old unused photos and keeps used and recent ones", async () => {
    const used = (await (await send(ownerToken, PNG)).json()).id as string;
    await putItem(ownerToken, a.itemId, { imageId: used });
    const recent = (await (await send(ownerToken, PNG)).json()).id as string;
    const stale = (await (await send(ownerToken, PNG)).json()).id as string;
    await asOwner((c) => c.query("update images set created_at = now() - interval '3 hours' where id = any($1)", [[used, stale]]));

    expect(await pruneOrphanImages()).toBeGreaterThanOrEqual(1);
    expect((await get(stale)).status).toBe(404);
    expect((await get(used)).status).toBe(200);
    expect((await get(recent)).status).toBe(200);
  });
});
