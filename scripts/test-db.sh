#!/usr/bin/env bash
# Runs migrations + seed + the flow test against a throwaway local Postgres.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres bash scripts/test-db.sh  (database is dropped and recreated)
set -euo pipefail
cd "$(dirname "$0")/../supabase"
DB=apex_test
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
for f in tests/auth_stub.sql migrations/001_schema.sql migrations/002_functions.sql migrations/003_security.sql seed.sql tests/flow_test.sql; do
  psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f" >/dev/null
done
psql -q -d postgres -c "drop database $DB"
echo "ALL DATABASE CHECKS PASSED"
