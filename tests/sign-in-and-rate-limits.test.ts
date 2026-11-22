import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE, requestLogin, staffFromSessionToken } from "../lib/auth";
import { pool } from "../lib/db";
import { outbox } from "../lib/mailer";
import { allow, pruneRateLimits } from "../lib/ratelimit";
import { GET as verifyGet, POST as verifyPost } from "../app/api/auth/verify/route";
import { POST as loginRequestRoute } from "../app/api/auth/request/route";
import { asOwner, createFixture, deleteFixture, type Fixture } from "./helpers";

let f: Fixture;

async function emailedToken(email: string): Promise<{ url: URL; token: string }> {
  outbox.length = 0;
  await requestLogin(email);
  expect(outbox).toHaveLength(1);
  const url = new URL(outbox[0].url);
  return { url, token: url.searchParams.get("token")! };
}

const confirm = (token: string, origin: string | null = "http://localhost:3000") =>
  verifyPost(
    new Request("http://localhost:3000/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...(origin ? { origin } : {}) },
      body: new URLSearchParams({ token }).toString(),
    }),
    {},
  );

const sessionFrom = (res: Response) => {
  const cookie = res.headers.get("set-cookie") ?? "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
};

beforeAll(async () => {
  f = await createFixture("signin");
});

afterAll(async () => {
  await deleteFixture(f);
  await pool.end();
});

describe("sign-in confirmation page", () => {
  it("emails a link to the confirmation page, not straight to the session endpoint", async () => {
    const { url } = await emailedToken(f.ownerEmail);
    expect(url.pathname).toBe("/login/confirm");
  });

  it("opening an old-style link does not spend the token", async () => {
    const { token } = await emailedToken(f.ownerEmail);
    // What an email scanner does: follow the link with GET.
    const res = await verifyGet(new Request(`http://localhost:3000/api/auth/verify?token=${token}`), {});
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`http://localhost:3000/login/confirm?token=${token}`);
    expect(res.headers.get("set-cookie")).toBeNull();

    const signedIn = await confirm(token);
    expect(signedIn.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("pressing the button signs in once, and the link cannot be reused", async () => {
    const { token } = await emailedToken(f.staffEmail);
    const first = await confirm(token);
    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe("http://localhost:3000/dashboard");
    const session = sessionFrom(first);
    expect(session).not.toBeNull();
    expect((await staffFromSessionToken(session!))?.email).toBe(f.staffEmail);

    const second = await confirm(token);
    expect(second.headers.get("location")).toBe("http://localhost:3000/login?error=expired");
    expect(sessionFrom(second)).toBeNull();
  });

  it("refuses a post from another site and leaves the token usable", async () => {
    const { token } = await emailedToken(f.ownerEmail);
    const forged = await confirm(token, "https://evil.example");
    expect(forged.headers.get("location")).toBe("http://localhost:3000/login?error=expired");
    expect(sessionFrom(forged)).toBeNull();
    expect(sessionFrom(await confirm(token, "null"))).toBeNull();
    expect(sessionFrom(await confirm(token))).not.toBeNull();
  });

  it("rejects a missing or made-up token", async () => {
    expect(sessionFrom(await confirm(""))).toBeNull();
    expect(sessionFrom(await confirm("not-a-real-token"))).toBeNull();
  });
});

describe("database rate limits", () => {
  const freshKey = () => `test:${crypto.randomBytes(6).toString("hex")}`;

  it("allows up to the limit, then refuses", async () => {
    const key = freshKey();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await allow(key, 3, 60_000));
    expect(results).toEqual([true, true, true, false]);
    // Another key is counted separately.
    expect(await allow(freshKey(), 3, 60_000)).toBe(true);
  });

  it("counts correctly when hits arrive at the same time", async () => {
    const key = freshKey();
    const results = await Promise.all(Array.from({ length: 8 }, () => allow(key, 5, 60_000)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it("stores a hash, not the email or IP address", async () => {
    const key = `login:${crypto.randomBytes(4).toString("hex")}@example.com`;
    await allow(key, 5, 60_000);
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const rows = await asOwner((c) => c.query("select key_hash from rate_limits where key_hash = $1", [hash]));
    expect(rows.rowCount).toBe(1);
    const raw = await asOwner((c) => c.query("select 1 from rate_limits where key_hash like '%@%'"));
    expect(raw.rowCount).toBe(0);
  });

  it("prunes finished windows only", async () => {
    const live = freshKey();
    await allow(live, 5, 60_000);
    await asOwner((c) =>
      c.query("insert into rate_limits (key_hash, window_start, expires_at) values ('old', now() - interval '2 hours', now() - interval '1 hour')"),
    );
    expect(await pruneRateLimits()).toBeGreaterThanOrEqual(1);
    const left = await asOwner((c) => c.query("select key_hash from rate_limits where key_hash = 'old'"));
    expect(left.rowCount).toBe(0);
    const hash = crypto.createHash("sha256").update(live).digest("hex");
    const kept = await asOwner((c) => c.query("select 1 from rate_limits where key_hash = $1", [hash]));
    expect(kept.rowCount).toBe(1);
  });

  it("limits sign-in requests to 5 per email", async () => {
    const email = `limit-${crypto.randomBytes(4).toString("hex")}@example.com`;
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const res = await loginRequestRoute(
        new Request("http://localhost:3000/api/auth/request", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${i}.${Math.floor(Math.random() * 250)}` },
          body: JSON.stringify({ email }),
        }),
        {},
      );
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});
