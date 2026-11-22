import type { Metadata } from "next";

// The emailed sign-in link opens this page. Opening it does nothing; only pressing the button
// signs in. Email security scanners often open links before the person does, and with a plain
// link they would use up the one-time token.
// "same-origin" keeps the token out of referrers to other sites. Not "no-referrer": that makes browsers
// send `Origin: null` on the form post, which the verify route rejects.
export const metadata: Metadata = { title: "Sign in", referrer: "same-origin", robots: { index: false } };

export default async function ConfirmSignIn({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";

  if (!value) {
    return (
      <main>
        <h1>Staff sign in</h1>
        <p>This sign-in link is incomplete. Copy the whole link from the email, or request a new one.</p>
        <p>
          <a href="/login">Request a new link</a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Staff sign in</h1>
      <p>Press the button to finish signing in on this device.</p>
      <form method="post" action="/api/auth/verify">
        <input type="hidden" name="token" value={value} />
        <button type="submit" style={{ padding: "8px 16px" }}>
          Sign in
        </button>
      </form>
      <p style={{ color: "#666", fontSize: 14 }}>The link works once and expires 15 minutes after it was sent.</p>
    </main>
  );
}
