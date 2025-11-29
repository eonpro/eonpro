#!/bin/bash

# PostgreSQL Migration Script for EONPRO Platform
# This script migrates from SQLite to PostgreSQL for production

set -e

echo "🚀 EONPRO PostgreSQL Migration Script"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env.production.local exists
if [ ! -f .env.production.local ]; then
    echo -e "${RED}❌ .env.production.local not found!${NC}"
    echo "Please create .env.production.local from env.production.template"
    exit 1
fi

# Source production environment variables
export $(grep -v '^#' .env.production.local | xargs)

# Validate required variables
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ DATABASE_URL not set in .env.production.local${NC}"
    exit 1
fi

echo -e "${BLUE}1. Backing up current SQLite database...${NC}"
if [ -f prisma/dev.db ]; then
    cp prisma/dev.db prisma/dev.db.backup.$(date +%Y%m%d_%H%M%S)
    echo -e "${GREEN}✓ SQLite backup created${NC}"
else
    echo -e "${YELLOW}⚠ No SQLite database found to backup${NC}"
fi

echo -e "${BLUE}2. Installing PostgreSQL dependencies...${NC}"
npm install @prisma/client prisma --save-exact

echo -e "${BLUE}3. Updating Prisma configuration for PostgreSQL...${NC}"
# Update schema.prisma datasource if needed
sed -i.bak 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma || true

echo -e "${BLUE}4. Creating PostgreSQL database (if not exists)...${NC}"
# Extract database name from DATABASE_URL
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')

echo "Database: $DB_NAME"
echo "Host: $DB_HOST"
echo "User: $DB_USER"

echo -e "${BLUE}5. Running Prisma migrations...${NC}"
npx prisma migrate dev --name postgres_migration --create-only

echo -e "${BLUE}6. Applying migrations to PostgreSQL...${NC}"
npx prisma migrate deploy

echo -e "${BLUE}7. Generating Prisma Client...${NC}"
npx prisma generate

echo -e "${BLUE}8. Seeding initial data...${NC}"
cat > prisma/seed.ts << 'EOF'
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');
  
  // Create default clinic
  const clinic = await prisma.clinic.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'EONPRO Main Clinic',
      address: '123 Healthcare Blvd',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94105',
      phone: '(555) 123-4567',
      email: 'info@eonpro.com',
      website: 'https://eonpro.com',
      status: 'ACTIVE'
    }
  });
  
  console.log('✓ Default clinic created');
  
  // Create super admin user
  const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@eonpro.com' },
    update: {},
    create: {
      email: 'admin@eonpro.com',
      passwordHash: hashedPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      clinicId: 1,
      twoFactorEnabled: false
    }
  });
  
  console.log('✓ Super admin created');
  if (!process.env.ADMIN_PASSWORD) {
    console.log('⚠️  Admin password:', adminPassword);
    console.log('⚠️  SAVE THIS PASSWORD - IT WILL NOT BE SHOWN AGAIN');
  }
  
  // Create default provider
  const providerPassword = crypto.randomBytes(16).toString('hex');
  const providerHashedPassword = await bcrypt.hash(providerPassword, 12);
  
  const providerUser = await prisma.user.upsert({
    where: { email: 'provider@eonpro.com' },
    update: {},
    create: {
      email: 'provider@eonpro.com',
      passwordHash: providerHashedPassword,
      firstName: 'Demo',
      lastName: 'Provider',
      role: 'PROVIDER',
      status: 'ACTIVE',
      clinicId: 1,
      twoFactorEnabled: false
    }
  });
  
  const provider = await prisma.provider.upsert({
    where: { userId: providerUser.id },
    update: {},
    create: {
      userId: providerUser.id,
      firstName: 'Demo',
      lastName: 'Provider',
      email: 'provider@eonpro.com',
      phone: '(555) 234-5678',
      specialty: 'General Practice',
      licenseNumber: 'MD12345',
      npiNumber: '1234567890',
      clinicId: 1
    }
  });
  
  console.log('✓ Default provider created');
  
  // Create intake form template
  const intakeTemplate = await prisma.intakeFormTemplate.create({
    data: {
      name: 'General Health Intake',
      description: 'Standard intake form for new patients',
      category: 'GENERAL',
      version: '1.0',
      isActive: true,
      isDefault: true,
      createdById: admin.id,
      fields: {
        sections: [
          {
            title: 'Personal Information',
            fields: ['firstName', 'lastName', 'dateOfBirth', 'email', 'phone']
          },
          {
            title: 'Medical History',
            fields: ['allergies', 'medications', 'conditions', 'surgeries']
          }
        ]
      }
    }
  });
  
  console.log('✓ Default intake template created');
  
  console.log('\n✅ Database seeding complete!');
  console.log('\n📝 Default Credentials:');
  console.log('Admin: admin@eonpro.com / ' + (process.env.ADMIN_PASSWORD || adminPassword));
  console.log('Provider: provider@eonpro.com / ' + providerPassword);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
EOF

echo -e "${BLUE}9. Installing bcryptjs for password hashing...${NC}"
npm install bcryptjs @types/bcryptjs --save

echo -e "${BLUE}10. Running seed script...${NC}"
npx ts-node prisma/seed.ts

echo -e "${GREEN}✅ PostgreSQL migration complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Update your application to use the PostgreSQL connection"
echo "2. Test all functionality thoroughly"
echo "3. Set up database backups and monitoring"
echo "4. Configure connection pooling for production"
echo ""
echo -e "${YELLOW}⚠️  Important: Save the admin credentials shown above!${NC}"
