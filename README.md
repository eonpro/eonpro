# EONPRO Telehealth Platform

A HIPAA-compliant, enterprise-grade telehealth platform built with Next.js, providing secure virtual healthcare services for multi-clinic operations.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

## Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Development](#-development)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Documentation](#-documentation)
- [Contributing](#-contributing)

---

## Features

### Core Platform
- **Multi-Clinic Support**: Manage multiple clinic locations with isolated data
- **Role-Based Access**: Super Admin, Admin, Provider, Staff, Support, Patient, Influencer
- **White-Label Ready**: Custom branding per clinic (colors, logos, domains)

### Clinical Features
- **Telehealth**: Video consultations via Zoom integration
- **SOAP Notes**: AI-assisted clinical documentation
- **E-Prescriptions**: Lifefile pharmacy integration
- **Care Plans**: Treatment planning with goals and tracking
- **Scheduling**: Appointment management with reminders

### Patient Experience
- **Patient Portal**: Self-service dashboard
- **Intake Forms**: Customizable digital intake
- **Secure Messaging**: HIPAA-compliant chat
- **Health Tracking**: Weight, exercise, nutrition logging

### Business Operations
- **Billing**: Stripe integration with invoicing
- **Subscriptions**: Recurring payment management
- **Affiliate Program**: Influencer referral tracking
- **Analytics**: Reporting and dashboards

### Security & Compliance
- **HIPAA Compliant**: Full PHI encryption (AES-256-GCM)
- **Audit Logging**: Comprehensive access tracking
- **2FA Authentication**: TOTP-based two-factor auth
- **Session Management**: Redis-backed distributed sessions

---

## Quick Start

### Prerequisites

- Node.js 20+ (LTS recommended)
- npm 10+
- PostgreSQL 14+ (or use SQLite for quick start)

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd eonpro

# 2. Install dependencies
npm install

# 3. Set up environment (quick start with SQLite)
cp env.production.example .env.local

# Edit .env.local - minimum required:
# DATABASE_URL="file:./dev.db"
# ENCRYPTION_KEY="<generate with: openssl rand -hex 32>"
# JWT_SECRET="<generate with: openssl rand -base64 32>"
# NEXTAUTH_SECRET="<generate with: openssl rand -base64 32>"

# 4. Initialize database
npm run db:migrate:dev
npm run db:seed

# 5. Start development server
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

### Default Credentials (Development)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@eonpro.health | (set during seed) |
| Provider | provider@clinic.com | (set during seed) |

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.x | React framework with App Router |
| React | 19.x | UI library |
| TypeScript | 5.4 | Type safety |
| Tailwind CSS | 3.4 | Styling |
| Chart.js | 4.x | Data visualization |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x | Runtime |
| Prisma | 6.x | ORM & database toolkit |
| PostgreSQL | 14+ | Production database |
| Redis | 7+ | Caching & sessions |

### Integrations
| Service | Purpose |
|---------|---------|
| Stripe | Payments & subscriptions |
| Twilio | SMS & chat |
| Zoom | Video telehealth |
| AWS S3 | File storage |
| AWS SES | Email delivery |
| AWS KMS | Key management |
| OpenAI | AI-assisted SOAP notes |
| Lifefile | E-prescriptions |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (230+)
│   ├── admin/             # Admin portal pages
│   ├── patient-portal/    # Patient-facing pages
│   └── ...
├── components/            # React components (73)
├── lib/                   # Core business logic
│   ├── auth/             # Authentication (11 files)
│   ├── security/         # Encryption, PHI (6 files)
│   ├── database/         # Query optimization
│   ├── integrations/     # Third-party services
│   └── ...
├── services/             # Business services
└── types/                # TypeScript definitions

docs/                     # Documentation (45+ files)
tests/                    # Test suites (71 files)
prisma/                   # Database schema & migrations
scripts/                  # Utility scripts
```

---

## Development

### Available Commands

```bash
# Development
npm run dev              # Start dev server (port 3001)
npm run build            # Production build
npm run start            # Start production server

# Database
npm run db:studio        # Open Prisma Studio GUI
npm run db:migrate:dev   # Run migrations (dev)
npm run db:seed          # Seed sample data
npm run db:reset         # Reset database (caution!)

# Quality
npm run lint             # Check linting
npm run lint:fix         # Fix lint issues
npm run type-check       # TypeScript validation
npm run format           # Format code
npm run validate         # Run all checks

# Testing
npm run test             # All tests
npm run test:unit        # Unit tests
npm run test:e2e         # End-to-end tests
npm run test:coverage    # Coverage report
```

### IDE Setup (VS Code)

Recommended extensions:
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Prisma

See [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for detailed setup.

---

## Testing

```bash
# Run all tests
npm run test

# Unit tests only
npm run test:unit

# End-to-end tests
npm run test:e2e

# With coverage
npm run test:coverage

# Security audit
npm run security:audit
```

### Test Structure

```
tests/
├── api/           # API route tests
├── e2e/           # Playwright E2E tests
├── integration/   # Integration tests
├── unit/          # Unit tests
└── security/      # Security-specific tests
```

---

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel dashboard
3. Configure environment variables
4. Deploy

### Docker

```bash
# Development
npm run docker:up

# Production
npm run docker:up:prod
```

### Environment Variables

See `env.production.example` for the complete list (180+ variables).

**Critical variables:**
```bash
DATABASE_URL          # PostgreSQL connection
ENCRYPTION_KEY        # PHI encryption (openssl rand -hex 32)
JWT_SECRET           # JWT signing (openssl rand -base64 32)
REDIS_URL            # Redis connection (optional)
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [DEVELOPMENT.md](./docs/DEVELOPMENT.md) | Development setup guide |
| [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Common issues & solutions |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contribution guidelines |
| [ARCHITECTURE_ANALYSIS.md](./docs/ARCHITECTURE_ANALYSIS.md) | System architecture |
| [API_REFERENCE.md](./docs/API_REFERENCE.md) | API documentation |

### Integration Guides
- [Stripe Setup](./docs/STRIPE_SETUP_GUIDE.md)
- [Twilio Integration](./docs/TWILIO_SMS_INTEGRATION.md)
- [AWS S3](./docs/AWS_S3_INTEGRATION.md)
- [Webhook Configuration](./docs/WEBHOOK_INTEGRATION_GUIDE.md)

---

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Code style guidelines
- Branch naming conventions
- Pull request process
- Testing requirements

---

## Security

### HIPAA Compliance

This platform implements HIPAA security requirements:
- AES-256-GCM encryption for PHI at rest
- TLS 1.3 for data in transit
- Comprehensive audit logging
- Role-based access controls
- Automatic session timeout
- AWS KMS key management

### Reporting Security Issues

**DO NOT** create public issues for security vulnerabilities.
Contact: security@eonpro.health

---

## License

Proprietary - All Rights Reserved

---

## Support

- Documentation: `/docs` folder
- Email: support@eonpro.health

---

Built with care for modern healthcare