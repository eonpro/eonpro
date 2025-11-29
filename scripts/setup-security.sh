#!/bin/bash

# HIPAA-Compliant Security Setup Script
# This script generates secure keys and sets up the environment

echo "🔐 HIPAA Security Setup Script"
echo "==============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env.local already exists
if [ -f .env.local ]; then
    echo -e "${YELLOW}⚠️  .env.local already exists!${NC}"
    read -p "Do you want to backup and create a new one? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        backup_file=".env.local.backup.$(date +%Y%m%d_%H%M%S)"
        cp .env.local "$backup_file"
        echo -e "${GREEN}✅ Backed up existing .env.local to $backup_file${NC}"
    else
        echo -e "${RED}❌ Aborting setup${NC}"
        exit 1
    fi
fi

echo "Generating secure keys..."
echo ""

# Generate secure random keys
ENCRYPTION_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Create .env.local file
cat > .env.local << EOL
# HIPAA-Compliant Security Configuration
# Generated on $(date)
# CRITICAL: Keep this file secure and never commit to version control

# Encryption Key for PHI (32 bytes hex)
ENCRYPTION_KEY=$ENCRYPTION_KEY

# JWT Secrets (secure random values)
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
NEXTAUTH_SECRET=$NEXTAUTH_SECRET

# Token Configuration
TOKEN_VERSION=1

# Session Configuration (milliseconds)
SESSION_TIMEOUT=900000           # 15 minutes
SESSION_IDLE_TIMEOUT=900000      # 15 minutes  
ABSOLUTE_SESSION_TIMEOUT=28800000 # 8 hours

# Private Storage Path
PRIVATE_STORAGE_PATH=./private-storage

# Database URL (update with your actual database)
DATABASE_URL="file:./prisma/dev.db"

# Application URLs
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Environment
NODE_ENV=development

# Clinic Configuration
DEFAULT_CLINIC_ID=1
BYPASS_CLINIC_FILTER=false

# Audit Configuration
AUDIT_LOG_RETENTION_DAYS=2190  # 6 years for HIPAA
AUDIT_LOG_LEVEL=info

# Security Configuration
ENABLE_SECURITY_HEADERS=true
ENABLE_RATE_LIMITING=true
MAX_LOGIN_ATTEMPTS=3
LOCKOUT_DURATION_MINUTES=30

# Add your service keys below:
# OPENAI_API_KEY=
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_PHONE_NUMBER=
EOL

echo -e "${GREEN}✅ Created .env.local with secure keys${NC}"
echo ""

# Create private storage directory
if [ ! -d "private-storage" ]; then
    mkdir -p private-storage
    chmod 700 private-storage
    echo -e "${GREEN}✅ Created private-storage directory${NC}"
else
    echo -e "${YELLOW}⚠️  private-storage directory already exists${NC}"
fi

# Add to .gitignore if not already there
if ! grep -q "^\.env\.local$" .gitignore 2>/dev/null; then
    echo ".env.local" >> .gitignore
    echo -e "${GREEN}✅ Added .env.local to .gitignore${NC}"
fi

if ! grep -q "^private-storage/$" .gitignore 2>/dev/null; then
    echo "private-storage/" >> .gitignore
    echo -e "${GREEN}✅ Added private-storage/ to .gitignore${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Security setup complete!${NC}"
echo ""
echo "Generated keys:"
echo "==============="
echo "ENCRYPTION_KEY: ${ENCRYPTION_KEY:0:20}... (truncated for display)"
echo "JWT_SECRET: ${JWT_SECRET:0:20}... (truncated for display)"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT SECURITY NOTES:${NC}"
echo "1. Never commit .env.local to version control"
echo "2. Keep backup of keys in a secure password manager"
echo "3. Use different keys for production"
echo "4. Rotate keys regularly (every 90 days)"
echo ""
echo "Next steps:"
echo "==========="
echo "1. Review and update database URL in .env.local"
echo "2. Add your API keys (OpenAI, Stripe, etc.) to .env.local"
echo "3. Run: npm run build"
echo "4. Run: npx tsx scripts/migrate-encrypt-phi.ts (to encrypt existing data)"
echo ""
