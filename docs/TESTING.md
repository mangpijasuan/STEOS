# Testing

## What runs

| Check | Command | Notes |
| --- | --- | --- |
| Type check | `npm run typecheck` | |
| Tests | `npm test` | Vitest against a real PostgreSQL 16 database; migrations are applied automatically before the run |
| Production build | `npm run build` | Also type-checks |

CI (`.github/workflows/ci.yml`) runs all three on every pull request and every push to `main`, using a disposable PostgreSQL 16 service.

## Browser tests

`npm run e2e` runs Playwright (`e2e/*.spec.ts`) against the real app in Chromium at **desktop (1280), tablet (820) and phone (390)** sizes. It starts the app in development mode with the fake payment provider, seeds a throwaway database (`e2e/seed.ts`: an `e2e-kitchen` restaurant, a minimal `zogam-cafe`, an owner, a staff member, three QR tables, and ready-made sessions), and runs the tests one at a time.

What they cover: every public page loads with no console errors, no sideways scroll, the right title and footer; a customer orders a dish with a required choice, pays with the fake card, the kitchen accepts it and the customer's page updates; QR dine-in pay-later through to Paid; the till takes a cash payment on every screen size (the payment sheet must not be covered by the order summary); owner-only data is closed to staff and to signed-out visitors; one restaurant's owner cannot see or touch another's order; the platform's navy and gold, and that restaurants keep their own colors; and the Zogam logo badge fits its header bar.

To run them locally you need PostgreSQL 16 with the roles in the next section and an empty database named `siamsil_e2e` owned by `siamsil_owner` (override the name with `E2E_DB`):

```bash
DATABASE_OWNER_URL=postgres://siamsil_owner:dev_owner_pw@localhost:5432/siamsil_e2e npm run db:migrate
npx playwright install chromium     # once; or set PW_CHROMIUM_PATH to a Chromium you already have
npm run e2e                         # add --project=mobile (or tablet, desktop) to run one size
```

CI runs them as the `e2e` job and keeps the report and failure traces as a downloadable artifact. A test that fails is a real problem to fix, not a test to skip.

## Running the tests locally

The tests expect these roles and a database named `siamsil_test` (see `tests/config.ts`):

```sql
create role siamsil_owner login password 'dev_owner_pw' createdb;
create role siamsil_app   login password 'dev_app_pw';
create database siamsil_test owner siamsil_owner;
```

If the database already holds migrations from another branch, drop and recreate it before running the suite.

## What the suite covers

Tenant isolation against a real database; pricing, tax, fees and plans; hours and pickup slots in the restaurant's time zone; checkout, idempotent retries and request fingerprints; payment events, captures, expiry and refunds (including reconciliation); the kitchen workflow; QR dine-in and pay-later orders; the till, discounts and promo codes (including the use being returned when an order never completes); reports; sign-in, sessions and roles; images; rate limiting, health and logging.

Payments use a **fake provider and simulated events**. That checks STEOS's own logic. It does not test Stripe.

## Not covered yet

- A real Stripe sandbox run (authorization, capture, webhook delivery, refunds, disputes).
- Real browsers other than Chromium (Safari and Firefox), and real devices. The browser tests are Chromium only.
- Real devices (Safari, phones), a real printer, and real email delivery.
- A lint step. There is no lint script yet.
- Load testing.

## Every change should show

Typecheck, tests and build results, a note of what was not tested, and for screens a check at desktop, tablet and phone widths with no horizontal overflow and no console errors. A new migration needs a test for any new table's tenant isolation.
