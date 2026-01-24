#!/bin/bash
# =============================================================================
# APPLY DATABASE PERFORMANCE INDEXES
# =============================================================================
# This script applies optimized indexes to the PostgreSQL database.
# Run this after database migrations are applied.
#
# Usage: ./scripts/apply-performance-indexes.sh
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Database Performance Index Migration ===${NC}"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL environment variable is not set${NC}"
    echo "Please set DATABASE_URL before running this script:"
    echo "  export DATABASE_URL='postgresql://user:pass@host:5432/database'"
    exit 1
fi

# Extract database info from URL (for display purposes)
DB_HOST=$(echo $DATABASE_URL | sed -E 's/.*@([^:\/]+).*/\1/')
echo -e "${YELLOW}Target Database Host:${NC} $DB_HOST"

# Confirm before proceeding
read -p "This will add performance indexes to the database. Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_FILE="$SCRIPT_DIR/migrations/add-performance-indexes.sql"

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}Error: Migration file not found at $MIGRATION_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}Applying indexes...${NC}"
echo "This may take a few minutes depending on table sizes."

# Apply the migration
if psql "$DATABASE_URL" < "$MIGRATION_FILE"; then
    echo -e "${GREEN}=== Success! ===${NC}"
    echo "Performance indexes have been applied."
    echo ""
    echo "Recommended next steps:"
    echo "  1. Monitor query performance in your application"
    echo "  2. Check the /api/admin/database-metrics endpoint"
    echo "  3. Review slow query logs"
else
    echo -e "${RED}=== Failed ===${NC}"
    echo "There was an error applying the indexes."
    echo "Check the output above for details."
    exit 1
fi
