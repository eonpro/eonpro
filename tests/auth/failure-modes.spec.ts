/**
 * Infrastructure Failure-Mode Tests
 *
 * Validates that the auth middleware stack handles infrastructure outages
 * gracefully:
 *   - Redis down:  Should NOT randomly 401; follows existing policy
 *                  (missing session allowed, validated session error → depends
 *                   on whether session check is enabled)
 *   - DB down:     withAuth returns 503 (SERVICE_UNAVAILABLE) for connection errors
 *   - Missing Edge headers: Middleware still resolves without crashing
 *
 * These tests exercise the production error-handling code paths without
 * changing any production behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import {
  createPrismaConnectionError,
  createRedisConnectionError,
} from './failure-modes';

// Override the global @prisma/client mock to include the Prisma namespace
// (needed by isDatabaseConnectionError in middleware.ts)
vi.mock('@prisma/client', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    Prisma: {
      PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
        code: string;
        clientVersion: string;
        constructor(message: string, { code, clientVersion }: { code: string; clientVersion: string }) {
          super(message);
          this.name = 'PrismaClientKnownRequestError';
          this.code = code;
          this.clientVersion = clientVersion;
        }
      },
      PrismaClientInitializationError: class PrismaClientInitializationError extends Error {
        clientVersion: string;
        constructor(message: string, clientVersion: string) {
          super(message);
          this.name = 'PrismaClientInitializationError';
          this.clientVersion = clientVersion;
        }
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Shared JWT secret
// ---------------------------------------------------------------------------

const JWT_SECRET_RAW = process.env['JWT_SECRET'] ?? 'test-jwt-secret-min-32-characters-long-for-testing';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

const mockState = {
  sessionValid: true,
  sessionReason: undefined as string | undefined,
  sessionThrows: false,
  isAuthBlocked: false,
  subdomainClinic: null as { id: number } | null,
  userClinicAccess: false,
  providerClinicAccess: false,
  dbThrowsOnSubdomain: false,
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth/session-manager', () => ({
  validateSession: vi.fn(async () => {
    if (mockState.sessionThrows) {
      throw createRedisConnectionError();
    }
    return {
      valid: mockState.sessionValid,
      expired: !mockState.sessionValid,
      reason: mockState.sessionReason,
    };
  }),
}));

vi.mock('@/lib/auth/auth-rate-limiter', () => ({
  isAuthBlocked: vi.fn(async () => mockState.isAuthBlocked),
  recordAuthFailure: vi.fn(async () => {}),
  clearAuthFailures: vi.fn(async () => {}),
}));

vi.mock('@/lib/audit/hipaa-audit', () => ({
  auditLog: vi.fn(async () => {}),
  AuditEventType: {
    LOGIN_FAILED: 'LOGIN_FAILED',
    SESSION_TIMEOUT: 'SESSION_TIMEOUT',
    SYSTEM_ACCESS: 'SYSTEM_ACCESS',
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
    api: vi.fn(),
    requestSummary: vi.fn(),
  },
}));

vi.mock('@/lib/cache/redis', () => ({
  default: {
    exists: vi.fn(async () => false),
    set: vi.fn(async () => {}),
  },
}));

vi.mock('@/lib/cache/request-scoped', () => ({
  getClinicBySubdomainCache: vi.fn(() => null),
  setClinicBySubdomainCache: vi.fn(),
}));

vi.mock('@/lib/observability/request-context', () => ({
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

vi.mock('@/domains/shared/errors', () => ({
  handleApiError: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: { $executeRaw: vi.fn(async () => 0) },
  basePrisma: {
    clinic: {
      findFirst: vi.fn(async () => {
        if (mockState.dbThrowsOnSubdomain) {
          throw createPrismaConnectionError('P2024');
        }
        return mockState.subdomainClinic;
      }),
    },
    userClinic: {
      findFirst: vi.fn(async () =>
        mockState.userClinicAccess ? { id: 1 } : null
      ),
    },
    providerClinic: {
      findFirst: vi.fn(async () =>
        mockState.providerClinicAccess ? { id: 1 } : null
      ),
    },
  },
  setClinicContext: vi.fn(),
  getClinicContext: vi.fn(() => undefined),
  runWithClinicContext: vi.fn((_clinicId: unknown, fn: () => unknown) => fn()),
  clinicContextStorage: {
    getStore: vi.fn(() => undefined),
    run: vi.fn((_store: unknown, fn: () => unknown) => fn()),
  },
}));

vi.mock('@/lib/auth/config', () => ({
  JWT_SECRET: new TextEncoder().encode(
    process.env['JWT_SECRET'] ?? 'test-jwt-secret-min-32-characters-long-for-testing'
  ),
  AUTH_CONFIG: {
    security: { minimumTokenVersion: 1 },
    tokenExpiry: { access: '8h' },
    tokenExpiryMs: { sessionTimeout: 4 * 60 * 60 * 1000 },
    cookie: {},
    audit: {},
    claims: {},
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { withAuth } from '@/lib/auth/middleware';
import { withAuthParams } from '@/lib/auth/middleware-with-params';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeJWT(overrides: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({
    id: 1,
    email: 'admin@test.com',
    role: 'admin',
    clinicId: 5,
    sessionId: 'sess-123',
    tokenVersion: 2,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(JWT_SECRET);
}

function buildRequest(opts: {
  token: string;
  headers?: Record<string, string>;
}): NextRequest {
  const h = new Headers(opts.headers);
  h.set('Authorization', `Bearer ${opts.token}`);
  return new NextRequest('http://localhost:3000/api/test', {
    method: 'GET',
    headers: h,
  });
}

function successHandler() {
  return vi.fn(async () => Response.json({ ok: true }));
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockState.sessionValid = true;
  mockState.sessionReason = undefined;
  mockState.sessionThrows = false;
  mockState.isAuthBlocked = false;
  mockState.subdomainClinic = null;
  mockState.userClinicAccess = false;
  mockState.providerClinicAccess = false;
  mockState.dbThrowsOnSubdomain = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// FAILURE MODE: Redis Down
// ===========================================================================

describe('Failure Mode: Redis Down', () => {
  it('withAuth: Redis down during session validation → middleware catches and returns 503 (not random 401)', async () => {
    mockState.sessionThrows = true;
    const token = await makeJWT();
    const handler = successHandler();
    const wrapped = withAuth(handler);
    const res = await wrapped(buildRequest({ token }));

    // When validateSession throws ECONNREFUSED, the error propagates to the
    // catch block.  isDatabaseConnectionError() detects "econnrefused" in the
    // error message and correctly returns 503 SERVICE_UNAVAILABLE.
    // FINDING: This is good — Redis failures don't cause random 401s.
    // They're classified as infrastructure errors (503) with Retry-After.
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('withAuthParams: Redis down during session validation → 503 (not random 401)', async () => {
    mockState.sessionThrows = true;
    const token = await makeJWT();
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const wrapped = withAuthParams(handler);
    const res = await wrapped(buildRequest({ token }), { params: Promise.resolve({}) } as any);

    // FIXED: withAuthParams now has isDatabaseConnectionError detection (parity with withAuth).
    // ECONNREFUSED is classified as a connection error → 503 with SERVICE_UNAVAILABLE.
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('withAuth: Redis down but no sessionId in JWT → handler still executes (no session check)', async () => {
    mockState.sessionThrows = true;
    const token = await makeJWT({ sessionId: undefined });
    const handler = successHandler();
    const wrapped = withAuth(handler);
    const res = await wrapped(buildRequest({ token }));

    // No sessionId means session validation is skipped → handler runs
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it('withAuthParams: Redis down but no sessionId → handler still executes', async () => {
    mockState.sessionThrows = true;
    const token = await makeJWT({ sessionId: undefined });
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const wrapped = withAuthParams(handler);
    const res = await wrapped(buildRequest({ token }), { params: Promise.resolve({}) } as any);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });
});

// ===========================================================================
// FAILURE MODE: DB Down (subdomain lookup)
// ===========================================================================

describe('Failure Mode: DB Down (subdomain lookup)', () => {
  it('withAuth: DB error during subdomain lookup → middleware continues with JWT clinicId', async () => {
    mockState.dbThrowsOnSubdomain = true;
    const token = await makeJWT({ sessionId: undefined });
    const handler = successHandler();
    const wrapped = withAuth(handler);
    const res = await wrapped(
      buildRequest({ token, headers: { 'x-clinic-subdomain': 'overtime' } })
    );

    // Both withAuth and withAuthParams wrap subdomain lookup in try-catch
    // and fall back to previous effectiveClinicId on error
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it('withAuthParams: DB error during subdomain lookup → continues with JWT clinicId', async () => {
    mockState.dbThrowsOnSubdomain = true;
    const token = await makeJWT({ sessionId: undefined });
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const wrapped = withAuthParams(handler);
    const res = await wrapped(
      buildRequest({ token, headers: { 'x-clinic-subdomain': 'overtime' } }),
      { params: Promise.resolve({}) } as any
    );

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });
});

// ===========================================================================
// FAILURE MODE: Missing Edge Headers
// ===========================================================================

describe('Failure Mode: Missing Edge Headers', () => {
  it('withAuth: no x-clinic-id, no x-clinic-subdomain → uses JWT clinicId', async () => {
    const token = await makeJWT({ clinicId: 5, sessionId: undefined });
    const handler = successHandler();
    const wrapped = withAuth(handler);
    const res = await wrapped(buildRequest({ token }));

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
    const calledUser = handler.mock.calls[0][1];
    // clinicId comes from JWT directly
    expect(calledUser.clinicId).toBe(5);
  });

  it('withAuthParams: no edge headers → uses JWT clinicId', async () => {
    const token = await makeJWT({ clinicId: 5, sessionId: undefined });
    const handler = vi.fn(async (_r: any, user: any) => Response.json({ clinicId: user.clinicId }));
    const wrapped = withAuthParams(handler);
    const res = await wrapped(buildRequest({ token }), { params: Promise.resolve({}) } as any);

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
    const calledUser = handler.mock.calls[0][1];
    expect(calledUser.clinicId).toBe(5);
  });

  it('withAuth: no edge headers + JWT clinicId null → clinicId remains undefined', async () => {
    const token = await makeJWT({ clinicId: null, sessionId: undefined });
    const handler = successHandler();
    const wrapped = withAuth(handler);
    const res = await wrapped(buildRequest({ token }));

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
    const calledUser = handler.mock.calls[0][1];
    // No edge headers and null JWT clinicId → undefined
    expect(calledUser.clinicId).toBeUndefined();
  });
});

// ===========================================================================
// FAILURE MODE: Rate Limiting
// ===========================================================================

describe('Failure Mode: Auth Rate Limiting', () => {
  it('withAuth: blocked IP returns 429', async () => {
    mockState.isAuthBlocked = true;
    const token = await makeJWT();
    const handler = successHandler();
    const wrapped = withAuth(handler);
    const res = await wrapped(buildRequest({ token }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('AUTH_RATE_LIMITED');
    expect(handler).not.toHaveBeenCalled();
  });

  it('withAuthParams: blocked IP returns 429 (parity with withAuth)', async () => {
    mockState.isAuthBlocked = true;
    const token = await makeJWT();
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const wrapped = withAuthParams(handler);
    const res = await wrapped(buildRequest({ token }), { params: Promise.resolve({}) } as any);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('AUTH_RATE_LIMITED');
    expect(handler).not.toHaveBeenCalled();
  });
});
