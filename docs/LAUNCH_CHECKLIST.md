# Siamsil Restaurant production launch checklist

What has to be true before the first real customer pays for a real order, starting with Zogam Cafe. Work top to bottom. A box is ticked only when someone has seen the result, not when the step was merely done.

**Owner key.** **Founder** decides or holds the account. **Codex** reviews and verifies independently. **Claude** builds and runs the code-side steps. Where an owner is the founder, the others can prepare the commands but not the account access.

**Release authority.** The founder gives the final go. Pricing, fees and live payment settings change only with the founder's approval.

## Mandatory release gates

Record evidence, date, verifier and release commit for each gate. All five must pass before public commercial launch. Critical security, tenant isolation, payment integrity, legal authorization and backup/restore failures cannot be waived. Noncritical exceptions require written founder acceptance, mitigation, owner and due date.

| Gate | Evidence required | Checklist sections |
| --- | --- | --- |
| 1. Code release | Clean main CI, Docker build, health endpoint tests, no critical defects | 0 |
| 2. Staging infrastructure | Isolated HTTPS staging, database restore, secrets, email and worker checks | 1–5 |
| 3. Payment certification | Stripe sandbox scenarios, reconciliation, dispute handling | 6 |
| 4. Restaurant acceptance | Owner-approved menu and workflows on physical devices | 7–8 |
| 5. Commercial launch | Entity, agreements, policies, live account approval, controlled live test and monitoring | 9–10 |

Use [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) for sequencing and [DEPLOY_COOLIFY.md](DEPLOY_COOLIFY.md) for deployment. Pickup is the first commercial scope; QR/till are enabled only after their acceptance checks. Delivery and loyalty are deferred.

## 0. Code is merged and checked

- [ ] CI (`.github/workflows/ci.yml`) is merged and passing on `main`. *Codex, founder*
- [ ] The stacked pull requests are merged in order and `main` passes CI after the last one: tables and dine-in, till and promotions, dashboard, design-system screens, architecture guide. *Codex, founder*
- [ ] The Zogam Cafe menu importer is merged (it is only used once, at step 6). *Codex, founder*
- [ ] `main` builds from a clean checkout: `npm ci && npm run typecheck && npm test && npm run build`. *Claude*
- [ ] No open review comment marked P1. *Codex*

- [ ] Docker build passes; pin the supported Node image to a verified digest and document updates. Verify liveness, readiness success/failure, bounded database probe behavior and degraded operational health with dedicated tests.

## 1. Hosting and network

Plan on record: Contabo server, Coolify to deploy, Cloudflare in front. Adjust if that changes.

- [ ] A server is running Node 22 and PostgreSQL 16 (or a managed PostgreSQL 16). *Founder*
- [ ] The approved release is deployed to an isolated staging domain over HTTPS before live deployment. Staging uses a separate database, secrets, Stripe test account and webhook configuration. *Founder, Claude*
- [ ] The origin refuses direct public traffic; only Cloudflare and the proxy can reach the app. *Founder*
- [ ] `APP_URL` is the HTTPS public address. *Founder*
- [ ] Staging is not listed by search engines: `ROBOTS_NOINDEX=true` on staging only (check `/robots.txt` on staging says `Disallow: /` and on production does not), and staging sits behind a login or allow-list. *Founder, Claude*
- [ ] `TRUSTED_CLIENT_IP_HEADER` is set to a single-IP header that the ingress overwrites on every request, and only after the item above is confirmed. Without it, public rate limits share one anonymous bucket. *Founder, Codex to verify*
- [ ] Access logs redact the bearer tokens that appear in sign-in and order paths. *Founder*
- [ ] `GET /api/health` returns healthy in production, and is not reported as degraded for the client-IP setting. *Claude*
- [ ] An uptime monitor watches `/api/health`; `/api/live` is process liveness and `/api/ready` is database readiness. Confirm database failure does not trigger a liveness restart loop. *Founder*
- [ ] `ALERT_WEBHOOK_URL` points at a channel someone reads, and a deliberate test alert arrived. *Founder*

## 2. Database

- [ ] Two roles exist with strong, different passwords: `siamsil_owner` (migrations only, never at runtime) and `siamsil_app` (the running app, subject to row-level security). The database is owned by `siamsil_owner`. *Founder*
- [ ] `DATABASE_URL` uses `siamsil_app`; `DATABASE_OWNER_URL` uses `siamsil_owner` and is available only where migrations run. *Founder, Claude*
- [ ] Migrations ran with `npm run db:migrate` during the deployment window, before the new app took traffic. *Claude*
- [x] The tenant-isolation tests pass against the production database version: `tests/tenant-isolation.test.ts`. *Claude* _(seen 2026-11-27 on PostgreSQL 16.15, `main` 24ffaf5; see [LAUNCH_EVIDENCE.md](LAUNCH_EVIDENCE.md))_
- [ ] Automatic backups run at least daily, are stored off the database server, and the retention period is written down. *Founder*
- [ ] A backup has been restored into a separate empty database, the app started against it, and a known order was found. Until a restore has worked, there is no backup. *Founder, Claude*

## 3. Secrets and configuration

Generate each secret independently, for example `openssl rand -base64 48`. Never commit them.

- [ ] `ORDER_TOKEN_SECRET`: at least 32 random characters. It must stay stable, because it derives customers' private order links and keeps retries working. *Founder*
- [ ] `CRON_SECRET`: at least 32 random characters, different from the one above. *Founder*
- [ ] `PAYMENTS_PROVIDER=stripe` in production. The fake provider refuses to start there, which is the intended safeguard. *Founder*
- [ ] Staging uses Stripe test keys even when `NODE_ENV=production`; live commercial environment uses live keys only after approval. Verify mode, account and webhook secret match; never use live keys in staging. *Founder, Codex to review settings*
- [ ] Secrets are stored in the host's secret settings, not in the repository or in chat. *Founder*

## 4. Sign-in email (Resend)

- [ ] `RESEND_API_KEY` is set and the sender domain in `LOGIN_FROM_EMAIL` is verified in Resend. *Founder*
- [ ] A real sign-in link was requested from the production site, arrived in an inbox (and not in spam), and signed in successfully. Check at least one Gmail and one other provider. *Founder*
- [x] Requesting links repeatedly is throttled, and a spent link cannot be reused. *Claude* _(seen 2026-11-27: 6th request returned 429; link single-use test passed; see [LAUNCH_EVIDENCE.md](LAUNCH_EVIDENCE.md))_

## 5. Background worker

- [ ] `npm run worker:orders` runs under a process supervisor and restarts after a crash, or a scheduler calls `POST /api/internal/expire-orders` every minute with `Authorization: Bearer $CRON_SECRET`. *Founder, Claude*
- [x] `/api/health` reports a recent worker heartbeat, and goes degraded when the worker is stopped for more than five minutes (stop it on purpose and confirm). *Claude* _(seen 2026-11-27: 503 about five minutes after the last heartbeat; production-mode build, local database; see [LAUNCH_EVIDENCE.md](LAUNCH_EVIDENCE.md))_
- [ ] The worker uses the app's `CRON_SECRET` and HTTPS or loopback; disable the inherited HTTP container healthcheck for the worker and monitor heartbeat. Neither web nor worker receives `DATABASE_OWNER_URL`. *Claude*

## 6. Payments: real Stripe sandbox run

Everything so far was tested with the built-in fake provider and simulated events. That proves the app's own logic, not Stripe's behavior. This section is the first real test. Use test keys and a test connected account. [STRIPE_SANDBOX.md](STRIPE_SANDBOX.md) has the step-by-step setup and how to run each scenario below.

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

- [ ] Reconcile actual processing and application fees, captures, refunds and payouts. Test partial/external refunds and dispute notifications; implement reconciliation or a documented, tested manual control with named owner and daily review. Unresolved material discrepancies block launch.
- [ ] Verify fraud controls and mobile wallet compatibility; do not advertise unverified wallet support.

Owner: *Founder runs or watches; Codex verifies independently; Claude fixes what breaks.*

## 7. In-person flows (dine-in and till)

Test cash/external-terminal flows on staging with real hardware and QR pay-now with Stripe test cards. Do not collect real money during staging.

- [ ] Print the table QR codes, scan one with a real phone, place a pay-later order, and see it in the kitchen with the table number. *Founder*
- [ ] Staff mark the order paid at the table (cash or terminal) and the table clears only after that. *Founder*
- [ ] Cancel a paid pay-later order: the app asks staff to confirm the money was handed back before recording a refund, and the guest's page shows it as refunded, not paid. *Founder*
- [ ] A till order with a promo code and a custom discount produces the expected receipt. *Founder*
- [ ] The kitchen sound plays on the actual tablet, and staff know to tap once to turn it on. *Founder*

## 8. Zogam Cafe

- [ ] The founder has confirmed prices for the six items flagged in `docs/zogam-cafe.md`: Yum Beef, Chicken or Seafood; Singapore Fried Noodle; Nasi Lemak; Red Snapper; Lemon Fish; and whether Pepper Steak has other choices.
- [ ] The owner's email address is decided and can receive mail.
- [ ] Photos are ready as JPEGs named for the dishes, each under 1.5 MB (optional; they can be added later in `/menu`).
- [ ] The importer ran once per intended environment, first staging and later live before enabling ordering, in a one-off migration/seed job: `ZOGAM_OWNER_EMAIL=... npm run db:seed:zogam`. It creates the restaurant with ordering paused. *Claude, founder watching*
- [ ] The owner signed in and checked every dish, price and choice group in `/menu`.
- [ ] In `/manage`: the tax rate (it starts at 0%), weekly hours and preparation time are set.
- [ ] The timezone is right. New restaurants default to America/Chicago, which is correct for a Central-time restaurant such as one with a 918 area code. The app has no timezone setting yet (found in the browser smoke test), so a restaurant in another zone needs the value changed in the database by whoever holds the owner connection, or a field added to `/manage` first. *Founder to confirm Zogam's timezone*
- [ ] Stripe is connected for the live restaurant account, and the pricing plan is chosen by the founder.
- [ ] Owner approves the sandbox acceptance results. Keep public ordering paused until the controlled live test in section 10; use a restricted test window and re-pause on failure.

## 9. Legal and policy

- [ ] Confirm registered entity, business bank account, Stripe Connect live onboarding, trademark clearance or approved alternative brand, merchant agreement, tax and payment responsibilities with qualified advisers.

- [ ] Terms, privacy policy and refund policy are written and linked from the storefront. *Founder*
- [ ] Sales tax is set correctly for the restaurant's location, and the owner knows reports are not tax filings. *Founder, restaurant's accountant*
- [ ] The platform fee terms are agreed with Zogam Cafe in writing. Invoiced fees (till and dine-in pay-later orders) are recorded but there is no billing yet, so decide how they are collected. *Founder*

## 10. Go-live day

- [ ] All mandatory gates pass (gate 5 completes after the controlled live test). Only noncritical exceptions may be accepted in writing as described above.
- [ ] Someone is available to watch logs, alerts and `/api/health` for the first service.
- [ ] A rollback plan exists: the previous deploy can be restored, and the database can be restored from backup. Migrations are one-way, so changes that cannot be rolled back are listed.
- [ ] After explicit founder authorization, configure live keys in the live environment only, restrict access for one small real order and refund, reconcile it, then enable public pickup ordering. Stop and re-pause on any failure.
- [ ] After the first day: compare the day's orders and payments against the Stripe dashboard, and read every alert that fired.

## Not built yet (decide whether any block launch)

- Billing for invoiced platform fees and the monthly growth plan.
- Printed kitchen tickets and a dedicated tablet mode.
- Customer notifications by SMS or email when an order is accepted or ready.
- Delivery, loyalty and multi-location management.
- Lint and browser end-to-end tests in CI.
