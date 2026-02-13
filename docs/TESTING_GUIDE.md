# EONPRO Testing Guide

## Overview

This guide covers the comprehensive testing strategy for EONPRO, including unit tests, integration
tests, E2E tests, and security testing.

## Table of Contents

1. [Test Structure](#test-structure)
2. [Running Tests](#running-tests)
3. [Writing Tests](#writing-tests)
4. [Coverage Requirements](#coverage-requirements)
5. [CI/CD Integration](#cicd-integration)

---

## Test Structure

```
tests/
├── unit/                     # Unit tests
│   ├── auth/                 # Authentication tests
│   │   └── middleware.test.ts
│   ├── security/             # Security module tests
│   │   └── encryption.test.ts
│   └── services/             # Service tests
│
├── integration/              # Integration tests
│   ├── api/                  # API integration tests
│   │   └── patients.integration.test.ts
│   └── db/                   # Database integration tests
│
├── e2e/                      # End-to-end tests
│   ├── auth.setup.ts         # Auth setup for E2E
│   ├── smoke.e2e.ts          # Smoke tests
│   └── *.e2e.ts              # Feature E2E tests
│
└── setup/                    # Test setup utilities
    └── test-utils.ts
```

---

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm run test

# Run with coverage
npm run test -- --coverage

# Run specific test file
npm run test -- tests/unit/auth/middleware.test.ts

# Run in watch mode
npm run test -- --watch

# Run with UI
npm run test -- --ui
```

### Integration Tests

```bash
# Run integration tests
npm run test -- tests/integration/

# Run with database
DATABASE_URL=postgresql://... npm run test -- tests/integration/
```

### E2E Tests

```bash
# Install Playwright browsers (first time)
npx playwright install

# Run all E2E tests
npx playwright test

# Run specific browser
npx playwright test --project=chromium

# Run with UI
npx playwright test --ui

# Run specific test file
npx playwright test tests/e2e/smoke.e2e.ts

# Generate report
npx playwright show-report
```

---

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('MyModule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('myFunction', () => {
    it('should do something', () => {
      const result = myFunction('input');
      expect(result).toBe('expected');
    });

    it('should handle edge cases', () => {
      expect(() => myFunction(null)).toThrow();
    });
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe('API Integration', () => {
  it('should return data for authenticated request', async () => {
    const { prisma } = await import('@/lib/db');
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 1 });

    const { GET } = await import('@/app/api/users/route');
    const request = new NextRequest('http://localhost/api/users');

    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test.describe('User Flow', () => {
  test('should complete checkout', async ({ page }) => {
    // Navigate
    await page.goto('/products');

    // Interact
    await page.click('[data-testid="add-to-cart"]');
    await page.click('[data-testid="checkout"]');

    // Assert
    await expect(page.locator('[data-testid="success"]')).toBeVisible();
  });
});
```

---

## Coverage Requirements

### Global Thresholds

| Metric     | Minimum |
| ---------- | ------- |
| Statements | 70%     |
| Branches   | 65%     |
| Functions  | 70%     |
| Lines      | 70%     |

### Critical Module Thresholds

| Module                  | Statements | Branches |
| ----------------------- | ---------- | -------- |
| `src/lib/auth/**`       | 85%        | 80%      |
| `src/lib/security/**`   | 90%        | 85%      |
| `src/lib/encryption.ts` | 95%        | 90%      |

### Checking Coverage

```bash
# Generate coverage report
npm run test -- --coverage

# View HTML report
open coverage/index.html
```

---

## CI/CD Integration

### GitHub Actions Workflow

Tests run automatically on:

- Every push to `main`, `develop`, `feature/*`
- Every pull request

### Quality Gates

PR cannot be merged if:

- Any test fails
- Coverage drops below thresholds
- Lint errors exist
- Security vulnerabilities found

### Test Artifacts

- Coverage reports uploaded to Codecov
- Test results in JUnit format
- E2E screenshots on failure
- Performance metrics tracked

---

## Test Utilities

### Mock Request

```typescript
import { createMockRequest } from '@/tests/setup/test-utils';

const request = createMockRequest('POST', '/api/users', {
  headers: { Authorization: 'Bearer token' },
  body: { name: 'Test' },
});
```

### Mock User

```typescript
import { createMockUser } from '@/tests/setup/test-utils';

const user = createMockUser({
  role: 'admin',
  clinicId: 1,
});
```

### Mock Token

```typescript
import { createTestToken } from '@/tests/setup/test-utils';

const token = await createTestToken({
  id: 1,
  email: 'test@example.com',
  role: 'admin',
});
```

---

## Best Practices

1. **Test behavior, not implementation**
2. **Use descriptive test names**
3. **Follow AAA pattern** (Arrange, Act, Assert)
4. **Mock external dependencies**
5. **Keep tests independent**
6. **Test edge cases and error paths**
7. **Use data-testid for E2E selectors**

---

## Troubleshooting

### Tests Timing Out

```bash
# Increase timeout
npm run test -- --testTimeout=60000
```

### Database Tests Failing

```bash
# Reset test database
npx prisma migrate reset --force
```

### E2E Tests Flaky

```bash
# Run with retries
npx playwright test --retries=3
```

---

_Last Updated: December 2025_
