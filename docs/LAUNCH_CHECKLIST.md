# Launch checklist

What has to be true before the first real customer pays for a real order, starting with Zogam Cafe. Work top to bottom. A box is ticked only when someone has seen the result, not when the step was merely done.

**Owner key.** **Founder** decides or holds the account. **Codex** reviews and verifies independently. **Claude** builds and runs the code-side steps. Where an owner is the founder, the others can prepare the commands but not the account access.

**Release authority.** The founder gives the final go. Pricing, fees and live payment settings change only with the founder's approval.

## 0. Code is merged and checked

- [ ] CI (`.github/workflows/ci.yml`) is merged and passing on `main`. *Codex, founder*
- [ ] The stacked pull requests are merged in order and `main` passes CI after the last one: tables and dine-in, till and promotions, dashboard, design-system screens, architecture guide. *Codex, founder*
- [ ] The Zogam Cafe menu importer is merged (it is only used once, at step 6). *Codex, founder*
- [ ] `main` builds from a clean checkout: `npm ci && npm run typecheck && npm test && npm run build`. *Claude*
- [ ] No open review comment marked P1. *Codex*

## 1. Hosting and network

Plan on record: Contabo server, Coolify to deploy, Cloudflare in front. Adjust if that changes.

- [ ] A server is running Node 22 and PostgreSQL 16 (or a managed PostgreSQL 16). *Founder*
- [ ] The app is deployed from `main` and reachable over HTTPS on its real domain. *Founder, Claude*
- [ ] The origin refuses direct public traffic; only Cloudflare and the proxy can reach the app. *Founder*
- [ ] `APP_URL` is the HTTPS public address. *Founder*
- [ ] `TRUSTED_CLIENT_IP_HEADER` is set to a single-IP header that the ingress overwrites on every request, and only after the item above is confirmed. Without it, public rate limits share one anonymous bucket. *Founder, Codex to verify*
- [ ] Access logs redact the bearer tokens that appear in sign-in and order paths. *Founder*
- [ ] `GET /api/health` returns healthy in production, and is not reported as degraded for the client-IP setting. *Claude*
- [ ] An uptime monitor watches `/api/health`. *Founder*
- [ ] `ALERT_WEBHOOK_URL` points at a channel someone reads, and a deliberate test alert arrived. *Founder*

## 2. Database

- [ ] Two roles exist with strong, different passwords: `siamsil_owner` (migrations only, never at runtime) and `siamsil_app` (the running app, subject to row-level security). The database is owned by `siamsil_owner`. *Founder*
- [ ] `DATABASE_URL` uses `siamsil_app`; `DATABASE_OWNER_URL` uses `siamsil_owner` and is available only where migrations run. *Founder, Claude*
- [ ] Migrations ran with `npm run db:migrate` during the deployment window, before the new app took traffic. *Claude*
- [ ] The tenant-isolation tests pass against the production database version: `tests/tenant-isolation.test.ts`. *Claude*
- [ ] Automatic backups run at least daily, are stored off the database server, and the retention period is written down. *Founder*
- [ ] A backup has been restored into a separate empty database, the app started against it, and a known order was found. Until a restore has worked, there is no backup. *Founder, Claude*

## 3. Secrets and configuration

Generate each secret independently, for example `openssl rand -base64 48`. Never commit them.

- [ ] `ORDER_TOKEN_SECRET`: at least 32 random characters. It must stay stable, because it derives customers' private order links and keeps retries working. *Founder*
- [ ] `CRON_SECRET`: at least 32 random characters, different from the one above. *Founder*
- [ ] `PAYMENTS_PROVIDER=stripe` in production. The fake provider refuses to start there, which is the intended safeguard. *Founder*
- [ ] No test or sandbox keys in the production environment, and no live keys in any other environment. *Founder, Codex to review settings*
- [ ] Secrets are stored in the host's secret settings, not in the repository or in chat. *Founder*

## 4. Sign-in email (Resend)

- [ ] `RESEND_API_KEY` is set and the sender domain in `LOGIN_FROM_EMAIL` is verified in Resend. *Founder*
- [ ] A real sign-in link was requested from the production site, arrived in an inbox (and not in spam), and signed in successfully. Check at least one Gmail and one other provider. *Founder*
- [ ] Requesting links repeatedly is throttled, and a spent link cannot be reused. *Claude*

## 5. Background worker

- [ ] `npm run worker:orders` runs under a process supervisor and restarts after a crash, or a scheduler calls `POST /api/internal/expire-orders` every minute with `Authorization: Bearer $CRON_SECRET`. *Founder, Claude*
- [ ] `/api/health` reports a recent worker heartbeat, and goes degraded when the worker is stopped for more than five minutes (stop it on purpose and confirm). *Claude*
- [ ] The worker shares the app's `ORDER_TOKEN_SECRET`/`CRON_SECRET` settings and uses HTTPS or a loopback address. *Claude*

## 6. Payments: real Stripe sandbox run

Everything so far was tested with the built-in fake provider and simulated events. That proves the app's own logic, not Stripe's behavior. This section is the first real test. Use test keys and a test connected account.

Setup:

- [ ] Stripe account has Connect enabled, with a test connected account for the demo restaurant. Its id is saved in `restaurants.stripe_account_id`. *Founder*
- [ ] Test `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` are set. *Founder*
- [ ] A Connect webhook endpoint points at `/api/webhooks/stripe` and listens for: `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.canceled`, `payment_intent.payment_failed`, `refund.created`, `refund.updated`, `refund.failed`. Its signing secret is in `STRIPE_WEBHOOK_SECRET`. *Founder*

Scenarios. For each, record what was done and what happened:

- [ ] **Successful order:** card authorized, kitchen accepts, payment captured, order shows as paid, application fee recorded as expected.
- [ ] **Declined card, then retry:** the customer sees a clear failure, retries, and is charged once.
- [ ] **Decline by the kitchen:** the hold is released and the customer is told nothing was charged.
- [ ] **Order expiry:** an authorized order nobody accepts is released after five minutes by the worker.
- [ ] **Delayed or repeated webhook:** a webhook delivered late, or twice, does not duplicate or lose a state change.
- [ ] **Cancel after accept (owner):** full refund is created, shows as pending, then confirmed by the `refund.*` event, and the customer's page shows it.
- [ ] **Failed refund:** the app shows it needs attention and alerts.
- [ ] **Promo code on a card order:** the discount, tax and fee match the receipt; a declined order returns the code's use.
- [ ] **Reports match Stripe:** sales and refunds for the test period agree with the Stripe dashboard.

Known limits to keep in mind: partial refunds and refunds issued directly in Stripe are not reconciled by the app and must be checked in Stripe.

Owner: *Founder runs or watches; Codex verifies independently; Claude fixes what breaks.*

## 7. In-person flows (dine-in and till)

These involve no card, so test them on the real deployment with real hardware.

- [ ] Print the table QR codes, scan one with a real phone, place a pay-later order, and see it in the kitchen with the table number. *Founder*
- [ ] Staff mark the order paid at the table (cash or terminal) and the table clears only after that. *Founder*
- [ ] Cancel a paid pay-later order: the app asks staff to confirm the money was handed back before recording a refund, and the guest's page shows it as refunded, not paid. *Founder*
- [ ] A till order with a promo code and a custom discount produces the expected receipt. *Founder*
- [ ] The kitchen sound plays on the actual tablet, and staff know to tap once to turn it on. *Founder*

## 8. Zogam Cafe

- [ ] The founder has confirmed prices for the six items flagged in `docs/zogam-cafe.md`: Yum Beef, Chicken or Seafood; Singapore Fried Noodle; Nasi Lemak; Red Snapper; Lemon Fish; and whether Pepper Steak has other choices.
- [ ] The owner's email address is decided and can receive mail.
- [ ] Photos are ready as JPEGs named for the dishes, each under 1.5 MB (optional; they can be added later in `/menu`).
- [ ] The importer ran once on production: `ZOGAM_OWNER_EMAIL=... npm run db:seed:zogam`. It creates the restaurant with ordering paused. *Claude, founder watching*
- [ ] The owner signed in and checked every dish, price and choice group in `/menu`.
- [ ] In `/manage`: the tax rate (it starts at 0%), weekly hours and preparation time are set.
- [ ] The timezone is right. New restaurants default to America/Chicago, which is correct for a Central-time restaurant such as one with a 918 area code. The app has no timezone setting yet (found in the browser smoke test), so a restaurant in another zone needs the value changed in the database by whoever holds the owner connection, or a field added to `/manage` first. *Founder to confirm Zogam's timezone*
- [ ] Stripe is connected for the live restaurant account, and the pricing plan is chosen by the founder.
- [ ] Ordering is switched on only after a full real test order, placed, accepted, and refunded, with live-mode cards in the founder's hands.

## 9. Legal and policy

- [ ] Terms, privacy policy and refund policy are written and linked from the storefront. *Founder*
- [ ] Sales tax is set correctly for the restaurant's location, and the owner knows reports are not tax filings. *Founder, restaurant's accountant*
- [ ] The platform fee terms are agreed with Zogam Cafe in writing. Invoiced fees (till and dine-in pay-later orders) are recorded but there is no billing yet, so decide how they are collected. *Founder*

## 10. Go-live day

- [ ] All sections above are ticked, or each exception has been accepted in writing by the founder.
- [ ] Someone is available to watch logs, alerts and `/api/health` for the first service.
- [ ] A rollback plan exists: the previous deploy can be restored, and the database can be restored from backup. Migrations are one-way, so changes that cannot be rolled back are listed.
- [ ] Switch live Stripe keys on, place one real small order and refund it, then enable ordering for customers.
- [ ] After the first day: compare the day's orders and payments against the Stripe dashboard, and read every alert that fired.

## Not built yet (decide whether any block launch)

- Billing for invoiced platform fees and the monthly growth plan.
- Printed kitchen tickets and a dedicated tablet mode.
- Customer notifications by SMS or email when an order is accepted or ready.
- Delivery, loyalty and multi-location management.
- Lint and browser end-to-end tests in CI.
