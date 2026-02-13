/**
 * Patient Portal Documents API - clinic isolation (P1)
 *
 * GET /api/patient-portal/documents with staff + patientId from another clinic returns 403.
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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/audit/hipaa-audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
  AuditEventType: {},
}));

let mockUser: { id: number; role: string; clinicId?: number | null; patientId?: number } | null =
  null;

vi.mock('@/lib/auth/middleware', () => ({
  withAuth: (handler: (req: NextRequest, user: unknown) => Promise<Response>) =>
    async (req: NextRequest) => {
      if (!mockUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return handler(req, mockUser);
    },
}));

describe('GET /api/patient-portal/documents (clinic isolation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  it('returns 403 when staff requests documents for patient in another clinic', async () => {
    mockUser = { id: 1, role: 'staff', clinicId: 1 };
    const patientIdOtherClinic = 123;
    mockPatientFindUnique.mockResolvedValue({
      id: patientIdOtherClinic,
      clinicId: 2,
    });

    const { GET } = await import('@/app/api/patient-portal/documents/route');
    const req = new NextRequest(
      `http://localhost/api/patient-portal/documents?patientId=${patientIdOtherClinic}`,
      { method: 'GET' }
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/access denied|denied/i);
    expect(mockPatientFindUnique).toHaveBeenCalledWith({
      where: { id: patientIdOtherClinic },
      select: { id: true, clinicId: true },
    });
    expect(mockDocumentFindMany).not.toHaveBeenCalled();
  });

  it('returns 200 when staff requests documents for patient in same clinic', async () => {
    mockUser = { id: 1, role: 'staff', clinicId: 1 };
    const patientIdSameClinic = 456;
    mockPatientFindUnique.mockResolvedValue({
      id: patientIdSameClinic,
      clinicId: 1,
    });
    mockDocumentFindMany.mockResolvedValue([]);

    const { GET } = await import('@/app/api/patient-portal/documents/route');
    const req = new NextRequest(
      `http://localhost/api/patient-portal/documents?patientId=${patientIdSameClinic}`,
      { method: 'GET' }
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents).toEqual([]);
    expect(mockDocumentFindMany).toHaveBeenCalled();
  });
});
