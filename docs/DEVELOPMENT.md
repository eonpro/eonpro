# Development Guide

Complete guide for setting up and working with the EONPRO development environment.

## Table of Contents

- [System Requirements](#system-requirements)
- [Initial Setup](#initial-setup)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Development Tools](#development-tools)
- [IDE Setup](#ide-setup)
- [Common Tasks](#common-tasks)
- [Architecture Overview](#architecture-overview)

---

## System Requirements

### Required

| Software | Version  | Notes                            |
| -------- | -------- | -------------------------------- |
| Node.js  | 20.x LTS | Use `nvm` for version management |
| npm      | 10.x+    | Comes with Node.js               |
| Git      | 2.40+    | For version control              |

### Recommended (Production-Like Development)

| Software   | Version | Notes                         |
| ---------- | ------- | ----------------------------- |
| PostgreSQL | 14+     | Primary database              |
| Redis      | 7+      | Caching and sessions          |
| Docker     | 24+     | For containerized development |

### Optional

| Software         | Purpose             |
| ---------------- | ------------------- |
| VS Code          | Recommended IDE     |
| Postman/Insomnia | API testing         |
| pgAdmin          | Database management |
| Redis Insight    | Redis debugging     |

---

## Initial Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd eonpro

# Install dependencies
npm install

# This also runs postinstall hooks (Prisma generate, etc.)
```

### 2. Environment Configuration

```bash
# Copy the environment template
cp env.production.example .env.local

# Edit with your local configuration
nano .env.local  # or use your preferred editor
```

### 3. Generate Security Keys

```bash
# Generate encryption key (64 hex characters)
openssl rand -hex 32

# Generate JWT secrets
openssl rand -base64 32
```

### 4. Database Setup

```bash
# Option A: SQLite (quickest for development)
# Set in .env.local:
# DATABASE_URL="file:./dev.db"

# Option B: PostgreSQL (recommended for production-like dev)
# Set in .env.local:
# DATABASE_URL="postgresql://user:pass@localhost:5432/eonpro_dev"

# Run migrations
npm run db:migrate:dev

# Seed with sample data
npm run db:seed
```

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

---

## Environment Configuration

### Critical Variables

```bash
# ===========================================
# DATABASE (Required)
# ===========================================
# SQLite for quick development:
DATABASE_URL="file:./dev.db"

# PostgreSQL for production-like development:
DATABASE_URL="postgresql://postgres:password@localhost:5432/eonpro_dev"

# ===========================================
# SECURITY (Required)
# ===========================================
# 32-byte hex key for PHI encryption
ENCRYPTION_KEY="your-64-character-hex-key-here"

# JWT signing secrets
JWT_SECRET="your-jwt-secret-min-32-chars"
JWT_REFRESH_SECRET="your-refresh-secret"
NEXTAUTH_SECRET="your-nextauth-secret"

# ===========================================
# APPLICATION
# ===========================================
NEXTAUTH_URL="http://localhost:3001"
NODE_ENV="development"
```

### Optional Services

```bash
# ===========================================
# REDIS (Optional - falls back to in-memory)
# ===========================================
REDIS_URL="redis://localhost:6379"

# ===========================================
# STRIPE (Optional - use test keys)
# ===========================================
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."

# ===========================================
# TWILIO (Optional - mock in development)
# ===========================================
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
TWILIO_PHONE_NUMBER="+1..."

# ===========================================
# AWS (Optional - local alternatives exist)
# ===========================================
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="us-east-1"
AWS_S3_BUCKET="eonpro-dev"

# ===========================================
# OPENAI (Optional - for AI features)
# ===========================================
OPENAI_API_KEY="sk-..."
```

### Environment Variable Reference

See `env.production.example` for the complete list with descriptions.

---

## Database Setup

### Using SQLite (Development Only)

Simplest option for local development:

```bash
# .env.local
DATABASE_URL="file:./dev.db"

# Run migrations
npm run db:migrate:dev

# Database file created at: prisma/dev.db
```

### Using PostgreSQL

For production-like development:

```bash
# Start PostgreSQL (if using Docker)
docker run -d \
  --name eonpro-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=eonpro_dev \
  -p 5432:5432 \
  postgres:14

# Or use Docker Compose
npm run docker:up

# .env.local
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/eonpro_dev"

# Run migrations
npm run db:migrate:dev
```

### Database Commands

```bash
# Run migrations (development)
npm run db:migrate:dev

# Run migrations (production)
npm run db:migrate

# Reset database (drops all data!)
npm run db:reset

# Push schema changes (no migration file)
npm run db:push

# Open Prisma Studio (database GUI)
npm run db:studio

# Validate schema
npm run db:validate

# Seed database
npm run db:seed
```

### Prisma Studio

Visual database browser:

```bash
npm run db:studio
# Opens at http://localhost:5555
```

---

## Running the Application

### Development Mode

```bash
npm run dev
# Starts at http://localhost:3001
# Hot reload enabled
```

### Production Build (Local Testing)

```bash
npm run build
npm run start
```

### Docker

```bash
# Start all services (app + postgres + redis)
npm run docker:up

# Start production-like environment
npm run docker:up:prod

# View logs
npm run docker:logs

# Stop all services
npm run docker:down
```

---

## Development Tools

### Linting & Formatting

```bash
# Check for lint errors
npm run lint

# Auto-fix lint errors
npm run lint:fix

# Check formatting
npm run format:check

# Fix formatting
npm run format
```

### Type Checking

```bash
# One-time check
npm run type-check

# Watch mode
npm run type-check:watch
```

### Testing

```bash
# Run all tests
npm run test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests (requires running app)
npm run test:e2e

# E2E with browser visible
npm run test:e2e:headed

# Coverage report
npm run test:coverage

# Watch mode
npm run test:watch
```

### Pre-Commit Validation

```bash
# Run all validations (lint, type-check, test)
npm run validate

# CI-level validation
npm run validate:ci
```

### Security Audit

```bash
npm run security:audit
npm run security:check
```

---

## IDE Setup

### VS Code (Recommended)

#### Extensions

Install these extensions for the best experience:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma",
    "ms-vscode.vscode-typescript-next",
    "formulahendry.auto-rename-tag",
    "streetsidesoftware.code-spell-checker",
    "usernamehw.errorlens",
    "eamodio.gitlens"
  ]
}
```

#### Settings

Add to `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "[prisma]": {
    "editor.defaultFormatter": "Prisma.prisma"
  }
}
```

#### Debug Configuration

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev"
    },
    {
      "name": "Next.js: debug client",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3001"
    }
  ]
}
```

---

## Common Tasks

### Adding a New API Route

1. Create route file:

   ```
   src/app/api/[domain]/[action]/route.ts
   ```

2. Use the standard template:

   ```typescript
   import { NextRequest, NextResponse } from 'next/server';
   import { withAuth } from '@/lib/auth/middleware';
   import { prisma } from '@/lib/db';
   import { logger } from '@/lib/logger';

   /**
    * GET /api/[domain]/[action]
    * Description of what this endpoint does
    */
   export const GET = withAuth(async (request: NextRequest, user) => {
     try {
       // Implementation
       return NextResponse.json({ data: result });
     } catch (error) {
       logger.error('Endpoint failed', { error });
       return NextResponse.json({ error: 'Operation failed' }, { status: 500 });
     }
   });
   ```

### Adding a Database Model

1. Edit `prisma/schema.prisma`
2. Run migration:
   ```bash
   npm run db:migrate:dev -- --name add_model_name
   ```
3. Update any affected services

### Adding a New Component

1. Create in `src/components/`:

   ```
   src/components/MyComponent.tsx
   ```

2. Use TypeScript interfaces:

   ```typescript
   interface MyComponentProps {
     title: string;
     onAction: () => void;
   }

   export function MyComponent({ title, onAction }: MyComponentProps) {
     return (
       // JSX
     );
   }
   ```

### Debugging Authentication Issues

```bash
# Check JWT token contents
# In browser console:
document.cookie
# Copy the 'token' value

# Decode at jwt.io or:
npm run dev
# Visit /api/debug/auth (dev only)
```

### Clearing Caches

```bash
# Clear Next.js cache
rm -rf .next

# Clear node_modules (full reset)
rm -rf node_modules
npm install

# Clear database (development only!)
npm run db:reset
```

---

## Architecture Overview

### Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── admin/         # Admin endpoints
│   │   ├── auth/          # Authentication
│   │   ├── patients/      # Patient management
│   │   ├── stripe/        # Payments
│   │   └── ...
│   ├── (dashboard)/       # Protected dashboard routes
│   ├── patient-portal/    # Patient-facing pages
│   └── ...
│
├── components/            # React components
│   ├── ui/               # Base UI components
│   └── ...
│
├── lib/                   # Core business logic
│   ├── auth/             # Authentication & authorization
│   ├── security/         # Encryption, PHI protection
│   ├── database/         # Query optimization, caching
│   ├── integrations/     # Third-party services
│   │   ├── aws/
│   │   ├── twilio/
│   │   └── zoom/
│   └── ...
│
├── services/             # Business services
│   ├── ai/              # AI features
│   ├── billing/         # Payment processing
│   └── ...
│
└── types/                # Shared TypeScript types
```

### Key Patterns

1. **Authentication**: All protected routes use `withAuth` middleware
2. **Multi-tenant**: Data is filtered by `clinicId` automatically
3. **Caching**: Multi-tier (L1 memory + L2 Redis)
4. **Error handling**: Structured logging with `logger`
5. **Validation**: Zod schemas for input validation

### Data Flow

```
Request → Middleware (auth, rate limit) → Route Handler → Service → Database
                                                              ↓
Response ← JSON ← Route Handler ← Service ← Cache/Database
```

---

## Getting Help

- **Documentation**: Check `/docs` folder
- **Troubleshooting**: See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **Architecture**: See [ARCHITECTURE_ANALYSIS.md](./ARCHITECTURE_ANALYSIS.md)
- **API Reference**: See [API_REFERENCE.md](./API_REFERENCE.md)

---

Happy coding! 🚀
