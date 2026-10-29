# Shared by setup-database.sh, backup-database.sh and restore-database.sh
# (sourced, not run on its own). It finds psql and pg_dump, makes sure they
# have PostgreSQL's security fixes, and makes every connection encrypted.
#
# Why: in 2025-2026 PostgreSQL fixed several holes in the client tools
# themselves (psql, pg_dump, libpq), where a malicious or hijacked database
# server, or a crafted backup, could run code on this Mac. For example:
#   CVE-2026-18408  psql: restoring a dump could run commands (\unrestrict)
#   CVE-2026-19385  pg_dump: heap overflow, runs code as the Mac user
#   CVE-2026-6477   libpq: server could overwrite psql's or pg_dump's memory
#   CVE-2026-6464   psql: a failed COPY FROM STDIN could run data as commands
# The scripts refuse to run with tools older than the fixed releases.
#
# When PostgreSQL ships another client fix, raise the numbers below. The list
# is at https://www.postgresql.org/support/security/

# The oldest release of each major version with every client fix to date
# (PostgreSQL 18.6, 17.11, 16.15, 15.19 and 14.24, August 13, 2026). Prints
# the minor version needed, or "none" for versions that no longer get fixes.
pg_client_minimum() {
  case "$1" in
    14) echo 24 ;;
    15) echo 19 ;;
    16) echo 15 ;;
    17) echo 11 ;;
    18) echo 6 ;;
    *)
      if [ "$1" -gt 18 ] 2>/dev/null; then echo 0; else echo none; fi
      ;;
  esac
}

# psql or pg_dump: Homebrew's libpq if it's installed (it's the one
# `brew upgrade` keeps current), otherwise whatever is on the PATH.
pg_tool() {
  local libpq
  libpq="$(brew --prefix libpq 2>/dev/null || true)"
  if [ -n "$libpq" ] && [ -x "$libpq/bin/$1" ]; then
    printf '%s\n' "$libpq/bin/$1"
  else
    command -v "$1" || true
  fi
}

# "MAJOR MINOR" of a psql or pg_dump, from its --version line.
pg_tool_version() {
  "$1" --version 2>/dev/null | sed -nE 's/^[a-z_]+ \(PostgreSQL\) ([0-9]+)\.([0-9]+).*/\1 \2/p' | head -n 1
}

# True if the tool has every client security fix to date.
pg_tool_patched() {
  local version major minor need
  version="$(pg_tool_version "$1")"
  [ -n "$version" ] || return 1
  major="${version% *}"
  minor="${version#* }"
  need="$(pg_client_minimum "$major")"
  [ "$need" != "none" ] && [ "$minor" -ge "$need" ]
}

# Stops the script unless the tool at $1 is patched. A Homebrew libpq that's
# behind is upgraded first (set DISCAMP_NO_BREW_UPGRADE=1 to skip that).
pg_require_patched() {
  local path="$1" name have libpq
  name="$(basename "$path")"
  pg_tool_patched "$path" && return 0
  have="$("$path" --version 2>/dev/null | head -n 1)"
  libpq="$(brew --prefix libpq 2>/dev/null || true)"
  if [ -n "$libpq" ] && [ "$path" = "$libpq/bin/$name" ] && [ -z "${DISCAMP_NO_BREW_UPGRADE:-}" ]; then
    printf '\n%s\n' "Your $name (${have:-unknown version}) is missing PostgreSQL security fixes. Updating it with 'brew upgrade libpq'..."
    brew upgrade libpq >&2 || true
    pg_tool_patched "$path" && return 0
    have="$("$path" --version 2>/dev/null | head -n 1)"
  fi
  printf '\n%s\n' "Stopped: $name (${have:-unknown version}) has known security holes that let a bad server or backup run code on this Mac. Update it and run this again: 'brew upgrade libpq' (or, if this $name came from Postgres.app or another install, update that). It needs PostgreSQL 18.6, 17.11, 16.15, 15.19 or 14.24 or newer." >&2
  exit 1
}

# Says so (without stopping) when the database server itself is missing
# PostgreSQL's security fixes. $1 is its server_version_num, like 170004 for
# 17.4. Supabase doesn't apply these on its own: the project owner does, from
# the dashboard, with a few minutes offline.
pg_server_warn() {
  local num="$1" major minor need
  case "$num" in '' | *[!0-9]*) return 0 ;; esac
  major=$((num / 10000))
  minor=$((num % 10000))
  need="$(pg_client_minimum "$major")"
  if [ "$need" = "none" ] || [ "$minor" -lt "$need" ]; then
    printf '\n%s\n' "Heads up: the database runs PostgreSQL $major.$minor, which is missing security fixes (PostgreSQL 18.6, 17.11 and 15.19 have them). In Supabase, open Project Settings > General and click Upgrade project. The project goes offline for a few minutes, so back up first (bash scripts/backup-database.sh)." >&2
    return 1
  fi
  return 0
}

# Every connection encrypted: libpq's default ("prefer") quietly falls back
# to plain text if something in the middle refuses encryption. Supabase
# always offers it. A connection string with its own sslmode still wins.
export PGSSLMODE="${PGSSLMODE:-require}"
