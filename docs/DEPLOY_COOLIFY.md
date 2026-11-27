# Deploying STEOS with Coolify

This guide gets STEOS running on a Coolify server as a staging site. Do staging first, on its own subdomain, and only move to the real address after the [launch checklist](LAUNCH_CHECKLIST.md) is done. It was checked against the `Dockerfile` in this repository; the Coolify menu names are from memory of Coolify v4, so check them against your version.

## What runs

| Part | How | Notes |
| --- | --- | --- |
| Web app | the `Dockerfile`, default command `npm start`, port 3000 | needs a domain with HTTPS |
| Order worker | the same image, command `npm run worker:orders` | no domain; expires unanswered orders, reconciles refunds |
| Database | PostgreSQL 16 | separate from any other site on the server |

## 1. Database

1. Add a PostgreSQL 16 database in its own Coolify project (not the project of another site) and turn on scheduled backups.
2. In its terminal, create the two roles and the database. The app role must not own the tables, which is what makes row-level security apply to it:

   ```sql
   create role siamsil_owner login password '<strong password 1>' createdb;
   create role siamsil_app   login password '<strong password 2>';
   create database siamsil owner siamsil_owner;
   ```

3. Restore a backup into an empty database at least once before launch. Until a restore has worked, there is no backup.

## 2. Web app

1. Add an application from the GitHub repository, branch `main`, build pack **Dockerfile**, port **3000**.
2. Give it the staging domain so Coolify issues HTTPS. Use `/api/ready` for traffic readiness if supported; Docker uses `/api/live` for liveness. Verify Coolify does not restart the app solely on a readiness failure.
3. Set these environment variables. Use Coolify's secret setting for secrets and never paste them into chat or commit them:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | connection string for `siamsil_app` |
   | `APP_DB_ROLE` | `siamsil_app` |
   | `APP_URL` | `https://<staging domain>` (must be HTTPS) |
   | `ORDER_TOKEN_SECRET` | at least 32 random characters; keep it stable |
   | `CRON_SECRET` | at least 32 random characters, different from the one above |
   | `RESEND_API_KEY`, `LOGIN_FROM_EMAIL` | needed to sign in: in production the sign-in link is only emailed |
   | `PAYMENTS_PROVIDER` | `stripe` (the fake provider refuses to start in production) |
   | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe **test** keys while staging |

   Leave `TRUSTED_CLIENT_IP_HEADER` empty until Cloudflare is in front and the origin refuses direct traffic.

   On staging only, also set `ROBOTS_NOINDEX=true` so search engines do not index the test site. For stronger protection, put staging behind a login or an allow-list at Cloudflare (for example Cloudflare Access) and add a response header `X-Robots-Tag: noindex, nofollow` there; neither needs a code change.

4. Run the migration job below before enabling traffic. `/api/live` must return 200, `/api/ready` must return 200 when the database responds, and `/api/health` must report operational checks. Missing trusted proxy configuration causes HTTP 503 on `/api/health`; it is a production launch blocker, not a liveness failure.

## 3. Migrations and the first restaurant

Run these in a separate one-off container using the same image, with `DATABASE_OWNER_URL` injected only into that job. Never supply the owner URL to the web or worker containers. Remove the job and its credentials after completion. No `.env` file is needed.

```bash
npm run db:migrate
ZOGAM_OWNER_EMAIL=owner@example.com npm run db:seed:zogam
```

Run `db:migrate` before enabling traffic for any release that adds a migration. The importer is one-time and refuses to run twice.

## 4. Order worker

Add a second application from the same repository and image, with start command `npm run worker:orders`, the same `APP_URL` and `CRON_SECRET`, and no domain. Disable the inherited HTTP health check for this worker (Docker `--no-healthcheck` or equivalent); monitor worker heartbeat via `/api/health`. Leave `ORDER_WORKER_URL` unset so the worker calls the HTTPS `APP_URL`; the worker refuses plain HTTP unless the address is loopback, so an internal Docker address will not work. Alternatively use a Coolify scheduled task that calls `POST /api/internal/expire-orders` every minute with `Authorization: Bearer <CRON_SECRET>`.

Stop the worker once on purpose and confirm `/api/health` reports it after about five minutes.

## 5. Check it

Sign in as the owner through the emailed link, place a test order, and run the Stripe sandbox scenarios in the launch checklist.

## Notes

- The image keeps dev dependencies on purpose, so the same image can run migrations and the importer (`tsx` is a dev dependency).
- The container runs as the unprivileged `node` user and has a built-in liveness check against `/api/live`.
- Close the Coolify dashboard's plain-HTTP address (`<server IP>:8000`) once its HTTPS domain works, and turn on two-step login for the Coolify account.
