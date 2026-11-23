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
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Confirm staff sign-in</title>
<style>
body{background:#faf7f3;color:#282521;font:1rem/1.5 system-ui,sans-serif;margin:0;padding:1rem;min-height:calc(100vh - 2rem);display:grid;place-items:center}
main{box-sizing:border-box;width:min(100%,26rem);padding:2rem;border:1px solid #e7ded4;border-radius:1rem;background:white;text-align:center}
h1{font-size:1.5rem;margin:0}
button{width:100%;padding:.75rem;border:0;border-radius:.5rem;background:#9a3b1b;color:white;font:inherit;font-weight:650;cursor:pointer}
button:focus-visible{outline:3px solid #9a3b1b;outline-offset:3px}
</style></head>
<body><main><h1>Confirm staff sign-in</h1>
<p>Press the button to sign in on this device.</p>
<form method="post" action="/api/auth/verify">
<input type="hidden" name="token" value="${token}">
<button type="submit">Sign in</button>
</form></main></body></html>`, {
    headers: {
      ...privateHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    },
  });
});

export const POST = handle(async (req) => {
  const origin = req.headers.get("origin");
  const expectedOrigin = new URL(process.env.APP_URL ?? req.url).origin;
  if (origin && origin !== expectedOrigin) return new Response(null, { status: 403, headers: privateHeaders });
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");
  const session = validToken(token) ? await consumeLoginToken(token) : null;
  return new Response(null, {
    status: 303,
    headers: session
      ? { ...privateHeaders, Location: "/dashboard", "Set-Cookie": sessionCookie(session.sessionToken, session.expiresAt) }
      : { ...privateHeaders, Location: "/login?error=expired" },
  });
});
