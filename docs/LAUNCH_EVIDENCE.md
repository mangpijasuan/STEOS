# Launch evidence: Zogam Cafe pickup ordering

What was actually seen, by whom, on which commit. A box in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) is ticked only when its result is written here. Items that need the real server, real devices, real accounts or the founder's decision are **not** ticked and are listed at the end.

## Run 1: Claude Code, 2026-11-27

- **Release commit checked:** `main` at `24ffaf5` (clean clone, `npm ci`, no local changes).
- **Environment:** a production-mode build (`next build`, then `next start`, `NODE_ENV=production`) on a scratch PostgreSQL 16.15 database, with `PAYMENTS_PROVIDER=stripe` and **dummy Stripe values** (no Stripe account was contacted; nothing was charged and no live key was used).
- **Not the real server.** These results show the code behaves correctly in production mode. They say nothing about staging or the hosting.

### Build and tests (clean checkout)

| Check | Result |
| --- | --- |
| `npm run typecheck` | passed |
| `npm test` on PostgreSQL 16.15 | 286 tests passed |
| `npm run build` | passed |
| `tests/tenant-isolation.test.ts` | passed, on PostgreSQL 16.15 (also re-run on its own on 2026-11-27 with `tests/auth-and-menu.test.ts` and `tests/health.test.ts`: 37 passed) |

### Health, in production mode

| Scenario | Seen |
| --- | --- |
| No `TRUSTED_CLIENT_IP_HEADER` | `/api/health` 503, `trustedProxy: failing`; `/api/live` 200; `/api/ready` 200. The app refuses to claim healthy when throttling could be bypassed. |
| `TRUSTED_CLIENT_IP_HEADER=x-forwarded-for` and `ROBOTS_NOINDEX=true`, worker running | `/api/health` 200, all checks `ok`. `/robots.txt` was `Disallow: /`. |
| Worker stopped on purpose | Last heartbeat 21:00:49 UTC. `/api/health` stayed 200 until 21:05:47 and was first 503 (`orderWorker: failing`) at 21:06:02, about five minutes after the last heartbeat. |
| Database unreachable | `/api/live` 200 (so the host does not restart-loop the app), `/api/ready` 503, `/api/health` 503 with `database: failing`. |

### Sign-in

- Five sign-in requests for one address and one client address returned 200; the sixth and seventh returned 429 "Too many attempts" (production-mode server, 2026-11-27).
- A sign-in link works once only: `tests/auth-and-menu.test.ts` "makes a link usable once only" passed.
- **Not tested:** that a real email arrives (needs Resend and the real domain).

### Backup and restore drill (development data)

`scripts/backup-restore-drill.sh`, documented in [BACKUP_RESTORE.md](BACKUP_RESTORE.md). Source: a scratch database holding the Zogam Cafe menu (72 items) and one test order. Result: dump, restore into a new empty database, and every table's row count, the 19 row-level-security tables and policies, the app role's 68 table privileges, 57 functions and 154 constraints all matched. The app role saw 0 orders with no tenant selected, in the source and in the copy. The app, started in production mode against the copy, served the known order from its link (HTTP 200, "Zogam Cafe").

**This is a drill on a development database.** It proves the procedure and the script. It does not prove the real server's scheduled backups exist or can be read back.

## Not done, and who owns it

| Area | Still needed | Owner |
| --- | --- | --- |
| Stripe | Run every scenario in [STRIPE_SANDBOX.md](STRIPE_SANDBOX.md) against a real **test** connected account and the real webhook. Nothing here has talked to Stripe. | Founder, with Claude |
| Staging | `/api/health` healthy on `steos-staging.siamsil.org`; `DATABASE_URL` and `DATABASE_OWNER_URL` use different roles; migrations ran in the deploy; worker supervised; `ROBOTS_NOINDEX` set. | Founder |
| Backups | Scheduled, off-server, retention written down; one real backup file restored using [BACKUP_RESTORE.md](BACKUP_RESTORE.md); restore time noted. | Founder, with Claude |
| Secrets | `ORDER_TOKEN_SECRET`, `CRON_SECRET` generated and stored; Resend key and domain verified; real sign-in email arrives in Gmail and one other provider. | Founder |
| Zogam content | Owner confirms every price and photo; four dishes have no printed price (Nasi Lemak, Pepper Steak, Red Snapper, Lemon Fish); hours, tax rate, pickup times, address and phone. | Founder, Zogam owner |
| Devices | Kitchen tablet and printer tested at the restaurant. | Founder |
| Live payments | Live Stripe keys, live Connect onboarding, legal entity. **Not started. Stays in sandbox until the founder approves.** | Founder |
