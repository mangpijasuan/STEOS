// Login email delivery. Development logs the link and keeps it in `outbox` for tests.
// Before the live pilot, replace the body of sendLoginEmail with a transactional email provider.
export const outbox: { to: string; url: string }[] = [];

export async function sendLoginEmail(to: string, url: string): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("No email provider configured. Wire one into lib/mailer.ts before production.");
  }
  outbox.push({ to, url });
  if (process.env.NODE_ENV !== "test") console.log(`[dev] Login link for ${to}: ${url}`);
}
