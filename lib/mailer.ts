export const outbox: { to: string; url: string }[] = [];

export async function sendLoginEmail(to: string, url: string): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    outbox.push({ to, url });
    return;
  }
  const { RESEND_API_KEY, LOGIN_FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY || !LOGIN_FROM_EMAIL) {
    if (process.env.NODE_ENV === "production") throw new Error("Login email delivery is missing configuration");
    console.log(`[dev] Login link for ${to}: ${url}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: LOGIN_FROM_EMAIL,
      to: [to],
      subject: "Sign in to Siamsil Restaurant",
      text: `Open this link and confirm to sign in. It expires in 15 minutes.\n\n${url}`,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Login email provider returned HTTP ${response.status}`);
}
