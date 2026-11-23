export const outbox: { to: string; url: string }[] = [];

export async function sendLoginEmail(to: string, url: string): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    outbox.push({ to, url });
    return;
  }
  const { EMAIL_PROVIDER, RESEND_API_KEY, LOGIN_FROM_EMAIL, EMAIL_FROM } = process.env;
  const from = LOGIN_FROM_EMAIL || EMAIL_FROM;
  const provider = EMAIL_PROVIDER || (RESEND_API_KEY && from ? "resend" : "console");
  if (provider === "console" && process.env.NODE_ENV !== "production") {
    console.log(`[dev] Login link for ${to}: ${url}`);
    return;
  }
  if (provider !== "resend" || !RESEND_API_KEY || !from) throw new Error("Login email delivery is missing configuration");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Sign in to Siamsil Restaurant",
      text: `Open this link and confirm to sign in. It expires in 15 minutes.\n\n${url}`,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Login email provider returned HTTP ${response.status}`);
}
