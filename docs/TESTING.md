# Testing

## What runs

| Check | Command | Notes |
| --- | --- | --- |
| Type check | `npm run typecheck` | |
| Tests | `npm test` | Vitest against a real PostgreSQL 16 database; migrations are applied automatically before the run |
| Production build | `npm run build` | Also type-checks |

CI (`.github/workflows/ci.yml`) runs all three on every pull request and every push to `main`, using a disposable PostgreSQL 16 service.

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

Payments use a **fake provider and simulated events**. That checks STOS's own logic. It does not test Stripe.

## Not covered yet

- A real Stripe sandbox run (authorization, capture, webhook delivery, refunds, disputes).
- Automated browser (end-to-end) tests. Screens have been checked by hand in Chromium at desktop, tablet and phone sizes, but nothing automated does it.
- Real devices (Safari, phones), a real printer, and real email delivery.
- A lint step. There is no lint script yet.
- Load testing.

## Every change should show

Typecheck, tests and build results, a note of what was not tested, and for screens a check at desktop, tablet and phone widths with no horizontal overflow and no console errors. A new migration needs a test for any new table's tenant isolation.
