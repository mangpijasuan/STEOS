import { after } from "next/server";
import { alert } from "@/lib/alerts";
import { requestLogin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { allow, clientIdentity } from "@/lib/ratelimit";
import { loginRequest } from "@/lib/validation";

const WINDOW = 15 * 60 * 1000;

export const POST = handle(async (req) => {
  const { email } = loginRequest.parse(await req.json());
  const ip = clientIdentity(req);
  if (!await allow(`login-ip:${ip}`, 20, WINDOW) || !await allow(`login:${email.toLowerCase()}`, 5, WINDOW)) {
    return json({ error: "Too many attempts. Try again later." }, 429);
  }
  after(async () => {
    try {
      await requestLogin(email);
    } catch (error) {
      await alert("sign-in-delivery", "Staff sign-in delivery failed", { error });
    }
  });
  // Same answer whether or not the address exists.
  return json({ ok: true, message: "If that email belongs to a staff account, a sign-in link is on its way." });
});
