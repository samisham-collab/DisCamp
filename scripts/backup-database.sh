#!/bin/bash
# Saves a copy of DisCamp's database on this Mac. Supabase's free plan keeps
# no backups, so this is the backup: run it every week or so, and before
# anything big (a new migration, a move to another project).
#
# Run it from Terminal, in the DisCamp folder:
#   bash scripts/backup-database.sh
#
# It asks for the Session pooler connection string (Supabase > Connect) and
# the database password, like setup-database.sh. Neither is saved anywhere.
#
# Each backup is a folder in Documents/DisCamp backups, named by date:
#   accounts.sql    who has an account (Supabase Auth's users and sign-in
#                   identities, with email addresses)
#   data.sql        everything DisCamp keeps: spots, photo details,
#                   check-ins, cleanups, Embers, reports, blocks, moderation
#   files.txt       the files in Storage, with their sizes
#   migrations.txt  which migrations had run, so a restore goes into a
#                   database at the same version
# Photos are saved once each in a photos folder next to the backups (not
# again every week; previews are skipped, the app doesn't need them), and
# leave it when they're deleted from DisCamp. The newest 10 backups are kept
# and older ones removed, so something deleted from DisCamp is gone from the
# backups within 10 runs.
#
# Backups hold campers' email addresses. Keep them on this Mac (the folder is
# readable only by you) and never share or upload them.
#
# To put a backup back: scripts/restore-database.sh (see the top of it).
#
# Without questions (a scheduled run, or the tests): set DISCAMP_DB_URL and
# PGPASSWORD, and optionally DISCAMP_BACKUP_DIR (where backups go),
# DISCAMP_SUPABASE_URL (where photos are, otherwise read from .env) and
# DISCAMP_SKIP_PHOTOS=1.

set -u
umask 077
cd "$(dirname "$0")/.." || exit 1

say() { printf '\n%s\n' "$1"; }
fail() {
  printf '\n%s\n' "$1" >&2
  exit 1
}

# 1. psql and pg_dump (Homebrew's libpq has both, and stays up to date).
tool() {
  local libpq
  libpq="$(brew --prefix libpq 2>/dev/null || true)"
  if [ -n "$libpq" ] && [ -x "$libpq/bin/$1" ]; then
    printf '%s\n' "$libpq/bin/$1"
  else
    command -v "$1" || true
  fi
}
PSQL="$(tool psql)"
PG_DUMP="$(tool pg_dump)"
if [ -z "$PSQL" ] || [ -z "$PG_DUMP" ]; then
  command -v brew >/dev/null || fail "Homebrew isn't installed. Install it from https://brew.sh, then run this again."
  say "Installing psql and pg_dump (one time)..."
  brew install libpq || fail "Couldn't install them. Run 'brew install libpq' and look at what it says."
  PSQL="$(tool psql)"
  PG_DUMP="$(tool pg_dump)"
fi

# 2. Where the database is, and its password.
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
server="$(run -c 'show server_version_num')" ||
  fail "Couldn't connect. If it says 'password authentication failed', check the password (Project Settings > Database). If it timed out, check your internet connection."
[ "$(run -c "select to_regclass('public.spots') is not null")" = "t" ] ||
  fail "This database has no DisCamp tables. Check you copied the right project's connection string."

# pg_dump must be at least as new as the database (Supabase runs 15 or 17).
server_major="$((server / 10000))"
dump_major="$("$PG_DUMP" --version | sed -E 's/^pg_dump \(PostgreSQL\) ([0-9]+).*/\1/')"
if [ "$dump_major" -lt "$server_major" ] 2>/dev/null; then
  fail "pg_dump $dump_major is older than the database ($server_major). Run 'brew upgrade libpq', then run this again."
fi

# 3. The backup folder.
ROOT="${DISCAMP_BACKUP_DIR:-$HOME/Documents/DisCamp backups}"
mkdir -p "$ROOT" || fail "Couldn't make $ROOT."
chmod 700 "$ROOT"
DIR="$ROOT/discamp-$(date +%Y-%m-%d-%H%M%S)"
mkdir "$DIR" || fail "Couldn't make $DIR."

dump() { "$PG_DUMP" "$DB" --data-only --no-owner --no-privileges --format=plain "$@"; }

say "Saving accounts..."
dump --table=auth.users --table=auth.identities --file="$DIR/accounts.sql" ||
  fail "Couldn't save the accounts (the error is above). Nothing was kept from this run: delete $DIR."

say "Saving DisCamp's data..."
dump --schema=public --schema=moderation --file="$DIR/data.sql" ||
  fail "Couldn't save the data (the error is above). Nothing was kept from this run: delete $DIR."

run -c "select name || ' ' || coalesce(metadata ->> 'size', '?') from storage.objects order by name" >"$DIR/files.txt" ||
  fail "Couldn't list the files in Storage (the error is above)."
if [ "$(run -c "select to_regclass('supabase_migrations.schema_migrations') is not null")" = "t" ]; then
  run -c 'select version from supabase_migrations.schema_migrations order by version' >"$DIR/migrations.txt" ||
    fail "Couldn't read which migrations ran (the error is above)."
else
  : >"$DIR/migrations.txt"
fi

# 4. Photos, each once (only the ones this Mac doesn't have yet).
photos_note="skipped"
if [ "${DISCAMP_SKIP_PHOTOS:-}" != "1" ]; then
  URL="${DISCAMP_SUPABASE_URL:-}"
  if [ -z "$URL" ] && [ -f .env ]; then
    URL="$(sed -n 's/^EXPO_PUBLIC_SUPABASE_URL=//p' .env | tr -d "\"' \r" | head -n 1)"
  fi
  if [ -z "$URL" ]; then
    photos_note="skipped (no EXPO_PUBLIC_SUPABASE_URL in .env)"
  else
    say "Saving new photos..."
    mkdir -p "$ROOT/photos"
    got=0
    failed=0
    while IFS= read -r name; do
      # Only names shaped like DisCamp's ("<camper id>/<photo id>.jpg").
      [[ "$name" =~ ^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$ ]] || continue
      [ -s "$ROOT/photos/$name" ] && continue
      mkdir -p "$ROOT/photos/${name%%/*}"
      if curl -fs --max-time 60 -o "$ROOT/photos/$name.part" "${URL%/}/storage/v1/object/public/spot-photos/$name"; then
        mv "$ROOT/photos/$name.part" "$ROOT/photos/$name"
        got=$((got + 1))
      else
        rm -f "$ROOT/photos/$name.part"
        failed=$((failed + 1))
      fi
    done < <(run -c "select name from storage.objects where bucket_id = 'spot-photos' order by name")
    photos_note="$got new"
    [ "$failed" -gt 0 ] && photos_note="$photos_note, $failed couldn't download (they'll be tried next time)"

    # Photos deleted from DisCamp leave the copies too (the privacy policy
    # promises it). If most copies would go at once, Storage looks emptied by
    # mistake: then they stay, for a restore.
    run -c "select name from storage.objects where bucket_id = 'spot-photos'" | sort >"$ROOT/photos/.in-storage"
    (cd "$ROOT/photos" && find . -name '*.jpg' -type f | sed 's|^\./||' | sort) >"$ROOT/photos/.copies"
    gone="$(comm -23 "$ROOT/photos/.copies" "$ROOT/photos/.in-storage")"
    copies="$(grep -c . "$ROOT/photos/.copies" || true)"
    gone_count="$(printf '%s' "$gone" | grep -c . || true)"
    if [ "$gone_count" -gt 0 ] && [ "$((gone_count * 4))" -gt "$copies" ] && [ "$copies" -ge 20 ]; then
      photos_note="$photos_note; $gone_count of $copies photo copies are no longer in Storage, so none were removed (if Storage was emptied by mistake, restore them from $ROOT/photos)"
    elif [ "$gone_count" -gt 0 ]; then
      printf '%s\n' "$gone" | while IFS= read -r name; do
        [[ "$name" =~ ^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$ ]] && rm -f -- "$ROOT/photos/$name"
      done
      photos_note="$photos_note, $gone_count deleted from DisCamp removed"
    fi
    rm -f "$ROOT/photos/.in-storage" "$ROOT/photos/.copies"
  fi
fi

# 5. Keep the newest 10 backups.
removed=0
while IFS= read -r old; do
  case "$old" in
    "$ROOT"/discamp-*) rm -rf -- "$old" && removed=$((removed + 1)) ;;
  esac
done < <(ls -1d "$ROOT"/discamp-* 2>/dev/null | sort -r | tail -n +11)

say "Backup saved."
printf 'Folder: %s\n' "$DIR"
printf 'Accounts: %s, spots: %s, photos: %s\n' "$(run -c 'select count(*) from auth.users')" \
  "$(run -c 'select count(*) from public.spots')" "$(run -c 'select count(*) from public.spot_photos')"
printf 'Size: %s\n' "$(du -sh "$DIR" | cut -f1)"
printf 'Photo files saved: %s\n' "$photos_note"
[ "$removed" -gt 0 ] && printf 'Removed %s older backup(s); the newest 10 are kept.\n' "$removed"
exit 0
