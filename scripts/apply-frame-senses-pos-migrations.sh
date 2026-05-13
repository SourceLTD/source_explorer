#!/usr/bin/env bash
#
# Apply frame sense POS standardization migrations in order via psql.
#
# 1. source-explorer/migrations/standardize_frame_senses_pos.sql
# 2. source-health-check-runner/migrations/0064_align_pos_required_by_frame_type.sql
#
# Prerequisites:
#   - psql in PATH (PostgreSQL client ≥ 14 recommended)
#   - A writable connection string. Prefer POSTGRES_URL_NON_POOLING — poolers
#     often disallow or complicate DDL; Prisma docs use this for migrations.
#
# Usage:
#   export POSTGRES_URL_NON_POOLING='postgresql://user:pass@host:5432/db?sslmode=require'
#   ./scripts/apply-frame-senses-pos-migrations.sh
#
# Optional overrides:
#   RUNNER_REPO_ROOT  — defaults to sibling ../source-health-check-runner
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPLORER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUNNER_ROOT="${RUNNER_REPO_ROOT:-$(cd "${EXPLORER_ROOT}/../source-health-check-runner" && pwd)}"

SQL_STANDARDIZE="${EXPLORER_ROOT}/migrations/standardize_frame_senses_pos.sql"
SQL_HEALTH_CONFIG="${RUNNER_ROOT}/migrations/0064_align_pos_required_by_frame_type.sql"

PSQL_URL="${POSTGRES_URL_NON_POOLING:-${DATABASE_URL:-${POSTGRES_PRISMA_URL:-}}}"

if [[ -z "${PSQL_URL}" ]]; then
  echo "error: no database URL." >&2
  echo "  Set POSTGRES_URL_NON_POOLING (preferred for DDL), or DATABASE_URL, or POSTGRES_PRISMA_URL." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "error: psql not found in PATH" >&2
  exit 1
fi

for f in "${SQL_STANDARDIZE}" "${SQL_HEALTH_CONFIG}"; do
  if [[ ! -f "${f}" ]]; then
    echo "error: migration file missing: ${f}" >&2
    exit 1
  fi
done

echo "Explorer repo: ${EXPLORER_ROOT}"
echo "Runner repo:   ${RUNNER_ROOT}"
echo

echo "[1/2] ${SQL_STANDARDIZE}"
psql "${PSQL_URL}" -v ON_ERROR_STOP=1 -f "${SQL_STANDARDIZE}"

echo
echo "[2/2] ${SQL_HEALTH_CONFIG}"
psql "${PSQL_URL}" -v ON_ERROR_STOP=1 -f "${SQL_HEALTH_CONFIG}"

echo
echo "Done. Verify:"
echo '  SELECT pos::text, COUNT(*) FROM frame_senses GROUP BY pos ORDER BY pos;'
