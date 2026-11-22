import { SESSION_COOKIE, clearedSessionCookie, destroySession, readCookie } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const POST = handle(async (req) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await destroySession(token);
  return json({ ok: true }, 200, { "Set-Cookie": clearedSessionCookie() });
});
