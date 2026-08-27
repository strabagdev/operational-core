#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Usage:
  DATABASE_URL=... [OPCO_ENV=staging] scripts/db-backup.sh [--output-dir DIR]

Creates a PostgreSQL logical backup using pg_dump custom format.

Environment:
  DATABASE_URL       Required. PostgreSQL connection string. Never printed.
  OPCO_ENV          Optional. Used in the filename. Defaults to "unknown".
  BACKUP_DIR        Optional. Default output directory when --output-dir is omitted.
  CREATE_CHECKSUM   Optional. Set to "false" to skip SHA-256 checksum. Defaults to "true".
  PG_DUMP_BIN       Optional. Defaults to PostgreSQL 18 pg_dump path.
  PG_RESTORE_BIN    Optional. Defaults to PostgreSQL 18 pg_restore path.
USAGE
}

output_dir="${BACKUP_DIR:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      output_dir="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 2
fi

pg_dump_bin="${PG_DUMP_BIN:-/usr/lib/postgresql/18/bin/pg_dump}"
pg_restore_bin="${PG_RESTORE_BIN:-/usr/lib/postgresql/18/bin/pg_restore}"

if [[ ! -x "$pg_dump_bin" ]]; then
  echo "pg_dump is required but was not found or executable at: $pg_dump_bin" >&2
  exit 127
fi

if [[ ! -x "$pg_restore_bin" ]]; then
  echo "pg_restore is required but was not found or executable at: $pg_restore_bin" >&2
  exit 127
fi

pg_dump_version="$("$pg_dump_bin" --version)"
pg_restore_version="$("$pg_restore_bin" --version)"

if [[ ! "$pg_dump_version" =~ \(PostgreSQL\)\ 18\. ]]; then
  echo "PostgreSQL 18 pg_dump is required; found: $pg_dump_version" >&2
  exit 2
fi

if [[ ! "$pg_restore_version" =~ \(PostgreSQL\)\ 18\. ]]; then
  echo "PostgreSQL 18 pg_restore is required; found: $pg_restore_version" >&2
  exit 2
fi

opco_env="${OPCO_ENV:-unknown}"
if [[ ! "$opco_env" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "OPCO_ENV may contain only letters, numbers, underscores, and hyphens." >&2
  exit 2
fi

if [[ -z "$output_dir" ]]; then
  output_dir="${PWD}/../opco-db-backups"
fi

mkdir -p "$output_dir"

timestamp="$(date -u +%Y%m%d-%H%M%S)"
backup_file="${output_dir}/opco-${opco_env}-${timestamp}.dump"
tmp_file="${backup_file}.tmp"
checksum_file="${backup_file}.sha256"

cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

"$pg_dump_bin" \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --file="$tmp_file"

if [[ ! -s "$tmp_file" ]]; then
  echo "Backup dump was not created or is empty." >&2
  exit 1
fi

"$pg_restore_bin" --list "$tmp_file" >/dev/null

mv "$tmp_file" "$backup_file"
trap - EXIT

if [[ "${CREATE_CHECKSUM:-true}" != "false" ]]; then
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$backup_file" > "$checksum_file"
    echo "Checksum: $checksum_file"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$backup_file" > "$checksum_file"
    echo "Checksum: $checksum_file"
  else
    echo "SHA-256 tool not found; checksum skipped." >&2
  fi
fi

size_bytes="$(wc -c < "$backup_file" | tr -d '[:space:]')"

echo "Backup: $backup_file"
echo "Size: ${size_bytes} bytes"
echo "pg_dump: $pg_dump_version"
echo "pg_restore validation: OK"
