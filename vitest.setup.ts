/**
 * Vitest Setup File
 * Configures global test environment for all tests
 */

import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';

// ============================================================================
// Environment Configuration
// ============================================================================

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-min-32-characters-long-for-testing';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-characters';
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes hex
process.env.DATABASE_URL = 'file:./test.db';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.NEXTAUTH_SECRET = 'test-nextauth-secret-for-testing';

// ============================================================================
// Global Mocks
// ============================================================================

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(() => []),
    has: vi.fn(() => false),
  }),
  headers: () => new Headers(),
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  addBreadcrumb: vi.fn(),
  startSpan: vi.fn((_, callback) => callback()),
  withScope: vi.fn((callback) => callback({ setExtra: vi.fn() })),
  browserTracingIntegration: vi.fn(() => ({})),
  replayIntegration: vi.fn(() => ({})),
  breadcrumbsIntegration: vi.fn(() => ({})),
}));

// Mock Prisma Client
vi.mock('@prisma/client', () => {
  const mockPrismaClient = {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $transaction: vi.fn((fn) => fn(mockPrismaClient)),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    patient: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    provider: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    clinic: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    userAuditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };

  return {
    PrismaClient: vi.fn(() => mockPrismaClient),
  };
});

// ============================================================================
// Global Test Hooks
// ============================================================================

beforeAll(() => {
  // Global setup before all tests
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterAll(() => {
  // Global cleanup after all tests
  vi.useRealTimers();
});

beforeEach(() => {
  // Reset mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
  vi.restoreAllMocks();
});

// ============================================================================
// Custom Matchers
// ============================================================================

expect.extend({
  toBeValidJWT(received: string) {
    const parts = received.split('.');
    const pass = parts.length === 3 && parts.every((part) => part.length > 0);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid JWT`
          : `expected ${received} to be a valid JWT with 3 parts`,
    };
  },

  toBeEncrypted(received: string) {
    // Check for our encryption format: base64:base64:base64
    const parts = received.split(':');
    const pass = parts.length === 3;
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be encrypted`
          : `expected ${received} to be in encrypted format (iv:tag:ciphertext)`,
    };
  },

  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid UUID`
          : `expected ${received} to be a valid UUID`,
    };
  },

  toHaveSecurityHeaders(received: Response) {
    const requiredHeaders = [
      'x-content-type-options',
      'x-frame-options',
    ];
    const missingHeaders = requiredHeaders.filter(
      (header) => !received.headers.has(header)
    );
    const pass = missingHeaders.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? `expected response not to have security headers`
          : `expected response to have security headers, missing: ${missingHeaders.join(', ')}`,
    };
  },
});

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Creates a mock NextRequest for testing API routes
 */
export function createMockRequest(
  method: string = 'GET',
  url: string = 'http://localhost:3000/api/test',
  options: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    body?: unknown;
  } = {}
): Request {
  const headers = new Headers(options.headers);
  
  // Add cookies to headers
  if (options.cookies) {
    const cookieString = Object.entries(options.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    headers.set('cookie', cookieString);
  }

  return new Request(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

/**
 * Creates a mock authenticated user for testing
 */
export function createMockUser(overrides: Partial<{
  id: number;
  email: string;
  role: string;
  clinicId: number;
}> = {}) {
  return {
    id: 1,
    email: 'test@example.com',
    role: 'admin',
    clinicId: 1,
    ...overrides,
  };
}

/**
 * Creates a valid JWT token for testing
 */
export async function createTestToken(payload: Record<string, unknown> = {}): Promise<string> {
  const { SignJWT } = await import('jose');
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  
  return new SignJWT({
    id: 1,
    email: 'test@example.com',
    role: 'admin',
    clinicId: 1,
    ...payload,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000
): Promise<void> {
  const startTime = Date.now();
  while (!(await condition())) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// ============================================================================
// Type Augmentations
// ============================================================================

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toBeValidJWT(): T;
    toBeEncrypted(): T;
    toBeValidUUID(): T;
    toHaveSecurityHeaders(): T;
  }
  interface AsymmetricMatchersContaining {
    toBeValidJWT(): unknown;
    toBeEncrypted(): unknown;
    toBeValidUUID(): unknown;
    toHaveSecurityHeaders(): unknown;
  }
}
