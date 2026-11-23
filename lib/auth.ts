import crypto from "node:crypto";
import { pool } from "./db";
import { HttpError } from "./http";
import { sendLoginEmail } from "./mailer";

export const SESSION_COOKIE = "sr_session";
const LOGIN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Role = "owner" | "staff";
export type StaffContext = { staffUserId: string; restaurantId: string; role: Role; email: string; name: string };

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

/** Emails a one-time login link. Unknown addresses do nothing, so callers cannot probe for accounts. */
export async function requestLogin(email: string): Promise<void> {
  const token = newToken();
  const url = new URL("/api/auth/verify", appUrl());
  if (process.env.NODE_ENV === "production" && (!process.env.APP_URL || url.protocol !== "https:")) {
    throw new Error("Production sign-in requires an HTTPS APP_URL");
  }
  const { rows } = await pool.query("select auth_issue_login($1, $2, $3) as issued", [
    email, hashToken(token), new Date(Date.now() + LOGIN_TTL_MS),
  ]);
  if (!rows[0].issued) return;
  url.searchParams.set("token", token);
  await sendLoginEmail(email, url.toString());
}

/** Exchanges a single-use login token and creates a session atomically. */
export async function consumeLoginToken(token: string): Promise<{ sessionToken: string; expiresAt: Date } | null> {
  const sessionToken = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const { rows } = await pool.query("select auth_exchange_login($1, $2, $3) as issued", [
    hashToken(token), hashToken(sessionToken), expiresAt,
  ]);
  return rows[0].issued ? { sessionToken, expiresAt } : null;
}

export async function staffFromSessionToken(token: string): Promise<StaffContext | null> {
  const { rows: [staff] } = await pool.query("select * from auth_session_staff($1)", [hashToken(token)]);
  if (!staff) return null;
  return { staffUserId: staff.staff_user_id, restaurantId: staff.restaurant_id, role: staff.role, email: staff.email, name: staff.name };
}

export async function destroySession(token: string): Promise<void> {
  await pool.query("select auth_end_session($1)", [hashToken(token)]);
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try { return decodeURIComponent(rest.join("=")); } catch { return null; }
    }
  }
  return null;
}

export function sessionCookie(token: string, expiresAt: Date): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Returns the logged-in staff member or throws 401. Pass roles to restrict who may call the route. */
export async function requireStaff(req: Request, roles?: Role[]): Promise<StaffContext> {
  const token = readCookie(req, SESSION_COOKIE);
  const staff = token ? await staffFromSessionToken(token) : null;
  if (!staff) throw new HttpError(401, "Not signed in");
  if (roles && !roles.includes(staff.role)) throw new HttpError(403, "Not allowed for your role");
  return staff;
}
