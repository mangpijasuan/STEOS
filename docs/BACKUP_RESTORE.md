# Backup and restore

The database is the only place STEOS keeps customer and order data. Photos are stored in it too. Until a backup has been restored into an empty database and the app has been started against the copy, there is no backup. This is section 7 of [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) written as steps.

## What to back up

| Item | How | Notes |
| --- | --- | --- |
| The PostgreSQL database | `pg_dump --format=custom` (the drill script does this) | Includes tables, row-level security, grants, functions and photos. |
| Environment values | Kept by the founder in a password manager, **not** in the repository | Above all `ORDER_TOKEN_SECRET`, `CRON_SECRET`, and the Stripe and email keys. |
| Database roles (`siamsil_owner`, `siamsil_app`) | Created by hand on a new server (see [DEPLOYMENT.md](DEPLOYMENT.md)) | Roles live in the server, not in a database dump. Grants are inside the dump and re-apply if the roles exist first. |

`ORDER_TOKEN_SECRET`: customers' order links are derived from it. A restored database still finds every order a customer already holds a link for, because lookups use a stored hash. If the secret is lost or changed, new links and checkout retries are derived differently, so keep it stable and keep a copy away from the server.

## Schedule (founder, on the real server)

Turn on scheduled backups in the hosting panel (Coolify: the database's Backups tab) or with a scheduler running `pg_dump`.

- At least once a day, and before every deploy that has a migration.
- Stored **away from the database server** (object storage or another machine), with at least 14 days kept.
- Alert on a failed backup.
- Encrypt copies that leave the server: the dump contains customer names and phone numbers.

The schedule on the real server is not something this repository can prove. Record the date it was turned on in the launch evidence.

## The drill

`scripts/backup-restore-drill.sh` dumps a database, restores the dump into a new empty database next to it, and compares the two. It never writes to the source.

```bash
SOURCE_OWNER_URL='postgres://OWNER:PASSWORD@HOST:5432/DATABASE' \
APP_DATABASE_URL='postgres://APP_ROLE:PASSWORD@HOST:5432/DATABASE' \
scripts/backup-restore-drill.sh
```

It checks, and fails if any differ:

1. Row counts of every table.
2. Tables with row-level security, the policies, the app role's table privileges, database functions and constraints (these hold tenant isolation, so a copy that lost them would leak between restaurants).
3. That the app role, with no tenant selected, sees no orders, in the source and in the copy.

Set `KEEP_RESTORE=1` to keep the restored database (`RESTORE_DB`, default `steos_restore_drill`), then run step "Start the app on the copy" below. Delete the copy afterwards.

## Restore procedure (real incident)

1. Stop the app and the order worker so nothing writes to the damaged database.
2. Create a new empty database. Do not restore over the old one until the copy has been checked.
3. `pg_restore --dbname=<new database> --exit-on-error <dump file>` with an owner connection.
4. Run `npm run db:migrate` against the copy. It applies any migration the dump predates, and does nothing if the dump is current.
5. Point `DATABASE_URL` (app role) and `DATABASE_OWNER_URL` at the copy, with the **same** `ORDER_TOKEN_SECRET`, and start the app.
6. Check `/api/ready` returns 200, `/api/health` returns `ok`, and a recent order opens from its link.
7. Orders paid in Stripe after the last backup exist in Stripe but not in the copy. Stripe re-delivers webhook events for a few days, and the dashboard lists the payments: compare them with the kitchen and handle any gap by hand. Do not refund by guessing: look at each payment.

### Restoring on a new server

Roles are not inside a database dump, so create them first, exactly as in [DEPLOYMENT.md](DEPLOYMENT.md): the owner role and the restricted app role (which must not own the tables), with the same names as before. Then create the empty database and run the restore above. The dump carries the table privileges, so the app role's grants return with it, and the drill's checks (row security, grants, tenant isolation) tell you whether they did. Set the app role's password with `alter role ... password ...` if it differs from the old server and update `DATABASE_URL`.

### Start the app on the copy

```bash
DATABASE_URL='postgres://APP_ROLE:PASSWORD@HOST:5432/steos_restore_drill' \
ORDER_TOKEN_SECRET='the same value as production' \
npx next start -p 3302
curl -i http://127.0.0.1:3302/api/ready          # expect 200
curl -i http://127.0.0.1:3302/api/orders/<link token of a known order>   # expect 200
```

## What the drill does not prove

- That the real server's backup schedule runs, or that its files can be read back from the remote storage. Restore one of **those** files once, with the steps above.
- How long a restore takes at real data sizes. Time it and write it down.
- Point-in-time recovery. A daily dump can lose up to a day of orders. If that is too much, ask for continuous archiving (WAL) before the first busy week.
