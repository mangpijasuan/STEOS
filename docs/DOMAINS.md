# Domains

Where STEOS lives on the internet today, how to keep it movable, and what changes when Siamsil Technologies acquires `siamsil.com`. Domain choices, DNS and the hosting panel are the founder's. This page records what the code needs and what to check.

## Decisions

| Question | Decision | Status |
| --- | --- | --- |
| Run on `siamsil.org` now, and move to `siamsil.com` later? | Yes. Nothing about launch waits for `.com`. | Recommended, founder to confirm |
| Production address of STEOS | One address, chosen **once, before any QR code is printed**. Suggested: `app.siamsil.org` for sign-in and the dashboard. | **Founder to choose** |
| Staging address | `steos-staging.siamsil.org` (exists) | In use |
| Product subdomain per industry (`restaurant.siamsil.org`, `retail.siamsil.org` ...) | Not now. STEOS is one multi-tenant platform with configurable modules, not an app per industry (see [PRODUCT_VISION.md](PRODUCT_VISION.md)). Use the product name for the product. | Recommended |
| Separate `id`, `api`, `console`, `docs`, `help`, `status` services | Not now. Sign-in and the API live inside this app. Add a subdomain when a separate system really exists. `status` and `docs` are the likely first. | Recommended |
| Keep both `siamsil.org` and `siamsil.com` long term | Yes. `.com` for the commercial brand, `.org` for the public and educational mission. | Founder's strategy |
| A restaurant's own domain (such as `order.zogamcafe.com`) | Not built. Customers of ChowNow and TapTapEat expect it. Treat as a later feature, see below. | Not built |

## What depends on the domain today

The code has no hardcoded `siamsil.org` or `siamsil.com`. These are the places the address matters.

| What | Where it comes from | What a move changes |
| --- | --- | --- |
| Sign-in links in email, and the origin check on the sign-in confirmation | `APP_URL` (HTTPS required in production) | Change the variable. Links already emailed point at the old address, so keep the old address answering. |
| The order worker's call to the expiry route | `APP_URL` or `ORDER_WORKER_URL` | Change the variable and restart the worker. |
| Sender of sign-in email | `LOGIN_FROM_EMAIL` on a domain verified in Resend | Verify the new domain in Resend (SPF, DKIM, DMARC) before switching. Mail from an unverified domain goes to spam or is refused. |
| Stripe webhook endpoint (`/api/webhooks/stripe`) | Configured in the Stripe Dashboard, with its own signing secret | Add the new endpoint **alongside** the old one, update `STRIPE_WEBHOOK_SECRET`, then remove the old one after a day with no events. Stripe Connect settings that list a domain need updating too. |
| Staff sign-in session | Cookie `sr_session`, host-only (no `Domain` attribute) | A different host is a different cookie, so everyone signs in again once. This is expected. |
| Customers' order links | The link is `<address>/order/<token>`. Lookups use a stored hash, so the token stays valid on a new host. | Customers who hold an old link need the old address to keep redirecting to the new one. |
| Table QR codes | `app/tables/qr/page.tsx` builds each code from the **address of the page that prints it** (`window.location.origin`), not from a setting. | **Print QR codes only from the final production address.** A sheet printed from staging or a temporary address carries that address forever. |
| Storefront links a restaurant shares (`/r/<slug>`) | The address visitors used | Same as order links: keep old addresses redirecting. |
| Robots and indexing | `ROBOTS_NOINDEX=true` on staging only | Set it on every non-production hostname. Leave it unset in production. |
| Throttling by client address | `TRUSTED_CLIENT_IP_HEADER` | Unchanged, but re-check `/api/health` after any ingress change. |
| Certificates | Handled by the host (Coolify / Let's Encrypt) | Each new hostname needs its own certificate before traffic is moved. |

## Keep the address in configuration

- Read the public address only from `APP_URL` (and `ORDER_WORKER_URL` for the worker). Do not type a hostname into a screen, email, test or script.
- Platform name, tagline and footer stay in `lib/branding.ts`; domain names do not belong there or anywhere else in the code.
- If a second address is ever needed in code (for example a separate sign-in host), add one named variable in [DEPLOYMENT.md](DEPLOYMENT.md), do not derive it by string-editing `APP_URL`.
- Existing variable names stay as they are. Adding `BASE_DOMAIN`, `AUTH_URL` or `API_URL` is only worth doing when something reads them, and then it is a founder-approved change.

## Moving to siamsil.com

Do these in order. Moving takes weeks to settle, not a single deploy.

1. Acquire `siamsil.com`. Set up DNS and the certificate for the new hostname, pointing at the same app. Both addresses now answer.
2. In Resend, verify the new sending domain and send a test sign-in link. Do not change `LOGIN_FROM_EMAIL` until it arrives in Gmail and one other provider.
3. In Stripe, add the new webhook endpoint (test mode first, in staging) and confirm one successful event arrives. Then do the same in live mode **only with the founder's approval**.
4. Switch `APP_URL` (and the worker's setting) to the new address. Redeploy. Check `/api/ready`, `/api/health`, a sign-in, and one order from its link.
5. Turn the old address into a permanent redirect to the new one for the same path. Keep it for as long as any printed QR code or emailed link could still exist (treat it as years, not months).
6. Reprint QR codes from the new address when convenient. Old ones keep working through the redirect.
7. Remove the old Stripe webhook endpoint only after a full day with no events on it.
8. Update the written places that name the address: the launch checklist evidence, the Stripe sandbox guide's examples, and any restaurant's printed material.

Test the whole sequence on staging first, with a staging name on the new domain, before touching production.

## Not covered here

- Restaurant-owned domains. Needs a design: a domain-to-restaurant lookup, a certificate per domain, and sign-in kept on the platform address. Raise it as a roadmap item (see [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md)) before building.
- A shared sign-in across Siamsil products. Do not build it until there is a second product that needs it.
- Choosing, buying or pointing DNS for any domain. Founder.
