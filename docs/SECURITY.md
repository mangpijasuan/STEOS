# STOS security

What is protected, how, and what is not done yet. If you find a vulnerability, tell the founder privately and do not open a public issue.

## Data and tenants

- **Tenant isolation is enforced by the database.** The running app connects as a role that does not own the tables, so row-level security applies to it. Every restaurant query runs inside `withTenant(restaurantId, ...)`, which sets the tenant for that transaction only. No tenant set means no rows. Composite foreign keys `(id, restaurant_id)` stop a row from pointing at another tenant's row. See [MULTI_TENANCY.md](MULTI_TENANCY.md).
- **The app role cannot** create or delete restaurants or change the schema. Migrations and one-off scripts use a separate owner connection that is never used at runtime.
- **Database functions** that must bypass row-level security (looking up a session or an order by token) are `security definer` with a fixed `search_path`, and execute is revoked from the public role.

## Accounts and sessions

- Staff sign in with a one-time emailed link. The link expires in 15 minutes, works once, and opens a confirmation page that is spent only after a button is pressed (so mail scanners do not use it up).
- Sign-in links and session tokens are stored only as SHA-256 hashes. The session cookie is `HttpOnly`, `SameSite=Lax` and `Secure` in production.
- Roles are **owner** and **staff**. Server routes check the role; the screens only reflect it. Staff cannot read owner data (verified: the API returns 403).
- Customers have no account. A customer's order page is reached by a private link derived from a server secret; only its hash is stored, and the page sends `Referrer-Policy: no-referrer`.

## Payments

- **No raw card data is stored or handled.** Card details go from the browser to Stripe (Stripe Elements). STOS stores Stripe identifiers and amounts.
- Webhooks verify Stripe's signature; each event is recorded and applied in one database transaction, so repeats are ignored.
- Checkout retries are protected by an idempotency key and a request fingerprint. A reused key with a different order is refused.
- Money taken in person is refunded only after staff confirm they handed it back; nothing is recorded as refunded before that.
- The fake payment provider refuses to start in production.
- **Sensitive actions need explicit approval:** refunds of in-person payments need staff confirmation, discounts typed in at the till are owner-only, and the platform's fees, pricing and live payment settings change only with the founder's approval.

## Abuse and logging

- Public endpoints share a rate limiter in PostgreSQL, keyed by a trusted client IP header when `TRUSTED_CLIENT_IP_HEADER` is set. Without it all clients share one anonymous bucket.
- Logs are one JSON object per line. Fields that look personal or secret (tokens, email, phone, customer name, card) are redacted. Operational alerts are throttled to one per key per 15 minutes.
- Secrets live in environment variables only. The order worker and the maintenance route require a strong shared secret.

## Known gaps

- No real-Stripe testing yet (only a fake provider and simulated events).
- Chargebacks and disputes are not handled in the app.
- No card-testing screening beyond rate limits.
- No external security review or penetration test.
- Backups and a tested restore are not set up yet.
- `TRUSTED_CLIENT_IP_HEADER` must be configured at the real ingress before launch.
- No two-step login for staff accounts.
