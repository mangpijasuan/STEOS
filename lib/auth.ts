import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { staffUsers } from "../db/schema";
import { pool, withTenant } from "./db";
import { alert } from "./alerts";
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

/** Emails a one-time login link to the confirmation page. Unknown addresses do nothing, so callers cannot probe for accounts. */
export async function requestLogin(email: string): Promise<void> {
  const found = await pool.query("select id, restaurant_id from auth_find_staff($1)", [email]);
  const staff = found.rows[0];
  if (!staff) return;
  const token = newToken();
  await pool.query(
    "insert into login_tokens (token_hash, staff_user_id, restaurant_id, expires_at) values ($1, $2, $3, $4)",
    [hashToken(token), staff.id, staff.restaurant_id, new Date(Date.now() + LOGIN_TTL_MS)],
  );
  try {
    await sendLoginEmail(email, `${appUrl()}/login/confirm?token=${token}`);
  } catch (error) {
    // Log and carry on: an error response here would reveal that the address has an account.
    await alert("login-email", "A sign-in email could not be sent", { staffUserId: staff.id, error });
  }
}

/** Spends a login token (single use) and opens a session. Returns null if the token is bad, used or expired. */
export async function consumeLoginToken(token: string): Promise<{ sessionToken: string; expiresAt: Date } | null> {
  const spent = await pool.query(
    "update login_tokens set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning staff_user_id, restaurant_id",
    [hashToken(token)],
  );
  const row = spent.rows[0];
  if (!row) return null;

  const staff = await withTenant(row.restaurant_id, (db) =>
    db.select({ active: staffUsers.active }).from(staffUsers).where(eq(staffUsers.id, row.staff_user_id)),
  );
  if (!staff[0]?.active) return null;

  const sessionToken = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query("insert into sessions (token_hash, staff_user_id, restaurant_id, expires_at) values ($1, $2, $3, $4)", [
    hashToken(sessionToken),
    row.staff_user_id,
    row.restaurant_id,
    expiresAt,
  ]);
  return { sessionToken, expiresAt };
}

export async function staffFromSessionToken(token: string): Promise<StaffContext | null> {
  const session = await pool.query(
    "select staff_user_id, restaurant_id from sessions where token_hash = $1 and expires_at > now()",
    [hashToken(token)],
  );
  const row = session.rows[0];
  if (!row) return null;
  const staff = await withTenant(row.restaurant_id, (db) =>
    db.select().from(staffUsers).where(eq(staffUsers.id, row.staff_user_id)),
  );
  const user = staff[0];
  if (!user || !user.active) return null;
  return {
    staffUserId: user.id,
    restaurantId: user.restaurantId,
    role: user.role as Role,
    email: user.email,
    name: user.name,
  };
}

export async function destroySession(token: string): Promise<void> {
  await pool.query("delete from sessions where token_hash = $1", [hashToken(token)]);
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
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
