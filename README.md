# Siamsil Restaurant: Sprint 1 foundation

Multi-tenant ordering platform. This sprint covers the database, row-level security, staff login and menu management. Orders, payments and the storefront come in later sprints (see the technical specification).

## Run it

Requires Node 22+ and PostgreSQL 16.

```bash
npm install
cp .env.example .env            # edit passwords for anything beyond local development

# One-time database setup (as a Postgres superuser)
#   create role siamsil_owner login password '...' createdb;
#   create role siamsil_app   login password '...';
#   create database siamsil owner siamsil_owner;

npm run db:migrate              # applies db/migrations using the owner role
npm run db:seed                 # demo restaurant + owner login (SEED_OWNER_EMAIL)
npm run dev                     # http://localhost:3000, sign in at /login
npm test                        # needs a second database named siamsil_test (same roles)
```

In development the sign-in link is printed in the server console instead of being emailed (`EMAIL_PROVIDER=console`).

## How tenant isolation works

- The running app connects as `siamsil_app`, which does not own the tables, so row-level security applies to it.
- Every query runs inside `withTenant(restaurantId, ...)` in `lib/db.ts`, which sets `app.restaurant_id` for that transaction only. No tenant set means no rows.
- Composite foreign keys `(id, restaurant_id)` stop a row from pointing at another restaurant's row.
- Every restaurant has one default location (migration 0002, created automatically); later tables such as orders will carry `location_id`.
- The app role cannot create or delete restaurants. Use the owner connection or admin tooling.
- `tests/tenant-isolation.test.ts` proves the above against a real database.

## API (all under /api)

| Route | Who | Purpose |
| --- | --- | --- |
| POST auth/request | public, rate limited | Email a one-time sign-in link (it opens `/login/confirm`) |
| POST auth/verify | public, same-origin form | Spend the link (form field `token`), set the session cookie |
| GET auth/verify?token= | public | Old-style links: forwards to `/login/confirm` without spending the token |
| POST auth/logout | signed in | End the session |
| GET staff/me | staff | Who am I |
| GET staff/menu | staff | Full menu with items and modifiers |
| POST, PUT, DELETE staff/menu/categories[/id] | owner | Categories |
| POST, PUT, DELETE staff/menu/items[/id] | owner | Items (delete is soft) |
| PATCH staff/menu/items/id/availability | staff | Mark sold out or back in stock |
| POST staff/menu/items/id/modifier-groups | owner | Add a modifier group |
| PUT, DELETE staff/menu/modifier-groups/id | owner | Edit or remove a group |
| POST staff/menu/modifier-groups/id/options | owner | Add an option |
| PUT, DELETE staff/menu/modifier-options/id | owner | Edit or remove an option |
| GET r/slug/menu | public | Storefront menu, open/closed state, earliest pickup |
| GET r/slug/pickup-slots | public | 15-minute pickup times (empty when paused or closed) |
| POST r/slug/quote | public, rate limited | Price a cart on the server: subtotal, tax, tip, total |
| GET staff/settings | staff | Ordering settings |
| PATCH staff/settings | staff (pause) / owner (rest) | Pause ordering, prep time, advance days, tax rate |
| GET, PUT staff/hours | staff / owner | Weekly opening periods |
| POST r/slug/checkout | public, rate limited | Save the order and hold the card. Requires an `Idempotency-Key` header |
| GET orders/token | private link | Customer's order status (polled every 5 seconds) |
| POST webhooks/stripe | Stripe signature | Payment events, de-duplicated |
| GET staff/orders | staff | Orders waiting, accepted or ready |
| POST staff/orders/id/accept, decline | staff | Accept (with optional `prepMinutes`) captures the money; decline releases the hold |
| POST staff/orders/id/ready, complete | staff | Kitchen line: accepted, ready, picked up |
| POST staff/orders/id/cancel | owner | Cancel an accepted order and refund in full, including the SROS fee |
| GET staff/pricing?monthlySalesCents=&avgOrderCents= | owner | Plans, the active one, and each plan's monthly cost estimate |
| PUT staff/pricing | owner | Choose a plan; applies to new orders only |
| GET staff/reports/summary?days= | owner | Sales, tax, tips, fees, refunds, top items, by day |
| GET health | public | For an uptime monitor: 200 when healthy, 503 if the database is down or the expiry job has stopped |
| POST internal/expire-orders | `CRON_SECRET` | Release orders unanswered after 5 minutes and clear old rate-limit rows. Call every minute |

## Decisions made in Sprint 1

- Data access: Drizzle with SQL migrations as the source of truth (no engine download, simple to inspect).
- Login: emailed one-time link, hashed tokens, 15-minute links, 30-day sessions.
- Staff roles: `owner` manages the menu, `staff` can read it and mark items sold out.

## Before any live use

- Set up Resend for login emails (see "Login emails" below). Production refuses to send links any other way.
- Per-IP rate limits read the first `X-Forwarded-For` address. Host the app behind a proxy that overwrites that header, or clients can set it themselves and get around per-IP limits.
- There is no menu editing screen yet. The dashboard lists the menu and toggles sold-out. The editing API is complete and tested.

## Decisions made in Sprint 2

- The storefront lives at `/r/<slug>`. Prices are never trusted from the browser; `lib/cart.ts` prices from the live menu.
- Tax is rounded half up on the food subtotal. Tips are not taxed.
- Pickup slots are every 15 minutes, from now plus prep time, inside opening hours, in the restaurant's time zone (daylight saving tested).
- Any staff member can pause online ordering; only owners change hours, prep time and tax rate.
- The cart is kept in the browser's local storage. The checkout button is disabled until Sprint 3.

## Decisions made in Sprint 3

- Stripe Connect direct charges: the payment lives on the restaurant's own account and SROS takes an application fee. Cards are authorized first and captured when the kitchen accepts.
- Fee base is the food subtotal. With direct charges the restaurant's own account pays Stripe, so the "all-in" model takes the target percentage minus estimated processing (never below zero). The exact calculation is saved on every order.
- The kitchen has 5 minutes to accept. After that the hold is released automatically.
- Tips are optional, untaxed, and not part of the fee base.
- Guest checkout needs only a name and phone. The customer's order link is derived from the idempotency key, so a retry returns the same link, and only its hash is stored.
- Webhook events are recorded in the same transaction that applies them, so repeats are ignored and failures can be retried.
- `PAYMENTS_PROVIDER=fake` runs everything locally with a test panel instead of a card form. It refuses to start in production.

## To run against the Stripe sandbox

1. Create a Stripe test account and enable Connect. Create a test connected account for the demo restaurant and save its id in `restaurants.stripe_account_id`.
2. Put the test secret and publishable keys in `.env`, and set `PAYMENTS_PROVIDER=stripe`.
3. Add a Connect webhook endpoint for `/api/webhooks/stripe` listening to `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.canceled` and `payment_intent.payment_failed`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`. For local testing use `stripe listen --forward-connect-to`.
4. Schedule `POST /api/internal/expire-orders` every minute with `Authorization: Bearer $CRON_SECRET`.

The Stripe code path has not been run against Stripe yet, only the fake provider. Treat the first sandbox run as part of Sprint 3 acceptance.

## Sprint 4: kitchen screen

- `/kitchen` shows new orders with a response countdown, accept with a prep time, mark ready, picked up, and (owners) cancel with a full refund.
- Sound: browsers only allow audio after a tap, so staff press "Turn on sound" once per session. A double beep repeats every 8 seconds while any order is waiting, and the tab title shows the count.
- Staff can pause or resume online ordering from the same screen.
- The screen polls every 4 seconds. Realtime push (server-sent events) is a later improvement; polling is simpler and survives dropped connections.
- Printing and a dedicated tablet mode are not built yet.

## Sprint 5: pricing plans and reports

- Plans live in `lib/pricing.ts`: simple 3% + card fees, all-in 6%, founding 7% all-in, and a growth plan (5% + card fees + $79/month) that is listed but cannot be chosen until monthly billing exists. All rates are experiments.
- Owners choose their own plan at `/pricing`, with a calculator for their monthly sales. The choice applies to new orders only. Each order stores a fee snapshot including the plan, so changing a plan or a rate never rewrites history.
- `/reports` (owners only) shows sales, tax, tips, SROS fees, estimated card fees, refunds, top items and a daily breakdown. Card fees are estimated at 2.9% + 30 cents; Stripe has the exact figures.
- `npm run report:platform -- 30` prints what SROS earned across all restaurants in the last 30 days. It uses the owner database connection, so run it only on your own machine or server.

**Worth knowing about the all-in plans.** With Stripe direct charges the restaurant's own account pays the card fees, so on an all-in plan SROS keeps only the target percentage minus those fees, and nothing on very small orders. On a $20 order at 6% that is about $0.32. Plans with "+ card fees" earn more per order but cost the restaurant more. Compare them in the pilot before settling on a price.

## Sprint 6: hardening (in progress)

Done:

- **Sign-in confirmation page.** The emailed link opens `/login/confirm`, which shows a "Sign in" button. Only pressing it (a same-origin form post to `auth/verify`) spends the token, so email scanners that open links can no longer use them up. Posts from other sites are refused. Links sent before this change still work. An expired or used link returns to `/login` with an explanation.
- **Rate limits in the database.** `lib/ratelimit.ts` counts hits per fixed window in the `rate_limits` table (migration 0007), so limits hold across server processes and restarts. Keys are stored as SHA-256 hashes, never raw emails or IP addresses. The every-minute job deletes finished windows.

- **Login emails through Resend.** `lib/mailer.ts` calls the Resend API directly (no extra package). If sending fails, the error is logged and the visitor still sees the usual "a link is on its way" answer, so a failure cannot reveal which emails have accounts. The log names the staff id, never the email or the link.

- **Logging and alerts.** See "Logs, alerts and monitoring" below.

Still to do: backups, and the first run against the Stripe sandbox.

### Logs, alerts and monitoring

**Logs.** `lib/log.ts` writes one JSON line per event (`time`, `level`, `event`, then fields): info to stdout, warnings and errors to stderr, so any log host can search them. Fields named like emails, phones, customer names, tokens, keys or cookies are replaced with `[redacted]`, and ids and tokens in paths become `:id`. Set `LOG_LEVEL` to change how much is written; tests default to `silent`. Events worth searching for: `order.accepted`, `order.declined`, `order.expired`, `order.refunded`, `webhook.processed`, `cron.expire_orders`, and anything starting with `alert.`.

**Alerts.** `alert()` in `lib/alerts.ts` logs at error level and, if `ALERT_WEBHOOK_URL` is set, posts a short message there. It works with Slack incoming webhooks, and with Discord if you add `/slack` to the end of the webhook URL. Each kind of alert is sent at most once every 15 minutes; repeats are still logged. Alerts are raised for:

| Alert | Meaning |
| --- | --- |
| `payment-refund` | A cancelled order's refund failed. The customer has **not** been refunded; refund them in Stripe. |
| `payment-capture` | The kitchen accepted but the card could not be charged. |
| `payment-cancel` | A declined or expired order's card hold could not be released. |
| `payment-authorize` | A card hold could not be started at checkout. |
| `stripe-webhook` | Stripe's webhook was rejected. Repeated, it means `STRIPE_WEBHOOK_SECRET` is wrong and orders never reach the kitchen. |
| `login-email` | A sign-in email failed to send (usually a Resend problem). |
| `server-error:<route>` | Any unexpected error. The user sees a `requestId`; search the logs for it. |

**Uptime monitor.** Alerts cannot fire if the app itself is down, so point an outside monitor (UptimeRobot, Better Stack and similar, many free) at `GET /api/health` every minute and alert on anything but 200. It returns 503 when the database is unreachable or when an order has waited more than 5 minutes past its deadline, which means the every-minute expiry job is not running.

### Interface

All screens share one design system: `app/globals.css` (colors, spacing, components, light and dark themes), `app/ui.tsx` (buttons, sheets, toasts, staff top bar) and `app/icons.tsx`. Change the brand color in the `--brand*` variables at the top of `globals.css`. The kitchen screen always uses the dark theme. Customer screens follow the device's light or dark setting. Prices are always calculated on the server, never in the browser.

### Dine-in: tables, QR codes and the table board

Owners set up floors and tables at `/tables` (Set up tables): add tables in bulk (`1-12`, `01-12`, `A1, A2`), assign a waiter to each, and print one QR card per table at `/tables/qr`. Each QR code holds a private secret for its table (`/t/<secret>`); if a code is photographed or leaked, "Replace QR code" in the table's settings makes the old one stop working. Table ordering stays off until the owner turns it on in Set up tables.

- **Guests** scan, see the menu, and choose **Order & pay now** (card, same flow as pickup) or **Order now, pay later at the table**. They can call a waiter, ask for water, or ask for the bill (cash or card) from their phone.
- **Pay-later orders** go straight to the kitchen with no card hold and never time out. A waiter marks them paid (cash or the restaurant's own card machine) from the table sheet; paying also settles a bill request.
- **The table board** (`/tables`, every staff member) shows each table as a coloured tile: Available, Browsing, Pending, Preparing, Ready, Served, Bill, Service Request, Paid. Tabs: Assigned, Priority, All, plus floor filters. A table cannot be cleared while orders are in progress or unpaid.
- **Fees.** On pay-later orders no card is charged through SROS, so the fee is invoiced (`orders.fee_collection = 'invoice'`) rather than taken from a payment. It is calculated the same way as for a card order, so SROS earns the same either way. Reports show those fees separately and never estimate card fees on cash.
- **Limits.** Each table can place 8 orders per 10 minutes, and 8 service requests per 5 minutes, so a photographed QR code cannot flood the kitchen.

### Menu editor and photos

Owners edit the menu at `/dashboard` (Menu): categories, items, add-on groups, ordering, and food photos. Staff can still mark items sold out. Photos are shrunk in the browser (max 1200px JPEG), stored in the database (`images` table, migration 0009) and served publicly at `/api/images/<id>` with a one-year cache. Uploads are owner-only, checked by their real file signature (JPEG, PNG or WebP), limited to 1.5 MB and 60 per hour, and capped at 500 per restaurant. A replaced photo is deleted with the change, and photos that were uploaded but never saved are removed after an hour by the every-minute job. If you later move photos to object storage (S3 and similar), only `lib/images.ts` and the two image routes change.

### Login emails

1. Create a Resend account, add your sending domain and add the DNS records it shows (SPF and DKIM) until Resend marks the domain verified.
2. Create an API key with sending access.
3. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=re_...` and `EMAIL_FROM="Siamsil <login@yourdomain.com>"`, and make sure `APP_URL` is the public address, because links are built from it.
4. Request a sign-in link at `/login` and check it arrives. If it does not, the server log has a line starting `[auth] Login email ... failed` with Resend's reason (an unverified domain is the usual one).

The Resend code is tested against a stubbed API only; the step-4 check is its first real run. Without a verified domain, Resend only delivers to your own account's address.
