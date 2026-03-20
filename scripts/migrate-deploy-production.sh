#!/usr/bin/env bash
# Run prisma migrate deploy against production URLs from local env files only.
#
# Resolution order (first wins for URL):
#   1) DATABASE_URL_PRODUCTION after loading BOTH files (so .env.local can override)
#   2) DATABASE_URL from .env.production.local ONLY (captured before .env.local overwrites it)
#
# DIRECT_DATABASE_URL: DIRECT_DATABASE_URL_PRODUCTION, else DIRECT_DATABASE_URL from
# production file (saved before .env.local), else same as chosen DATABASE_URL.
#
# See env.production.example (uses DATABASE_URL) and .env.example (_PRODUCTION variants).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
[ -f .env.production.local ] && . ./.env.production.local
set +a
SAVED_PROD_DB="${DATABASE_URL_PRODUCTION:-${DATABASE_URL:-}}"
SAVED_PROD_DIRECT="${DIRECT_DATABASE_URL_PRODUCTION:-${DIRECT_DATABASE_URL:-}}"

set -a
[ -f .env.local ] && . ./.env.local
set +a

TARGET_DB="${DATABASE_URL_PRODUCTION:-$SAVED_PROD_DB}"
# Never use DIRECT_DATABASE_URL from .env.local alone — only _PRODUCTION or production.local snapshot.
TARGET_DIRECT="${DIRECT_DATABASE_URL_PRODUCTION:-${SAVED_PROD_DIRECT:-$TARGET_DB}}"

if [ -z "${TARGET_DB:-}" ]; then
  echo "ERROR: No production database URL found."
  echo "Use one of:"
  echo "  • DATABASE_URL in .env.production.local (see env.production.example), or"
  echo "  • DATABASE_URL_PRODUCTION in .env.local or .env.production.local"
  exit 1
fi

export DATABASE_URL="$TARGET_DB"
export DIRECT_DATABASE_URL="$TARGET_DIRECT"

echo "Running prisma migrate deploy against production DATABASE_URL..."
exec npx prisma migrate deploy
