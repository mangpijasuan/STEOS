#!/usr/bin/env bash
# Backup and restore drill: dump a STEOS database, restore it into a new empty database and prove the copy is whole.
# It never writes to the source. It creates (and by default drops) one scratch database next to it.
#
#   SOURCE_OWNER_URL=postgres://owner:pw@host:5432/steos  RESTORE_DB=steos_restore_drill  scripts/backup-restore-drill.sh
#
# Needs pg_dump, pg_restore and psql (PostgreSQL 16 client tools) and an owner-level connection (it creates a database).
# Set KEEP_RESTORE=1 to keep the restored database, for example to start the app against it.
set -euo pipefail

: "${SOURCE_OWNER_URL:?Set SOURCE_OWNER_URL to the owner connection string of the database to back up}"
RESTORE_DB="${RESTORE_DB:-steos_restore_drill}"
APP_ROLE="${APP_DB_ROLE:-siamsil_app}"
DUMP="${DUMP_FILE:-$(mktemp -t steos-backup-XXXXXX.dump)}"

# Same server and credentials as the source, different database name.
ADMIN_URL="$(printf '%s' "$SOURCE_OWNER_URL" | sed -E 's#/[^/?]+(\?.*)?$#/postgres\1#')"
TARGET_URL="$(printf '%s' "$SOURCE_OWNER_URL" | sed -E "s#/[^/?]+(\\?.*)?\$#/${RESTORE_DB}\\1#")"
[ "$TARGET_URL" != "$SOURCE_OWNER_URL" ] || { echo "RESTORE_DB must differ from the source database" >&2; exit 2; }

q() { psql "$1" -X -At -v ON_ERROR_STOP=1 -c "$2"; }
fail=0
skipped=0
check() { # name, source value, restored value
  if [ "$2" = "$3" ]; then printf 'PASS  %-34s %s\n' "$1" "$2"; else printf 'FAIL  %-34s source=%s restored=%s\n' "$1" "$2" "$3"; fail=1; fi
}

echo "1. Dump  -> $DUMP"
pg_dump "$SOURCE_OWNER_URL" --format=custom --no-password --file="$DUMP"
echo "   size: $(wc -c <"$DUMP") bytes, $(pg_restore --list "$DUMP" | grep -c ' TABLE DATA ') tables with data"

echo "2. Restore into a new empty database ($RESTORE_DB)"
q "$ADMIN_URL" "drop database if exists \"$RESTORE_DB\""
q "$ADMIN_URL" "create database \"$RESTORE_DB\""
pg_restore --dbname="$TARGET_URL" --no-password --exit-on-error "$DUMP"

echo "3. Compare the copy with the source"
tables="$(q "$SOURCE_OWNER_URL" "select tablename from pg_tables where schemaname='public' order by 1")"
for t in $tables; do
  check "rows: $t" "$(q "$SOURCE_OWNER_URL" "select count(*) from public.\"$t\"")" "$(q "$TARGET_URL" "select count(*) from public.\"$t\"")"
done
rls="select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity"
check "tables with row security enabled" "$(q "$SOURCE_OWNER_URL" "$rls")" "$(q "$TARGET_URL" "$rls")"
pol="select count(*) from pg_policies where schemaname='public'"
check "row-level security policies" "$(q "$SOURCE_OWNER_URL" "$pol")" "$(q "$TARGET_URL" "$pol")"
grants="select count(*) from information_schema.role_table_grants where grantee='$APP_ROLE' and table_schema='public'"
check "app role table privileges" "$(q "$SOURCE_OWNER_URL" "$grants")" "$(q "$TARGET_URL" "$grants")"
fns="select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
check "database functions" "$(q "$SOURCE_OWNER_URL" "$fns")" "$(q "$TARGET_URL" "$fns")"
chk="select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'"
check "constraints (incl. composite FKs)" "$(q "$SOURCE_OWNER_URL" "$chk")" "$(q "$TARGET_URL" "$chk")"

echo "4. Tenant isolation survives: the app role, with no tenant set, must see no restaurant rows"
if [ -n "${APP_DATABASE_URL:-}" ]; then
  APP_TARGET="$(printf '%s' "$APP_DATABASE_URL" | sed -E "s#/[^/?]+(\\?.*)?\$#/${RESTORE_DB}\\1#")"
  check "source: app role sees 0 orders" "0" "$(q "$APP_DATABASE_URL" "select count(*) from orders")"
  check "restored: app role sees 0 orders" "0" "$(q "$APP_TARGET" "select count(*) from orders")"
else
  echo "SKIP  set APP_DATABASE_URL (the app role's connection string) to run this check"; skipped=1
fi

[ "${KEEP_RESTORE:-0}" = "1" ] || q "$ADMIN_URL" "drop database \"$RESTORE_DB\"" >/dev/null
[ "${KEEP_DUMP:-0}" = "1" ] || rm -f "$DUMP"
if [ $fail -eq 0 ]; then echo "RESULT: restore verified$([ $skipped -eq 1 ] && echo ' (tenant check skipped)')"; else echo "RESULT: restore did NOT match" >&2; exit 1; fi
