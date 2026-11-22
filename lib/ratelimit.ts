import crypto from "node:crypto";
import { pool } from "./db";

// Fixed-window limiter stored in Postgres, so it holds across server processes and restarts.
// Each call counts one hit in the current window and returns false once the limit is passed.
// A burst can reach up to twice the limit across a window boundary; that is acceptable for abuse protection.

const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const expiresAt = new Date(windowStart.getTime() + windowMs);
  const result = await pool.query(
    `insert into rate_limits (key_hash, window_start, expires_at) values ($1, $2, $3)
     on conflict (key_hash, window_start) do update set hits = rate_limits.hits + 1
     returning hits`,
    [hashKey(key), windowStart, expiresAt],
  );
  return (result.rows[0].hits as number) <= limit;
}

/** Deletes finished windows. Called by the every-minute scheduler. Returns how many rows went. */
export async function pruneRateLimits(): Promise<number> {
  const result = await pool.query("delete from rate_limits where expires_at < now()");
  return result.rowCount ?? 0;
}

/**
 * The caller's IP from the first X-Forwarded-For entry. Only trustworthy behind a proxy that
 * overwrites this header (most hosts do); otherwise clients can set it and dodge per-IP limits.
 */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
