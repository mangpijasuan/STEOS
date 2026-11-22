import { consumeLoginToken, sessionCookie } from "@/lib/auth";
import { handle } from "@/lib/http";

// Note: email scanners that pre-open links can spend a one-time token. If that happens in the pilot,
// change this to a confirmation page with a button that POSTs the token.
export const GET = handle(async (req) => {
  const base = process.env.APP_URL ?? new URL(req.url).origin;
  const token = new URL(req.url).searchParams.get("token");
  const session = token ? await consumeLoginToken(token) : null;
  if (!session) {
    return new Response(null, { status: 302, headers: { Location: `${base}/login?error=expired` } });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${base}/dashboard`,
      "Set-Cookie": sessionCookie(session.sessionToken, session.expiresAt),
    },
  });
});
