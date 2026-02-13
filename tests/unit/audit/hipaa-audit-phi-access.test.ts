/**
 * Enterprise HIPAA auditPhiAccess tests
 *
 * - patient GET triggers audit record
 * - report export triggers audit record
 * - audit record contains clinicId, userId, requestId
 * - no PHI fields stored in metadata
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock db before importing hipaa-audit
const mockCreate = vi.fn();
vi.mock('@/lib/db', () => ({
  basePrisma: {
    hIPAAAuditEntry: {
      create: (args: { data: Record<string, unknown> }) => mockCreate(args),
    },
  },
}));

vi.mock('@/lib/logger', () => ({ logger: { api: vi.fn(), error: vi.fn() } }));

import { logger } from '@/lib/logger';
import { auditPhiAccess, buildAuditPhiOptions } from '@/lib/audit/hipaa-audit';

describe('auditPhiAccess', () => {
  const origAuditToDb = process.env.AUDIT_TO_DATABASE;

  beforeEach(() => {
    process.env.AUDIT_TO_DATABASE = 'true';
    mockCreate.mockReset();
    vi.mocked(logger.error).mockReset();
  });

  afterEach(() => {
    process.env.AUDIT_TO_DATABASE = origAuditToDb;
  });

  it('writes record with clinicId, userId, requestId', async () => {
    const request = new Request('http://localhost/api/patients/1', {
      headers: { 'x-request-id': 'req-123', 'x-forwarded-for': '1.2.3.4' },
    }) as any;

    await auditPhiAccess(request, {
      clinicId: 5,
      userId: 10,
      action: 'patient:view',
      patientId: 1,
      route: 'GET /api/patients/[id]',
      ip: '1.2.3.4',
      requestId: 'req-123',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const data = mockCreate.mock.calls[0][0].data;
    expect(data.clinicId).toBe(5);
    expect(data.userId).toBe('10');
    expect(data.requestId).toBe('req-123');
    expect(data.eventType).toBe('PHI_VIEW');
    expect(data.resourceType).toBe('patient');
    expect(data.patientId).toBe(1);
    expect(data.requestPath).toBe('GET /api/patients/[id]');
    expect(data.ipAddress).toBe('1.2.3.4');
  });

  it('report export triggers audit record with report:export', async () => {
    const request = new Request('http://localhost/api/reports/export?format=csv', {
      headers: { 'x-request-id': 'req-export-1' },
    }) as any;

    await auditPhiAccess(request, buildAuditPhiOptions(request, { id: 2, role: 'admin', clinicId: 3 }, 'report:export', { route: 'GET /api/reports/export' }));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const data = mockCreate.mock.calls[0][0].data;
    expect(data.eventType).toBe('PHI_EXPORT');
    expect(data.resourceType).toBe('report');
    expect(data.clinicId).toBe(3);
    expect(data.userId).toBe('2');
    expect(data.requestId).toBeDefined();
  });

  it('does not store PHI keys in metadata', async () => {
    const request = new Request('http://localhost/api/patients/1', { headers: {} }) as any;

    await auditPhiAccess(request, {
      clinicId: 1,
      userId: 1,
      action: 'patient:view',
      patientId: 1,
      route: 'GET /api/patients/[id]',
      ip: 'unknown',
      requestId: 'test-req',
      metadata: {
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-01',
        email: 'j@x.com',
        safeKey: 'allowed',
      },
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const metadata = mockCreate.mock.calls[0][0].data.metadata as Record<string, unknown>;
    expect(metadata).not.toHaveProperty('firstName');
    expect(metadata).not.toHaveProperty('lastName');
    expect(metadata).not.toHaveProperty('dob');
    expect(metadata).not.toHaveProperty('email');
    expect(metadata.safeKey).toBe('allowed');
  });

  it('buildAuditPhiOptions extracts route and requestId from request', () => {
    const request = new Request('http://localhost/api/patients/42', {
      headers: { 'x-request-id': 'from-header' },
    }) as any;

    const opts = buildAuditPhiOptions(request, { id: 1, role: 'provider', clinicId: 2 }, 'patient:view', { patientId: 42 });

    expect(opts.userId).toBe(1);
    expect(opts.clinicId).toBe(2);
    expect(opts.action).toBe('patient:view');
    expect(opts.patientId).toBe(42);
    expect(opts.requestId).toBe('from-header');
    expect(opts.route).toBe('/api/patients/42');
  });
});

