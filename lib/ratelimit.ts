import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { pool } from "./db";

export function clientIdentity(req: Request): string {
  const header = process.env.TRUSTED_CLIENT_IP_HEADER;
  if (!header) return "shared";
  const value = req.headers.get(header)?.trim() ?? "";
  return isIP(value) ? value : "shared";
}

export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  const subject = createHash("sha256").update(key).digest("hex");
  const { rows } = await pool.query("select consume_request_budget($1, $2, $3) as allowed", [subject, limit, windowMs]);
  return rows[0].allowed;
}
