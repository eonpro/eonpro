#!/bin/bash

# ============================================
# SQLite to PostgreSQL Migration Script
# ============================================
# This script helps migrate from SQLite to PostgreSQL

set -e

echo "🚀 Lifefile Database Migration to PostgreSQL"
echo "==========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check prerequisites
echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

# Check if PostgreSQL client is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL client (psql) is not installed${NC}"
    echo "Install with: brew install postgresql (macOS) or apt-get install postgresql-client (Linux)"
    exit 1
fi

# Check if environment variable is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ DATABASE_URL environment variable is not set${NC}"
    echo "Example: export DATABASE_URL='postgresql://user:pass@host:5432/lifefile_prod'"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

# Extract database details from URL
DB_URL="$DATABASE_URL"
echo -e "${YELLOW}Step 2: Testing PostgreSQL connection...${NC}"
echo "Connecting to: ${DB_URL}"

# Test connection
if psql "$DB_URL" -c '\q' 2>/dev/null; then
    echo -e "${GREEN}✓ PostgreSQL connection successful${NC}"
else
    echo -e "${RED}❌ Cannot connect to PostgreSQL${NC}"
    echo "Please check your DATABASE_URL and ensure the database exists"
    exit 1
fi
echo ""

# Backup current SQLite database
echo -e "${YELLOW}Step 3: Backing up SQLite database...${NC}"
BACKUP_DIR="./database-backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SQLITE_BACKUP="$BACKUP_DIR/sqlite_backup_${TIMESTAMP}.db"

if [ -f "./prisma/dev.db" ]; then
    cp ./prisma/dev.db "$SQLITE_BACKUP"
    echo -e "${GREEN}✓ SQLite backup created: $SQLITE_BACKUP${NC}"
else
    echo -e "${YELLOW}⚠️  No SQLite database found to backup${NC}"
fi
echo ""

# Update Prisma schema
echo -e "${YELLOW}Step 4: Updating Prisma schema for PostgreSQL...${NC}"

# Create PostgreSQL-compatible schema
cat > prisma/schema.postgresql.prisma << 'EOF'
// PostgreSQL Production Schema
// This schema is configured for PostgreSQL

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Copy your existing models here
// The schema content should be the same as your current schema.prisma
// Only the datasource provider changes from "sqlite" to "postgresql"
EOF

echo -e "${GREEN}✓ PostgreSQL schema template created${NC}"
echo -e "${YELLOW}Note: You need to copy your models from schema.prisma to schema.postgresql.prisma${NC}"
echo ""

# Generate migration SQL
echo -e "${YELLOW}Step 5: Preparing database migration...${NC}"

# Create migration directory
MIGRATION_DIR="./prisma/migrations/$(date +%Y%m%d%H%M%S)_migrate_to_postgresql"
mkdir -p "$MIGRATION_DIR"

# Generate migration commands
cat > "$MIGRATION_DIR/migration.sql" << 'EOF'
-- PostgreSQL Migration Script
-- This script sets up the initial PostgreSQL database

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Set up row-level security
ALTER DATABASE lifefile_prod SET row_security = on;

-- Create audit schema
CREATE SCHEMA IF NOT EXISTS audit;

-- Function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Prisma will handle the rest of the table creation
-- Run: npx prisma migrate deploy
EOF

echo -e "${GREEN}✓ Migration SQL prepared${NC}"
echo ""

# Instructions for manual steps
echo -e "${YELLOW}Step 6: Manual migration steps${NC}"
echo "================================"
echo ""
echo "1. Update your schema.prisma file:"
echo "   - Change provider from 'sqlite' to 'postgresql'"
echo "   - Review and update any SQLite-specific features"
echo ""
echo "2. Generate Prisma client for PostgreSQL:"
echo "   npx prisma generate"
echo ""
echo "3. Push the schema to PostgreSQL:"
echo "   npx prisma db push"
echo ""
echo "4. Export data from SQLite (if needed):"
echo "   sqlite3 prisma/dev.db .dump > sqlite_dump.sql"
echo ""
echo "5. Import data to PostgreSQL (after conversion):"
echo "   psql \$DATABASE_URL < converted_data.sql"
echo ""
echo "6. Run the application with PostgreSQL:"
echo "   npm run dev"
echo ""
echo -e "${GREEN}✓ Migration preparation complete!${NC}"
echo ""

# Create data export script
cat > scripts/export-sqlite-data.js << 'EOF'
#!/usr/bin/env node

/**
 * SQLite Data Export Script
 * Exports data from SQLite for PostgreSQL migration
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./prisma/dev.db'
    }
  }
});

async function exportData() {
  console.log('📦 Exporting data from SQLite...');
  
  try {
    const data = {};
    
    // Export all tables
    data.clinics = await prisma.clinic.findMany();
    data.users = await prisma.user.findMany();
    data.patients = await prisma.patient.findMany();
    data.providers = await prisma.provider.findMany();
    data.orders = await prisma.order.findMany();
    data.tickets = await prisma.ticket.findMany();
    // Add more tables as needed
    
    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `./database-backups/sqlite-export-${timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    
    console.log(`✅ Data exported to: ${filename}`);
    console.log(`   Total records exported:`);
    Object.keys(data).forEach(table => {
      console.log(`   - ${table}: ${data[table].length} records`);
    });
    
  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

exportData();
EOF

chmod +x scripts/export-sqlite-data.js

# Create data import script
cat > scripts/import-to-postgresql.js << 'EOF'
#!/usr/bin/env node

/**
 * PostgreSQL Data Import Script
 * Imports data exported from SQLite
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function importData(filename) {
  console.log('📥 Importing data to PostgreSQL...');
  
  if (!filename) {
    console.error('Usage: node scripts/import-to-postgresql.js <export-file.json>');
    process.exit(1);
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    
    // Import in correct order (handle foreign key constraints)
    console.log('Importing clinics...');
    for (const clinic of data.clinics || []) {
      await prisma.clinic.create({ data: clinic });
    }
    
    console.log('Importing users...');
    for (const user of data.users || []) {
      await prisma.user.create({ data: user });
    }
    
    console.log('Importing patients...');
    for (const patient of data.patients || []) {
      await prisma.patient.create({ data: patient });
    }
    
    // Add more tables as needed
    
    console.log('✅ Import complete!');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const filename = process.argv[2];
importData(filename);
EOF

chmod +x scripts/import-to-postgresql.js

echo -e "${GREEN}✅ Migration scripts created successfully!${NC}"
echo ""
echo "📋 Next Steps:"
echo "1. Review and run the migration preparation"
echo "2. Export your SQLite data: node scripts/export-sqlite-data.js"
echo "3. Update DATABASE_URL to PostgreSQL"
echo "4. Run Prisma migrations: npx prisma migrate deploy"
echo "5. Import your data: node scripts/import-to-postgresql.js <export-file>"
echo ""
echo "🔒 Security Reminder:"
echo "- Use SSL/TLS connections (sslmode=require)"
echo "- Enable row-level security"
echo "- Set up regular automated backups"
echo "- Monitor database performance"
