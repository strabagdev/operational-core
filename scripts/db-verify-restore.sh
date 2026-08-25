#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Usage:
  DATABASE_URL=... scripts/db-verify-restore.sh

Runs read-only PostgreSQL checks after a restore.
The script prints table presence and counts only; it does not print row contents.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but was not found in PATH." >&2
  exit 127
fi

PGDATABASE="$DATABASE_URL" psql --no-psqlrc --set=ON_ERROR_STOP=1 --quiet <<'SQL'
BEGIN READ ONLY;

SELECT 'select_1' AS check_name, 1 AS value;

WITH expected(table_name) AS (
  VALUES
    ('_prisma_migrations'),
    ('Organization'),
    ('Contract'),
    ('User'),
    ('EntityType'),
    ('EntityRecord')
)
SELECT
  'table_present' AS check_name,
  table_name,
  CASE
    WHEN to_regclass('public."' || table_name || '"') IS NULL THEN 'missing'
    ELSE 'present'
  END AS status
FROM expected
ORDER BY table_name;

SELECT 'count' AS check_name, '_prisma_migrations' AS table_name, count(*) AS value FROM "_prisma_migrations"
UNION ALL
SELECT 'count', 'Organization', count(*) FROM "Organization"
UNION ALL
SELECT 'count', 'Contract', count(*) FROM "Contract"
UNION ALL
SELECT 'count', 'User', count(*) FROM "User"
UNION ALL
SELECT 'count', 'EntityType', count(*) FROM "EntityType"
UNION ALL
SELECT 'count', 'EntityRecord', count(*) FROM "EntityRecord"
ORDER BY table_name;

COMMIT;
SQL
