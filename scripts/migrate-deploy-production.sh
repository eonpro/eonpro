#!/usr/bin/env bash
# Run prisma migrate deploy against production URLs from local env files only.
# Set DATABASE_URL_PRODUCTION (+ optional DIRECT_DATABASE_URL_PRODUCTION) in
# .env.local or .env.production.local — do not commit those values.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
[ -f .env.production.local ] && . ./.env.production.local
[ -f .env.local ] && . ./.env.local
set +a

if [ -z "${DATABASE_URL_PRODUCTION:-}" ]; then
  echo "ERROR: DATABASE_URL_PRODUCTION is not set."
  echo "Add it to .env.local or .env.production.local (see .env.example)."
  exit 1
fi

export DATABASE_URL="$DATABASE_URL_PRODUCTION"
export DIRECT_DATABASE_URL="${DIRECT_DATABASE_URL_PRODUCTION:-$DATABASE_URL_PRODUCTION}"

echo "Running prisma migrate deploy using DATABASE_URL_PRODUCTION..."
exec npx prisma migrate deploy
