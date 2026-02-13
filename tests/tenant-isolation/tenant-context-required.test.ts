/**
 * Tenant isolation: missing tenant context must throw for clinic-isolated models.
 * Cross-tenant ID must not be queryable (defense-in-depth).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantContextRequiredError } from '@/lib/tenant-context';

vi.mock('@prisma/client', () => {
  const mockDelegate = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  };
  return {
    PrismaClient: class MockPrismaClient {
      patient = mockDelegate;
      invoice = mockDelegate;
      order = mockDelegate;
      clinic = { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() };
      $connect = vi.fn();
      $disconnect = vi.fn();
      $transaction = vi.fn((cb: (tx: any) => any) => cb(mockDelegate));
    },
    Prisma: {},
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { security: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/database/connection-pool', () => ({
  connectionPool: { recordQuery: vi.fn(), shutdown: vi.fn(), startHealthCheck: vi.fn(), getHealthStatus: vi.fn(), getMetrics: vi.fn() },
  withRetry: (fn: () => Promise<any>) => fn(),
  withTimeout: <T>(p: Promise<T>) => p,
}));

vi.mock('@/lib/database/serverless-pool', () => ({
  getServerlessConfig: () => ({}),
  buildServerlessConnectionUrl: () => process.env.DATABASE_URL || 'postgresql://localhost/db',
  logPoolConfiguration: vi.fn(),
  drainManager: { register: vi.fn() },
  checkDatabaseHealth: vi.fn(),
  getPoolStats: vi.fn(),
}));

describe('TenantContextRequiredError', () => {
  it('has code TENANT_CONTEXT_REQUIRED', () => {
    const err = new TenantContextRequiredError();
    expect(err.code).toBe('TENANT_CONTEXT_REQUIRED');
    expect(err.name).toBe('TenantContextRequiredError');
  });
});

describe('tenant context required for clinic-isolated access', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.BYPASS_CLINIC_FILTER;
  });

  it('prisma.patient.findMany without context throws TenantContextRequiredError', async () => {
    const { prisma } = await import('@/lib/db');
    await expect(prisma.patient.findMany()).rejects.toThrow(/Tenant context is required/);
    try {
      await prisma.patient.findMany();
    } catch (e: any) {
      expect(e?.code).toBe('TENANT_CONTEXT_REQUIRED');
    }
  });

  it('prisma.patient.findMany with context does not throw', async () => {
    const { prisma, runWithClinicContext } = await import('@/lib/db');
    let threw = false;
    try {
      await runWithClinicContext(1, () => prisma.patient.findMany());
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});
