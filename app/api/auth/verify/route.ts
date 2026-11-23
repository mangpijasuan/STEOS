import { consumeLoginToken, sessionCookie } from "@/lib/auth";
import { handle } from "@/lib/http";

const validToken = (token: unknown): token is string =>
  typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "origin",
};

export const GET = handle(async (req) => {
  const token = new URL(req.url).searchParams.get("token");
  if (!validToken(token)) return new Response(null, { status: 303, headers: { ...privateHeaders, Location: "/login?error=expired" } });
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Confirm staff sign-in</title></head>
<body><main><h1>Confirm staff sign-in</h1>
<form method="post" action="/api/auth/verify">
<input type="hidden" name="token" value="${token}">
<button type="submit">Sign in</button>
</form></main></body></html>`, {
    headers: {
      ...privateHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
    },
  });
});

export const POST = handle(async (req) => {
  const origin = req.headers.get("origin");
  const expectedOrigin = new URL(process.env.APP_URL ?? req.url).origin;
  if (origin && origin !== expectedOrigin) return new Response(null, { status: 403, headers: privateHeaders });
  const token = (await req.formData()).get("token");
  const session = validToken(token) ? await consumeLoginToken(token) : null;
  return new Response(null, {
    status: 303,
    headers: session
      ? { ...privateHeaders, Location: "/dashboard", "Set-Cookie": sessionCookie(session.sessionToken, session.expiresAt) }
      : { ...privateHeaders, Location: "/login?error=expired" },
  });
});
