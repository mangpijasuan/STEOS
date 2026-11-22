import { consumeLoginToken, sessionCookie } from "@/lib/auth";
import { handle } from "@/lib/http";

const baseUrl = (req: Request) => process.env.APP_URL ?? new URL(req.url).origin;
const redirect = (location: string, headers: Record<string, string> = {}) =>
  // 303 so the browser follows a POST with a GET.
  new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store", ...headers } });

// Links emailed before the confirmation page existed point here. Send them to the page without
// spending the token, so an email scanner opening the link cannot use it up.
export const GET = handle(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return redirect(`${baseUrl(req)}/login/confirm?token=${encodeURIComponent(token)}`, { "Referrer-Policy": "same-origin" });
});

// The confirmation page's "Sign in" button posts the token here. Only this step spends it.
export const POST = handle(async (req) => {
  const base = baseUrl(req);
  // Refuse posts from other sites (and `Origin: null`, e.g. sandboxed frames), so nobody can sign a
  // visitor into the attacker's own account. A missing header (old browsers, curl) is allowed.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(base).origin) return redirect(`${base}/login?error=expired`);

  const form = await req.formData().catch(() => null);
  const token = form?.get("token");
  const session = typeof token === "string" && token ? await consumeLoginToken(token) : null;
  if (!session) return redirect(`${base}/login?error=expired`);
  return redirect(`${base}/dashboard`, { "Set-Cookie": sessionCookie(session.sessionToken, session.expiresAt) });
});
