import { requestLogin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { allow } from "@/lib/ratelimit";
import { loginRequest } from "@/lib/validation";

const WINDOW = 15 * 60 * 1000;

export const POST = handle(async (req) => {
  const { email } = loginRequest.parse(await req.json());
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allow(`login:${email.toLowerCase()}`, 5, WINDOW) || !allow(`login-ip:${ip}`, 20, WINDOW)) {
    return json({ error: "Too many attempts. Try again later." }, 429);
  }
  await requestLogin(email);
  // Same answer whether or not the address exists.
  return json({ ok: true, message: "If that email belongs to a staff account, a sign-in link is on its way." });
});
