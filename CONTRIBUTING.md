# Contributing to EONPRO

Thank you for your interest in contributing to EONPRO! This document provides guidelines and best practices for contributing to the codebase.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Security Considerations](#security-considerations)

---

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Prioritize patient safety and HIPAA compliance in all decisions
- Document your changes thoroughly

---

## Getting Started

### Prerequisites

- Node.js 20+ (LTS recommended)
- PostgreSQL 14+ (for production-like development)
- Redis (optional, for caching/sessions)
- Git

### Initial Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd eonpro

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp env.production.example .env.local
# Edit .env.local with your local configuration

# 4. Set up the database
npm run db:migrate:dev
npm run db:seed

# 5. Start development server
npm run dev
```

See [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for detailed setup instructions.

---

## Development Workflow

### Branch Naming Convention

Use descriptive branch names with prefixes:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feature/` | New features | `feature/patient-search` |
| `fix/` | Bug fixes | `fix/invoice-calculation` |
| `hotfix/` | Critical production fixes | `hotfix/auth-bypass` |
| `refactor/` | Code refactoring | `refactor/scheduling-service` |
| `docs/` | Documentation only | `docs/api-reference` |
| `test/` | Test additions/fixes | `test/payment-integration` |
| `chore/` | Maintenance tasks | `chore/upgrade-dependencies` |

### Commit Message Format

Follow conventional commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(scheduling): add recurring appointment support
fix(billing): correct tax calculation for multi-state
docs(api): update webhook integration guide
refactor(auth): simplify session management
```

### Development Commands

```bash
# Start development server
npm run dev

# Run all validations (recommended before commit)
npm run validate

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix    # Auto-fix issues

# Formatting
npm run format
npm run format:check

# Testing
npm run test        # All tests
npm run test:unit   # Unit tests only
npm run test:e2e    # End-to-end tests

# Database
npm run db:studio   # Open Prisma Studio
npm run db:migrate:dev  # Run migrations
npm run db:seed     # Seed database
```

---

## Code Style Guidelines

### TypeScript

- **Strict mode is enabled** - all code must pass strict TypeScript checks
- Use explicit types for function parameters and return values
- Avoid `any` - use `unknown` if type is truly unknown
- Use interfaces for object shapes, types for unions/primitives

```typescript
// ✅ Good
interface PatientInput {
  firstName: string;
  lastName: string;
  email?: string;
}

async function createPatient(input: PatientInput): Promise<Patient> {
  // implementation
}

// ❌ Bad
async function createPatient(input: any) {
  // implementation
}
```

### File Organization

```typescript
// 1. Imports (external first, then internal)
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

// 2. Types/Interfaces
interface RequestBody {
  patientId: number;
}

// 3. Constants
const MAX_RESULTS = 100;

// 4. Helper functions (private)
function validateInput(data: unknown): RequestBody {
  // ...
}

// 5. Main exports
export async function GET(request: NextRequest) {
  // ...
}
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files (components) | PascalCase | `PatientCard.tsx` |
| Files (utilities) | camelCase or kebab-case | `formatDate.ts`, `date-utils.ts` |
| Files (API routes) | lowercase | `route.ts` |
| Variables/Functions | camelCase | `getPatientById` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Types/Interfaces | PascalCase | `PatientRecord` |
| React Components | PascalCase | `PatientDashboard` |
| Database models | PascalCase | `Patient`, `SOAPNote` |

### Documentation (JSDoc)

Add JSDoc comments to all exported functions:

```typescript
/**
 * Retrieves a patient by ID with optional relations
 * 
 * @param patientId - The unique patient identifier
 * @param options - Query options
 * @param options.includeOrders - Include patient orders
 * @param options.includeInvoices - Include billing history
 * @returns The patient record or null if not found
 * @throws {UnauthorizedError} If user lacks access to this patient
 * 
 * @example
 * const patient = await getPatientById(123, { includeOrders: true });
 */
export async function getPatientById(
  patientId: number,
  options: GetPatientOptions = {}
): Promise<Patient | null> {
  // implementation
}
```

### Error Handling

Always use structured error handling:

```typescript
// ✅ Good
try {
  const result = await riskyOperation();
  return NextResponse.json(result);
} catch (error) {
  logger.error('Operation failed', { 
    error: error instanceof Error ? error.message : 'Unknown error',
    context: { patientId }
  });
  return NextResponse.json(
    { error: 'Operation failed' },
    { status: 500 }
  );
}

// ❌ Bad
try {
  const result = await riskyOperation();
  return NextResponse.json(result);
} catch (e) {
  console.log(e);
  return NextResponse.json({ error: 'Failed' }, { status: 500 });
}
```

---

## Testing Requirements

### Test Coverage Expectations

| Category | Minimum Coverage | Priority |
|----------|-----------------|----------|
| Security functions | 90% | Critical |
| Payment/Billing | 85% | Critical |
| Authentication | 85% | Critical |
| API routes | 70% | High |
| UI components | 60% | Medium |
| Utilities | 80% | Medium |

### Writing Tests

```typescript
// tests/unit/auth/session.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSession, validateSession } from '@/lib/auth/session';

describe('Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a valid session for authenticated user', async () => {
      const user = { id: 1, email: 'test@example.com', role: 'provider' };
      const session = await createSession(user);
      
      expect(session).toBeDefined();
      expect(session.userId).toBe(user.id);
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    it('should throw error for invalid user', async () => {
      await expect(createSession(null)).rejects.toThrow('Invalid user');
    });
  });
});
```

### Running Tests

```bash
# Run all tests
npm run test

# Run with coverage report
npm run test:coverage

# Run specific test file
npm run test -- tests/unit/auth/session.test.ts

# Run tests in watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e
```

---

## Pull Request Process

### Before Creating a PR

1. **Ensure all checks pass:**
   ```bash
   npm run validate  # Runs lint, type-check, and tests
   ```

2. **Update documentation** if you've changed:
   - API endpoints
   - Environment variables
   - Database schema
   - Configuration options

3. **Add/update tests** for your changes

4. **Self-review your code:**
   - No console.log statements (use `logger`)
   - No hardcoded credentials
   - No sensitive data in comments
   - Proper error handling

### PR Template

When creating a PR, include:

```markdown
## Summary
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that changes existing functionality)
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new TypeScript errors
- [ ] No new linting warnings
- [ ] Tests pass locally
```

### Review Process

1. Create PR against `develop` branch (or `main` for hotfixes)
2. Request review from at least one team member
3. Address all review comments
4. Ensure CI pipeline passes
5. Squash and merge when approved

---

## Security Considerations

### HIPAA Compliance

This is a healthcare platform. ALL code changes must consider:

1. **PHI Protection**
   - Never log patient identifiable information
   - Use encryption for sensitive data storage
   - Implement proper access controls

2. **Audit Logging**
   - Log all PHI access (read/write)
   - Include user ID, timestamp, and action
   - Never log the actual PHI data

3. **Access Control**
   - Verify user permissions before data access
   - Use `withAuth` middleware for all protected routes
   - Implement clinic-level data isolation

### Security Checklist

Before submitting code that handles sensitive data:

- [ ] PHI is encrypted at rest
- [ ] PHI is never logged in plaintext
- [ ] Access is properly authorized
- [ ] Audit log entry is created
- [ ] Input is validated and sanitized
- [ ] SQL injection prevention (use Prisma)
- [ ] XSS prevention (React handles this)
- [ ] CSRF protection enabled

### Reporting Security Issues

**DO NOT** create public issues for security vulnerabilities.

Contact the security team directly at: security@eonpro.health

---

## Questions?

- Check [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for common issues
- Review [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for setup help
- Ask in the team Slack channel

---

Thank you for contributing to EONPRO! 🏥
