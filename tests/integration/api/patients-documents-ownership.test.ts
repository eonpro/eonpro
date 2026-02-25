/**
 * GET /api/patients/[id]/documents - patient ownership
 *
 * Patient can only access their own documents; other patientId returns 404 (tenant normalization).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPatientFindUnique = vi.fn();
const mockDocumentFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    patient: { findUnique: mockPatientFindUnique },
    patientDocument: { findMany: mockDocumentFindMany },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), api: vi.fn() },
}));

vi.mock('@/lib/audit/hipaa-audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
  AuditEventType: {},
}));

let mockUser: { id: number; role: string; clinicId?: number | null; patientId?: number } | null =
  null;

vi.mock('@/lib/auth/middleware-with-params', () => ({
  withAuthParams: (
    handler: (req: NextRequest, user: unknown, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
    _options?: { roles?: string[] }
  ) =>
    async (req: NextRequest, context?: { params?: Promise<{ id: string }> }) => {
      if (!mockUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const params = context?.params ?? Promise.resolve({ id: '' });
      return handler(req, mockUser, { params });
    },
}));

describe('GET /api/patients/[id]/documents (patient ownership)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  it('returns 200 when patient requests own documents', async () => {
    const patientId = 42;
    mockUser = { id: 10, role: 'patient', patientId, clinicId: 1 };
    mockPatientFindUnique.mockResolvedValue({ id: patientId, clinicId: 1 });
    mockDocumentFindMany.mockResolvedValue([
      { id: 1, filename: 'a.pdf', category: 'OTHER', mimeType: 'application/pdf', createdAt: new Date() },
    ]);

    const { GET } = await import('@/app/api/patients/[id]/documents/route');
    const req = new NextRequest(`http://localhost/api/patients/${patientId}/documents`, {
      method: 'GET',
    });
    const res = await GET(req, { params: Promise.resolve({ id: String(patientId) }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(mockPatientFindUnique).toHaveBeenCalledWith({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });
    expect(mockDocumentFindMany).toHaveBeenCalled();
  });

  it('returns 404 when patient requests another patient documents (tenant normalization)', async () => {
    mockUser = { id: 10, role: 'patient', patientId: 1, clinicId: 1 };
    const otherPatientId = 999;
    mockPatientFindUnique.mockResolvedValue({ id: otherPatientId, clinicId: 1 });

    const { GET } = await import('@/app/api/patients/[id]/documents/route');
    const req = new NextRequest(`http://localhost/api/patients/${otherPatientId}/documents`, {
      method: 'GET',
    });
    const res = await GET(req, { params: Promise.resolve({ id: String(otherPatientId) }) });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
    expect(mockDocumentFindMany).not.toHaveBeenCalled();
  });
});
