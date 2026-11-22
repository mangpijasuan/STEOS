import { requestLogin } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { allow, clientIp } from "@/lib/ratelimit";
import { loginRequest } from "@/lib/validation";

const WINDOW = 15 * 60 * 1000;

export const POST = handle(async (req) => {
  const { email } = loginRequest.parse(await req.json());
  const tooMany =
    !(await allow(`login:${email.toLowerCase()}`, 5, WINDOW)) || !(await allow(`login-ip:${clientIp(req)}`, 20, WINDOW));
  if (tooMany) return json({ error: "Too many attempts. Try again later." }, 429);
  await requestLogin(email);
  // Same answer whether or not the address exists.
  return json({ ok: true, message: "If that email belongs to a staff account, a sign-in link is on its way." });
});
