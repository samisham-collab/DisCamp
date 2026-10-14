#!/bin/bash
# Sets up DisCamp's Supabase database, or brings it up to date: runs each
# file in supabase/migrations that hasn't run yet, in order, then
# supabase/seed.sql (the starter spots).
#
# Run it from Terminal, in the DisCamp folder:
#   bash scripts/setup-database.sh
#
# It asks for two things: the Session pooler connection string (Supabase >
# Connect) and the database password. Neither is saved anywhere.
#
# Each file runs all-or-nothing, and the database remembers which ones have
# run (in supabase_migrations.schema_migrations, the same list the Supabase
# CLI keeps), so it's safe to run this again: after an update, or after a run
# that stopped partway.
#
# A database you set up by hand in the SQL Editor has no such list. Tell the
# script the last file that finished there, and it starts after it:
#   bash scripts/setup-database.sh --after 0005

set -u
cd "$(dirname "$0")/.." || exit 1

AFTER=""
if [ "${1:-}" = "--after" ]; then
  AFTER="${2:-}"
  case "$AFTER" in
    [0-9][0-9][0-9][0-9]) ;;
    *)
      printf 'Use it like this: bash scripts/setup-database.sh --after 0005\n' >&2
      exit 1
      ;;
  esac
elif [ $# -gt 0 ]; then
  printf 'Run it with no options, or with --after 0005 (see the top of this file).\n' >&2
  exit 1
fi

say() { printf '\n%s\n' "$1"; }
fail() {
  printf '\n%s\n' "$1" >&2
  exit 1
}

# 1. psql, the Postgres command-line tool (Homebrew's libpq package).
PSQL="$(command -v psql || true)"
if [ -z "$PSQL" ]; then
  command -v brew >/dev/null || fail "Homebrew isn't installed. Install it from https://brew.sh, then run this again."
  if [ ! -x "$(brew --prefix libpq 2>/dev/null)/bin/psql" ]; then
    say "Installing psql (one time)..."
    brew install libpq || fail "Couldn't install psql. Run 'brew install libpq' and look at what it says."
  fi
  PSQL="$(brew --prefix libpq)/bin/psql"
fi

# 2. Where the database is.
say "In Supabase, click Connect, choose Session pooler, and copy the connection string."
printf 'Paste it here and press Return: '
IFS= read -r DB
# Leave out the password placeholder (and any quotes or spaces around the paste).
DB="$(printf '%s' "$DB" | sed -e 's/:\[YOUR-PASSWORD\]//' -e "s/^[[:space:]\"']*//" -e "s/[[:space:]\"']*\$//")"
case "$DB" in
  postgres://* | postgresql://*) ;;
  *) fail "That doesn't look like a connection string. It should start with postgresql://" ;;
esac

# 3. The password, read without showing it. Only this run of the script sees it.
printf 'Database password (it won'"'"'t show as you type): '
IFS= read -r -s PGPASSWORD
printf '\n'
export PGPASSWORD
export PGCONNECT_TIMEOUT=20

run() { "$PSQL" "$DB" -X -q -v ON_ERROR_STOP=1 -c 'set client_min_messages = warning' "$@"; }

say "Connecting..."
if ! run -c 'select 1' >/dev/null; then
  fail "Couldn't connect. If it says 'password authentication failed', reset the password in Supabase (Project Settings > Database) and run this again. If it timed out, check your internet connection, or try another network."
fi

# 4. Which files have run already.
run -c 'create schema if not exists supabase_migrations' \
  -c 'create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)' \
  >/dev/null || fail "Couldn't set up the list of files that have run (the error is above)."
done_list="$(run -At -c 'select version from supabase_migrations.schema_migrations')"
if [ -n "$AFTER" ]; then
  for f in supabase/migrations/[0-9]*.sql; do
    name="$(basename "$f" .sql)"
    version="${name%%_*}"
    if [ "$version" \< "$AFTER" ] || [ "$version" = "$AFTER" ]; then
      run -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '${name#*_}') on conflict (version) do nothing" \
        >/dev/null || fail "Couldn't record $f as already run."
    fi
  done
  done_list="$(run -At -c 'select version from supabase_migrations.schema_migrations')"
elif [ -z "$done_list" ] && [ "$(run -At -c "select to_regclass('public.spots') is not null")" = "t" ]; then
  fail "This database already has DisCamp tables, but no record of which files ran (they were run by hand in the SQL Editor). If you know the last file that finished, run: bash scripts/setup-database.sh --after 0005 (with that file's number). If you're not sure, the clean way is a fresh Supabase project."
fi

# 5. Each file that hasn't run yet, in order, all-or-nothing, then the
# starter spots (always: the seed only refreshes the starter spots' own info).
for f in supabase/migrations/[0-9]*.sql; do
  name="$(basename "$f" .sql)"
  version="${name%%_*}"
  if printf '%s\n' "$done_list" | grep -qx "$version"; then
    printf 'Already done: %s\n' "$f"
    continue
  fi
  printf 'Running %s ... ' "$f"
  if run -1 -f "$f" \
    -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '${name#*_}')" >/dev/null; then
    printf 'done\n'
  else
    fail "Stopped: $f didn't finish (the error is above), so none of it was kept and nothing after it ran. Send a screenshot of this window."
  fi
done
printf 'Running supabase/seed.sql ... '
run -1 -f supabase/seed.sql >/dev/null || fail "Stopped: the starter spots didn't load (the error is above)."
printf 'done\n'

# 6. What's there now.
spots="$(run -At -c 'select count(*) from public.spots')"
tables="$(run -At -c "select string_agg(table_name, ', ' order by table_name) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")"
bucket="$(run -At -c "select count(*) from storage.buckets where id = 'spot-photos'")"

say "All done."
printf 'Tables: %s\n' "$tables"
printf 'Starter spots: %s\n' "$spots"
if [ "$bucket" = "1" ]; then
  printf 'Photo storage: ready (the spot-photos bucket exists)\n'
else
  printf 'Photo storage: NOT set up. Follow "Photos" in README.md to add the spot-photos bucket by hand.\n'
fi
