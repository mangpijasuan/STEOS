# Deployment

How STEOS runs in production. For a step-by-step launch, work through the launch checklist and the hosting guide when they are available in this repository.

## Parts

| Part | Runs | Notes |
| --- | --- | --- |
| Web application | `next build`, then `next start` (port 3000) | Needs HTTPS in production |
| Database | PostgreSQL 16 | Two roles: an owner for migrations and a restricted app role for runtime |
| Order worker | `npm run worker:orders`, or a scheduler calling `POST /api/internal/expire-orders` every minute | Expires unanswered orders, reconciles refunds, purges expired data. Required |
| Email | Resend | Required in production: sign-in links are only sent by email |
| Payments | Stripe Connect | Live keys only after the sandbox scenarios have passed and the founder approves |

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | App connection (restricted role). Row-level security applies to it |
| `DATABASE_OWNER_URL` | Migrations and one-off scripts only. Never used at runtime |
| `APP_DB_ROLE` | Name of the restricted role (`siamsil_app`) |
| `APP_URL` | Public HTTPS address, used in sign-in links |
| `ORDER_TOKEN_SECRET` | At least 32 random characters; derives customers' private order links; keep it stable |
| `CRON_SECRET` | At least 32 random characters, different from the above; protects the maintenance route |
| `RESEND_API_KEY`, `LOGIN_FROM_EMAIL` | Sign-in email (a verified sender) |
| `PAYMENTS_PROVIDER` | `stripe` in production. `fake` is for local development and refuses to start in production |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe. Use test keys until launch |
| `TRUSTED_CLIENT_IP_HEADER` | A single-IP header the ingress overwrites on every request. Set it only once the origin refuses direct traffic |
| `ALERT_WEBHOOK_URL` | Optional Slack-compatible alerts, throttled |
| `ROBOTS_NOINDEX` | Set to `true` on staging only. `/robots.txt` then disallows everything, so search engines do not list a test site. Leave it unset in production. This only asks well-behaved crawlers to stay away; it is not access control (see below) |
| `ORDER_WORKER_URL` | Optional override for the worker (HTTPS, or loopback HTTP) |

Existing names are kept as they are because production depends on them; see [REBRANDING_MIGRATION.md](REBRANDING_MIGRATION.md).

## Order of operations

1. Create the two database roles and the database; the app role must not own the tables.
2. Run `npm run db:migrate` with the owner connection during the deployment window, before the new app takes traffic.
3. Start the web application and the order worker.
4. Add the Stripe Connect webhook (`/api/webhooks/stripe`) for `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.canceled`, `payment_intent.payment_failed`, `refund.created`, `refund.updated` and `refund.failed`.
5. Check `GET /api/health`. It tests database access, the worker heartbeat (stale after five minutes) and the client-IP setting, and reports `degraded` when something is wrong. Point an uptime monitor at it.

## Operations

- **Backups:** turn on scheduled database backups stored away from the database server, and restore one into an empty database at least once. Until a restore has worked, there is no backup.
- **Logs and alerts:** logs are structured JSON with sensitive fields redacted; bearer tokens in sign-in and order paths should also be redacted in access logs.
- **Rollback:** the previous application version can be redeployed. Migrations are one-way, so a migration that cannot be undone is called out in its pull request.
- **Never** use the fake payment provider, test Stripe keys or the owner connection string in a production runtime.
