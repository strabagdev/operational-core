#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ALLOW_DB_RESTORE=true OPCO_ENV=staging DATABASE_URL=... CONFIRM_RESTORE_TARGET=staging \
    scripts/db-restore.sh path/to/opco-staging-YYYYMMDD-HHMMSS.dump

Restores a PostgreSQL custom-format dump into a non-production target.

Required safeguards:
  DATABASE_URL              Target database connection string. Never printed.
  ALLOW_DB_RESTORE=true     Required explicit restore enablement.
  OPCO_ENV                  Must be "staging" or "development". "production" always aborts.
  CONFIRM_RESTORE_TARGET    Must exactly match OPCO_ENV.

The target database should be empty or a dedicated staging/development database.
Never use this script against production.
USAGE
}

dump_file="${1:-${BACKUP_FILE:-}}"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 2
fi

if [[ "${ALLOW_DB_RESTORE:-}" != "true" ]]; then
  echo "Refusing restore: set ALLOW_DB_RESTORE=true." >&2
  exit 2
fi

case "${OPCO_ENV:-}" in
  development|staging)
    ;;
  production)
    echo "Refusing restore: OPCO_ENV=production is never allowed." >&2
    exit 3
    ;;
  "")
    echo "OPCO_ENV is required and must be development or staging." >&2
    exit 2
    ;;
  *)
    echo "Refusing restore: OPCO_ENV must be development or staging." >&2
    exit 2
    ;;
esac

if [[ "${CONFIRM_RESTORE_TARGET:-}" != "$OPCO_ENV" ]]; then
  echo "Refusing restore: CONFIRM_RESTORE_TARGET must exactly match OPCO_ENV." >&2
  exit 2
fi

if [[ -z "$dump_file" ]]; then
  echo "Dump file path is required." >&2
  usage >&2
  exit 2
fi

if [[ ! -f "$dump_file" ]]; then
  echo "Dump file not found: $dump_file" >&2
  exit 2
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required but was not found in PATH." >&2
  exit 127
fi

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

PGDATABASE="$DATABASE_URL" pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --single-transaction \
  --dbname="$DATABASE_URL" \
  "$dump_file"

finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Restore completed."
echo "Started: $started_at"
echo "Finished: $finished_at"
echo "Target environment: $OPCO_ENV"
