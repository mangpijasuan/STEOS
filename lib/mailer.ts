// Login email delivery.
//   EMAIL_PROVIDER=resend   sends through Resend (needs RESEND_API_KEY and EMAIL_FROM).
//   EMAIL_PROVIDER=console  (default) prints the link and keeps it in `outbox` for tests. Refused in production.

export const outbox: { to: string; url: string }[] = [];

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export class EmailError extends Error {}

export async function sendLoginEmail(to: string, url: string): Promise<void> {
  const provider = process.env.EMAIL_PROVIDER ?? "console";
  if (provider === "resend") return sendWithResend(to, url);
  if (provider !== "console") throw new EmailError(`Unknown EMAIL_PROVIDER: ${provider}`);
  if (process.env.NODE_ENV === "production") {
    throw new EmailError("EMAIL_PROVIDER=console cannot run in production. Set EMAIL_PROVIDER=resend.");
  }
  outbox.push({ to, url });
  if (process.env.NODE_ENV !== "test") console.log(`[dev] Login link for ${to}: ${url}`);
}

async function sendWithResend(to: string, url: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new EmailError("EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM");

  const { subject, text, html } = loginEmail(url);
  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new EmailError(`Resend request failed: ${(error as Error).message}`);
  }
  if (!res.ok) {
    // Resend answers errors as { statusCode, name, message }. Never log the key or the link.
    const body = (await res.json().catch(() => ({}))) as { name?: string; message?: string };
    throw new EmailError(`Resend rejected the email (${res.status} ${body.name ?? ""}): ${body.message ?? "no details"}`);
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function loginEmail(url: string): { subject: string; text: string; html: string } {
  const subject = "Your sign-in link";
  const text = [
    "Open this link to sign in to your restaurant dashboard:",
    "",
    url,
    "",
    "The link works once and expires in 15 minutes. If you did not ask to sign in, you can ignore this email.",
  ].join("\n");
  const safe = escapeHtml(url);
  const html = `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <p>Open this link to sign in to your restaurant dashboard:</p>
  <p><a href="${safe}" style="display: inline-block; padding: 10px 18px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">Sign in</a></p>
  <p style="color: #555; font-size: 14px;">Or copy this address into your browser:<br><span style="word-break: break-all;">${safe}</span></p>
  <p style="color: #555; font-size: 14px;">The link works once and expires in 15 minutes. If you did not ask to sign in, you can ignore this email.</p>
</body></html>`;
  return { subject, text, html };
}
