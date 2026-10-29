#!/bin/bash
# Puts a backup from scripts/backup-database.sh back into a DisCamp database,
# for when something went badly wrong. It REPLACES everything DisCamp keeps
# in that database (accounts, spots, photo details, check-ins, cleanups,
# Embers, reports, moderation) with what's in the backup.
#
# The usual case, a fresh Supabase project:
#   1. Make the tables: bash scripts/setup-database.sh
#   2. Put the backup in:
#        bash scripts/restore-database.sh "$HOME/Documents/DisCamp backups/discamp-2026-10-21-093000"
#   3. Photos: in Supabase > Storage > spot-photos, upload the folders inside
#      Documents/DisCamp backups/photos (drag them in). Restored photos show
#      as before, but campers can't delete their own until Supabase's Storage
#      knows they uploaded them, so delete any they ask about from the
#      dashboard.
#   4. Point the app at the new project (EXPO_PUBLIC_SUPABASE_URL and the
#      key, in .env and on expo.dev), and set up sign-in and the Edge
#      Functions again (README, MODERATION.md).
#
# The database must be at the same migration as the backup: run
# setup-database.sh with the DisCamp version the backup came from.
#
# It asks for the connection string and the password, then for "replace" to
# go ahead. It all runs in one go: if anything fails, nothing changes.
#
# Without questions (the tests): DISCAMP_DB_URL, PGPASSWORD and
# DISCAMP_RESTORE_CONFIRM=replace.

set -u
cd "$(dirname "$0")/.." || exit 1

say() { printf '\n%s\n' "$1"; }
fail() {
  printf '\n%s\n' "$1" >&2
  exit 1
}

BACKUP="${1:-}"
[ -n "$BACKUP" ] || fail 'Say which backup, like this: bash scripts/restore-database.sh "$HOME/Documents/DisCamp backups/discamp-2026-10-21-093000"'
for f in accounts.sql data.sql migrations.txt; do
  [ -f "$BACKUP/$f" ] || fail "$BACKUP doesn't look like a DisCamp backup (it has no $f)."
done

# A backup is loaded with psql, so it must have PostgreSQL's security fixes
# (scripts/postgres-client.sh): an older psql could be made to run commands
# hidden in a backup.
. scripts/postgres-client.sh
PSQL="$(pg_tool psql)"
[ -n "$PSQL" ] || fail "psql isn't installed. Run bash scripts/setup-database.sh first (it installs it)."
pg_require_patched "$PSQL"

# A backup made by a pg_dump with the 2025 fix starts with \restrict, which
# stops psql from running anything but SQL while it loads. One without it
# came from an older pg_dump (or was edited): load it only if you're sure
# it's yours, with DISCAMP_RESTORE_UNPROTECTED=yes.
for f in accounts.sql data.sql; do
  if ! head -n 20 "$BACKUP/$f" | grep -q '^\\restrict '; then
    [ "${DISCAMP_RESTORE_UNPROTECTED:-}" = "yes" ] ||
      fail "$BACKUP/$f wasn't made by an up-to-date pg_dump (it has no \\restrict line), so it isn't protected against commands hidden in it. If you're sure it's your own backup, run this again with DISCAMP_RESTORE_UNPROTECTED=yes in front."
  fi
done

DB="${DISCAMP_DB_URL:-}"
if [ -z "$DB" ]; then
  say "In Supabase, click Connect, choose Session pooler, and copy the connection string."
  printf 'Paste it here and press Return: '
  IFS= read -r DB
fi
DB="$(printf '%s' "$DB" | sed -e 's/:\[YOUR-PASSWORD\]//' -e "s/^[[:space:]\"']*//" -e "s/[[:space:]\"']*\$//")"
case "$DB" in
  postgres://* | postgresql://*) ;;
  *) fail "That doesn't look like a connection string. It should start with postgresql://" ;;
esac
if [ -z "${PGPASSWORD:-}" ]; then
  printf 'Database password (it won'"'"'t show as you type): '
  IFS= read -r -s PGPASSWORD
  printf '\n'
fi
export PGPASSWORD
export PGCONNECT_TIMEOUT=20

run() { "$PSQL" "$DB" -X -q -v ON_ERROR_STOP=1 -At "$@"; }

say "Connecting..."
run -c 'select 1' >/dev/null || fail "Couldn't connect (the error is above)."
[ "$(run -c "select to_regclass('public.spots') is not null")" = "t" ] ||
  fail "This database has no DisCamp tables yet. Run bash scripts/setup-database.sh on it first."

# Same migrations as the backup, or the data won't fit.
if [ "$(run -c "select to_regclass('supabase_migrations.schema_migrations') is not null")" = "t" ]; then
  here="$(run -c 'select version from supabase_migrations.schema_migrations order by version')"
else
  here=""
fi
if [ "$here" != "$(cat "$BACKUP/migrations.txt")" ]; then
  fail "This database isn't at the same migration as the backup (backup: $(tail -n 1 "$BACKUP/migrations.txt" 2>/dev/null), here: $(printf '%s\n' "$here" | tail -n 1)). Run setup-database.sh from the DisCamp version the backup came from."
fi

existing="$(run -c 'select count(*) from auth.users')"
say "This replaces everything DisCamp keeps in this database ($existing account(s) now) with the backup in:"
printf '%s\n' "$BACKUP"
answer="${DISCAMP_RESTORE_CONFIRM:-}"
if [ -z "$answer" ]; then
  printf 'Type replace to go ahead: '
  IFS= read -r answer
fi
[ "$answer" = "replace" ] || fail "Stopped. Nothing changed."

# Every DisCamp table, emptied, then filled from the backup. Accounts go
# first, the normal way, so everything that hangs off them goes with them;
# then triggers are off while the backup loads (its rows already passed every
# check once, and its Embers are already counted).
tables="$(run -c "select string_agg(format('%I.%I', schemaname, tablename), ', ' order by schemaname, tablename) from pg_tables where schemaname in ('public', 'moderation')")"
[ -n "$tables" ] || fail "Couldn't list DisCamp's tables."

say "Restoring..."
run -1 \
  -c 'delete from auth.users' \
  -c 'set session_replication_role = replica' \
  -c "truncate table $tables cascade" \
  -f "$BACKUP/accounts.sql" \
  -f "$BACKUP/data.sql" \
  -c 'set session_replication_role = origin' >/dev/null ||
  fail "Stopped: the restore didn't finish (the error is above), so nothing changed."
run -c "notify pgrst, 'reload schema'" >/dev/null 2>&1 || true

say "Restored."
printf 'Accounts: %s, spots: %s, photos: %s, cleanups: %s\n' "$(run -c 'select count(*) from auth.users')" \
  "$(run -c 'select count(*) from public.spots')" "$(run -c 'select count(*) from public.spot_photos')" \
  "$(run -c 'select count(*) from public.cleanup_tasks')"
printf 'Next: upload the photos (step 3 at the top of this file).\n'
