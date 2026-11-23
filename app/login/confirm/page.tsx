import type { Metadata } from "next";
import { Icon } from "../../icons";

// The emailed sign-in link opens this page. Opening it does nothing; only pressing the button
// signs in. Email security scanners often open links before the person does, and with a plain
// link they would use up the one-time token.
// "same-origin" keeps the token out of referrers to other sites. Not "no-referrer": that makes browsers
// send `Origin: null` on the form post, which the verify route rejects.
export const metadata: Metadata = { title: "Sign in", referrer: "same-origin", robots: { index: false } };

export default async function ConfirmSignIn({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";

  return (
    <main className="auth-wrap">
      <div className="auth-card card stack" style={{ textAlign: "center", "--gap": "14px" } as React.CSSProperties}>
        <span className="logo" style={{ margin: "0 auto" }}>S</span>
        {value ? (
          <>
            <h1 style={{ fontSize: "1.6rem" }}>Finish signing in</h1>
            <p className="muted">Press the button to sign in on this device.</p>
            <form method="post" action="/api/auth/verify" className="stack">
              <input type="hidden" name="token" value={value} />
              <button type="submit" className="btn btn-primary btn-lg btn-block">
                <Icon name="check" size={20} /> Sign in
              </button>
            </form>
            <p className="subtle">The link works once and expires 15 minutes after it was sent.</p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: "1.6rem" }}>This link is incomplete</h1>
            <p className="muted">Copy the whole link from the email, or request a new one.</p>
            <a className="btn btn-primary btn-lg btn-block" href="/login">Request a new link</a>
          </>
        )}
      </div>
    </main>
  );
}
