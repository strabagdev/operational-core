#!/usr/bin/env bash
set -euo pipefail

readonly PG_BIN="${OPCO_LOCAL_PG_BIN:-/usr/lib/postgresql/16/bin}"
readonly PG_DATA="${OPCO_LOCAL_PGDATA:-$HOME/.local/share/opco/postgresql-16/data}"
readonly PG_RUNTIME="${OPCO_LOCAL_PGRUNTIME:-$HOME/.local/share/opco/postgresql-16/run}"
readonly PG_LOG="${OPCO_LOCAL_PGLOG:-$HOME/.local/share/opco/postgresql-16/postgresql.log}"

case "${1:-}" in
  start)
    [[ -s "$PG_DATA/PG_VERSION" ]] || { echo "Local Opco PostgreSQL is not initialized." >&2; exit 1; }
    mkdir -p "$PG_RUNTIME"
    chmod 700 "$PG_RUNTIME"
    "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" \
      -o "-h 127.0.0.1 -p 55432 -k $PG_RUNTIME" start
    ;;
  stop)
    "$PG_BIN/pg_ctl" -D "$PG_DATA" stop -m fast
    ;;
  status)
    "$PG_BIN/pg_ctl" -D "$PG_DATA" status
    ;;
  *)
    echo "Usage: scripts/local-postgres.sh {start|stop|status}" >&2
    exit 2
    ;;
esac
