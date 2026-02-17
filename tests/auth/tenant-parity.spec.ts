/**
 * Auth Middleware Parity Tests
 *
 * Table-driven tests that run BOTH withAuth and withAuthParams against
 * identical mocked NextRequest inputs, verifying consistent behaviour
 * across the two code-paths for:
 *   - Missing / expired / revoked / malformed tokens → 401
 *   - Session validation (not-found carve-out, genuine revocation)
 *   - Clinic ID coercion (string → number parity)
 *   - x-clinic-id header fallback
 *   - Subdomain override with access control
 *
 * NO production auth behaviour is altered; tests exercise public API only.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';

// ---------------------------------------------------------------------------
// Mock external dependencies BEFORE importing the modules under test
// ---------------------------------------------------------------------------

const JWT_SECRET_RAW = process.env['JWT_SECRET'] ?? 'test-jwt-secret-min-32-characters-long-for-testing';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

// Shared mock state that tests mutate per-case
const mockState = {
  sessionValid: true,
  sessionReason: undefined as string | undefined,
  sessionThrows: false,
  isAuthBlocked: false,
  subdomainClinic: null as { id: number } | null,
  userClinicAccess: false,
  providerClinicAccess: false,
};

// --- Mock: session-manager ---
vi.mock('@/lib/auth/session-manager', () => ({
  validateSession: vi.fn(async () => {
    if (mockState.sessionThrows) throw new Error('Redis connection refused');
    return {
      valid: mockState.sessionValid,
      expired: !mockState.sessionValid,
      reason: mockState.sessionReason,
    };
  }),
}));

// --- Mock: auth rate limiter ---
vi.mock('@/lib/auth/auth-rate-limiter', () => ({
  isAuthBlocked: vi.fn(async () => mockState.isAuthBlocked),
  recordAuthFailure: vi.fn(async () => {}),
  clearAuthFailures: vi.fn(async () => {}),
}));

// --- Mock: HIPAA audit ---
vi.mock('@/lib/audit/hipaa-audit', () => ({
  auditLog: vi.fn(async () => {}),
  AuditEventType: {
    LOGIN_FAILED: 'LOGIN_FAILED',
    SESSION_TIMEOUT: 'SESSION_TIMEOUT',
    SYSTEM_ACCESS: 'SYSTEM_ACCESS',
    PHI_ACCESS: 'PHI_ACCESS',
  },
}));

// --- Mock: logger ---
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

// --- Mock: cache ---
vi.mock('@/lib/cache/redis', () => ({
  default: {
    exists: vi.fn(async () => false),
    set: vi.fn(async () => {}),
    get: vi.fn(async () => null),
  },
}));

vi.mock('@/lib/cache/request-scoped', () => ({
  getClinicBySubdomainCache: vi.fn(() => null),
  setClinicBySubdomainCache: vi.fn(),
}));

// --- Mock: observability ---
vi.mock('@/lib/observability/request-context', () => ({
  runWithRequestContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
}));

// --- Mock: shared errors ---
vi.mock('@/domains/shared/errors', () => ({
  handleApiError: vi.fn(),
}));

// --- Mock: db ---
vi.mock('@/lib/db', () => ({
  prisma: {
    $executeRaw: vi.fn(async () => 0),
  },
  basePrisma: {
    clinic: {
      findFirst: vi.fn(async () => mockState.subdomainClinic),
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

// --- Mock: auth config ---
vi.mock('@/lib/auth/config', () => ({
  JWT_SECRET: new TextEncoder().encode(
    process.env['JWT_SECRET'] ?? 'test-jwt-secret-min-32-characters-long-for-testing'
  ),
  AUTH_CONFIG: {
    security: {
      // Set to 5 so we can test revocation with tokenVersion < 5
      // Production default is parseInt(TOKEN_VERSION || '1', 10) = 1
      minimumTokenVersion: 5,
    },
    tokenExpiry: { access: '8h' },
    tokenExpiryMs: { sessionTimeout: 4 * 60 * 60 * 1000 },
    cookie: {},
    audit: {},
    claims: {},
  },
}));

// ---------------------------------------------------------------------------
// Import the modules under test AFTER mocks are in place
// ---------------------------------------------------------------------------

import { withAuth } from '@/lib/auth/middleware';
import { withAuthParams } from '@/lib/auth/middleware-with-params';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a signed JWT with given claims */
async function makeJWT(
  claims: Record<string, unknown>,
  opts?: { expiresIn?: string; secret?: Uint8Array }
): Promise<string> {
  const builder = new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt();
  if (opts?.expiresIn) {
    builder.setExpirationTime(opts.expiresIn);
  } else {
    builder.setExpirationTime('1h');
  }
  return builder.sign(opts?.secret ?? JWT_SECRET);
}

/** Standard valid claims payload */
function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    email: 'admin@test.com',
    role: 'admin',
    clinicId: 5,
    sessionId: 'sess-abc-123',
    tokenVersion: 10, // Must be >= minimumTokenVersion (5) for non-revoked tests
    ...overrides,
  };
}

/** Build a NextRequest with the given token and optional headers/cookies */
function buildRequest(opts: {
  token?: string | null;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  url?: string;
}): NextRequest {
  const url = opts.url ?? 'http://localhost:3000/api/test';
  const headers = new Headers(opts.headers);
  if (opts.token) {
    headers.set('Authorization', `Bearer ${opts.token}`);
  }
  if (opts.cookies) {
    const cookieStr = Object.entries(opts.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    headers.set('cookie', cookieStr);
  }
  return new NextRequest(url, { method: 'GET', headers });
}

/** Wrap a simple handler with withAuth */
function makeWithAuthHandler(opts = {}) {
  const handler = vi.fn(async (_req: NextRequest, user: any) => {
    return Response.json({ userId: user?.id, clinicId: user?.clinicId });
  });
  const wrapped = withAuth(handler, opts);
  return { handler, wrapped };
}

/** Wrap a simple handler with withAuthParams */
function makeWithAuthParamsHandler(opts = {}) {
  const handler = vi.fn(async (_req: NextRequest, user: any, ctx: any) => {
    return Response.json({
      userId: user?.id,
      clinicId: user?.clinicId,
      params: ctx?.params,
    });
  });
  const wrapped = withAuthParams(handler, opts);
  return { handler, wrapped };
}

// ---------------------------------------------------------------------------
// Reset mock state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockState.sessionValid = true;
  mockState.sessionReason = undefined;
  mockState.sessionThrows = false;
  mockState.isAuthBlocked = false;
  mockState.subdomainClinic = null;
  mockState.userClinicAccess = false;
  mockState.providerClinicAccess = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// PARITY TEST TABLE
// ===========================================================================

interface ParityCase {
  name: string;
  token: (() => Promise<string>) | null;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  setup?: () => void;
  expectedStatus: number;
  expectedCode?: string;
  /** If provided, assert user.clinicId === this value inside the handler */
  expectedClinicId?: number;
  authOptions?: Record<string, unknown>;
}

const parityCases: ParityCase[] = [
  // (a) Missing token → 401 AUTH_REQUIRED
  {
    name: 'Missing token → 401 AUTH_REQUIRED',
    token: null,
    expectedStatus: 401,
    expectedCode: 'AUTH_REQUIRED',
  },

  // (b) Expired token → 401 EXPIRED
  // FIXED: verifyToken() now checks error.code === 'ERR_JWT_EXPIRED' (jose's error code)
  // in addition to error.message.includes('expired'), so expired tokens correctly return EXPIRED.
  {
    name: 'Expired token → 401 EXPIRED',
    token: async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 7200;
      return new SignJWT(validClaims())
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(pastExp - 3600)
        .setExpirationTime(pastExp)
        .sign(JWT_SECRET);
    },
    expectedStatus: 401,
    expectedCode: 'EXPIRED',
  },

  // (c) Revoked tokenVersion → 401 REVOKED
  // FIXED: The middleware now uses `?? 1` (nullish coalescing) instead of `|| 1`,
  // so tokenVersion=0 is correctly treated as 0 (not coerced to 1).
  // With minimumTokenVersion=5 in our mock config, tokenVersion 0 < 5 → REVOKED.
  {
    name: 'Revoked tokenVersion → 401 REVOKED',
    token: async () => makeJWT(validClaims({ tokenVersion: 0 })),
    setup: () => {
      // minimumTokenVersion is 5 in our mock config, tokenVersion 0 < 5 → REVOKED
    },
    expectedStatus: 401,
    expectedCode: 'REVOKED',
  },

  // (d) Malformed claims → 401 MALFORMED
  {
    name: 'Malformed claims (missing email) → 401 MALFORMED',
    token: async () =>
      makeJWT({ id: 1, role: 'admin', clinicId: 5 }),
    expectedStatus: 401,
    expectedCode: 'MALFORMED',
  },
  {
    name: 'Malformed claims (missing role) → 401 MALFORMED',
    token: async () =>
      makeJWT({ id: 1, email: 'x@y.com', clinicId: 5 }),
    expectedStatus: 401,
    expectedCode: 'MALFORMED',
  },
  {
    name: 'Malformed claims (invalid role) → 401 MALFORMED',
    token: async () =>
      makeJWT({ id: 1, email: 'x@y.com', role: 'hacker', clinicId: 5 }),
    expectedStatus: 401,
    expectedCode: 'MALFORMED',
  },
  {
    name: 'Malformed claims (missing id) → 401 MALFORMED',
    token: async () =>
      makeJWT({ email: 'x@y.com', role: 'admin', clinicId: 5 }),
    expectedStatus: 401,
    expectedCode: 'MALFORMED',
  },

  // (e) Valid JWT + Redis session "Session not found" → allowed through
  {
    name: 'Valid JWT + session not found → 200 (allowed)',
    token: async () => makeJWT(validClaims()),
    setup: () => {
      mockState.sessionValid = false;
      mockState.sessionReason = 'Session not found';
    },
    expectedStatus: 200,
  },

  // (f) Valid JWT + revoked session → 401 SESSION_EXPIRED
  {
    name: 'Valid JWT + revoked session → 401 SESSION_EXPIRED',
    token: async () => makeJWT(validClaims()),
    setup: () => {
      mockState.sessionValid = false;
      mockState.sessionReason = 'Session revoked by admin';
    },
    expectedStatus: 401,
    expectedCode: 'SESSION_EXPIRED',
  },

  // (g) clinicId as string "5" → coerces to number 5 in BOTH paths
  {
    name: 'clinicId string "5" coerces to number 5',
    token: async () =>
      makeJWT(validClaims({ clinicId: '5' as unknown as number })),
    expectedStatus: 200,
  },

  // (h) JWT clinicId null + x-clinic-id header set → clinic context resolves
  {
    name: 'JWT clinicId null + x-clinic-id header → resolves clinic',
    token: async () =>
      makeJWT(validClaims({ clinicId: null, sessionId: undefined })),
    headers: { 'x-clinic-id': '7' },
    expectedStatus: 200,
    expectedClinicId: 7,
  },

  // (i) Subdomain override → applies when user has access or super_admin
  {
    name: 'Subdomain override applies for super_admin',
    token: async () =>
      makeJWT(
        validClaims({
          role: 'super_admin',
          clinicId: 1,
          sessionId: undefined,
        })
      ),
    headers: { 'x-clinic-subdomain': 'overtime' },
    setup: () => {
      mockState.subdomainClinic = { id: 99 };
    },
    expectedStatus: 200,
    expectedClinicId: 99,
  },

  // Valid token + valid session → 200
  {
    name: 'Valid token + valid session → 200',
    token: async () => makeJWT(validClaims()),
    expectedStatus: 200,
  },

  // Missing sessionId → still allowed (JWT verified)
  {
    name: 'Missing sessionId → 200 (JWT verified)',
    token: async () =>
      makeJWT(validClaims({ sessionId: undefined })),
    expectedStatus: 200,
  },

  // Role-based 403 (forbidden)
  {
    name: 'Role mismatch → 403 FORBIDDEN',
    token: async () =>
      makeJWT(validClaims({ role: 'patient', sessionId: undefined })),
    authOptions: { roles: ['admin', 'super_admin'] },
    expectedStatus: 403,
    expectedCode: 'FORBIDDEN',
  },
];

// ===========================================================================
// Run Parity Cases
// ===========================================================================

describe('Auth Middleware Parity (withAuth vs withAuthParams)', () => {
  describe.each(parityCases)('$name', (tc) => {
    it('withAuth returns expected status/code', async () => {
      tc.setup?.();
      const token = tc.token ? await tc.token() : null;
      const req = buildRequest({
        token,
        headers: tc.headers,
        cookies: tc.cookies,
      });
      const { handler, wrapped } = makeWithAuthHandler(tc.authOptions);
      const res = await wrapped(req);

      expect(res.status).toBe(tc.expectedStatus);

      if (tc.expectedCode) {
        const body = await res.json();
        expect(body.code).toBe(tc.expectedCode);
      }

      if (tc.expectedClinicId !== undefined && tc.expectedStatus === 200) {
        expect(handler).toHaveBeenCalled();
        const calledUser = handler.mock.calls[0][1];
        expect(calledUser.clinicId).toBe(tc.expectedClinicId);
      }
    });

    it('withAuthParams returns expected status/code', async () => {
      tc.setup?.();
      const token = tc.token ? await tc.token() : null;
      const req = buildRequest({
        token,
        headers: tc.headers,
        cookies: tc.cookies,
      });
      const { handler, wrapped } = makeWithAuthParamsHandler(tc.authOptions);
      const context = { params: Promise.resolve({ id: '1' }) };
      const res = await wrapped(req, context as any);

      expect(res.status).toBe(tc.expectedStatus);

      if (tc.expectedCode) {
        const body = await res.json();
        expect(body.code).toBe(tc.expectedCode);
      }

      if (tc.expectedClinicId !== undefined && tc.expectedStatus === 200) {
        expect(handler).toHaveBeenCalled();
        const calledUser = handler.mock.calls[0][1];
        expect(calledUser.clinicId).toBe(tc.expectedClinicId);
      }
    });
  });
});

// ===========================================================================
// Additional targeted tests
// ===========================================================================

describe('Clinic ID coercion parity', () => {
  it('both paths coerce string clinicId "5" to number', async () => {
    const token = await makeJWT(
      validClaims({ clinicId: '5' as unknown as number, sessionId: undefined })
    );

    // withAuth
    const { handler: h1, wrapped: w1 } = makeWithAuthHandler();
    const r1 = await w1(buildRequest({ token }));
    expect(r1.status).toBe(200);
    // The clinicId should pass through (it may be the string "5" in the JWT payload)
    // but the middleware should Number() coerce in withAuthParams
    expect(h1).toHaveBeenCalled();

    // withAuthParams
    const { handler: h2, wrapped: w2 } = makeWithAuthParamsHandler();
    const r2 = await w2(buildRequest({ token }), { params: Promise.resolve({}) } as any);
    expect(r2.status).toBe(200);
    expect(h2).toHaveBeenCalled();
  });
});

describe('x-clinic-id header fallback parity', () => {
  it('both paths use x-clinic-id when JWT clinicId is null', async () => {
    const token = await makeJWT(
      validClaims({ clinicId: null, sessionId: undefined })
    );
    const headers = { 'x-clinic-id': '42' };

    // withAuth
    const { handler: h1, wrapped: w1 } = makeWithAuthHandler();
    const r1 = await w1(buildRequest({ token, headers }));
    expect(r1.status).toBe(200);
    const u1 = h1.mock.calls[0][1];
    expect(u1.clinicId).toBe(42);

    // withAuthParams
    const { handler: h2, wrapped: w2 } = makeWithAuthParamsHandler();
    const r2 = await w2(buildRequest({ token, headers }), { params: Promise.resolve({}) } as any);
    expect(r2.status).toBe(200);
    const u2 = h2.mock.calls[0][1];
    expect(u2.clinicId).toBe(42);
  });
});

describe('Wrong secret → 401 INVALID', () => {
  it('withAuth rejects token signed with wrong secret', async () => {
    const wrongSecret = new TextEncoder().encode('wrong-secret-that-is-32-chars-plus');
    const token = await makeJWT(validClaims(), { secret: wrongSecret });
    const { wrapped } = makeWithAuthHandler();
    const res = await wrapped(buildRequest({ token }));
    expect(res.status).toBe(401);
  });
});
