/**
 * Bloodwork / Labs API integration tests
 * Covers list, single report, and upload (with mocked service/storage).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockLabReportFindMany = vi.fn();
const mockLabReportFindFirst = vi.fn();
const mockPatientFindUnique = vi.fn();
const mockPatientDocumentFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    patient: { findUnique: mockPatientFindUnique },
    labReport: {
      findMany: mockLabReportFindMany,
      findFirst: mockLabReportFindFirst,
    },
    patientDocument: { findFirst: mockPatientDocumentFindFirst },
  },
  basePrisma: {},
  setClinicContext: vi.fn(),
  getClinicContext: vi.fn(() => 1),
}));

vi.mock('@/lib/audit/hipaa-audit', () => ({
  logPHIAccess: vi.fn(),
  logPHICreate: vi.fn().mockResolvedValue(undefined),
  auditLog: vi.fn(),
  AuditEventType: {},
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: (config: unknown) => (handler: (req: NextRequest) => Promise<Response>) => handler,
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

vi.mock('@/lib/auth/middleware-with-params', () => ({
  withAuthParams: (
    handler: (req: NextRequest, user: unknown, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  ) =>
    async (req: NextRequest, context?: { params?: Promise<{ id: string; reportId?: string }> }) => {
      if (!mockUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const params = context?.params ?? Promise.resolve({ id: '' });
      return handler(req, mockUser, { params: params as Promise<{ id: string }> });
    },
}));

vi.mock('@/lib/bloodwork/service', () => ({
  createBloodworkReportFromPdf: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), security: vi.fn(), api: vi.fn() },
}));

describe('Bloodwork API integration', () => {
  const adminUser = { id: 1, role: 'admin', clinicId: 1 };
  const patientUser = { id: 2, role: 'patient', patientId: 10, clinicId: 1 };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  describe('GET /api/patients/[id]/bloodwork (clinic list)', () => {
    it('returns 401 when not authenticated', async () => {
      mockUser = null;
      const { GET } = await import('@/app/api/patients/[id]/bloodwork/route');
      const req = new NextRequest('http://localhost/api/patients/1/bloodwork', { method: 'GET' });
      const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid patient id', async () => {
      mockUser = adminUser;
      const { GET } = await import('@/app/api/patients/[id]/bloodwork/route');
      const req = new NextRequest('http://localhost/api/patients/foo/bloodwork', { method: 'GET' });
      const res = await GET(req, { params: Promise.resolve({ id: 'foo' }) });
      expect(res.status).toBe(400);
    });

    it('returns 404 when patient not found', async () => {
      mockUser = adminUser;
      mockPatientFindUnique.mockResolvedValue(null);
      const { GET } = await import('@/app/api/patients/[id]/bloodwork/route');
      const req = new NextRequest('http://localhost/api/patients/999/bloodwork', { method: 'GET' });
      const res = await GET(req, { params: Promise.resolve({ id: '999' }) });
      expect(res.status).toBe(404);
    });

    it('returns 200 and reports array when patient has no reports', async () => {
      mockUser = adminUser;
      mockPatientFindUnique.mockResolvedValue({ id: 1, clinicId: 1 });
      mockLabReportFindMany.mockResolvedValue([]);
      const { GET } = await import('@/app/api/patients/[id]/bloodwork/route');
      const req = new NextRequest('http://localhost/api/patients/1/bloodwork', { method: 'GET' });
      const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reports).toEqual([]);
    });

    it('returns 200 and reports when patient has lab reports', async () => {
      mockUser = adminUser;
      mockPatientFindUnique.mockResolvedValue({ id: 1, clinicId: 1 });
      mockLabReportFindMany.mockResolvedValue([
        {
          id: 1,
          documentId: 10,
          labName: 'Quest Diagnostics',
          specimenId: null,
          collectedAt: new Date('2024-01-15'),
          reportedAt: new Date('2024-01-16'),
          fasting: true,
          createdAt: new Date('2024-01-16'),
          _count: { results: 12 },
        },
      ]);
      const { GET } = await import('@/app/api/patients/[id]/bloodwork/route');
      const req = new NextRequest('http://localhost/api/patients/1/bloodwork', { method: 'GET' });
      const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reports).toHaveLength(1);
      expect(data.reports[0].id).toBe(1);
      expect(data.reports[0].labName).toBe('Quest Diagnostics');
      expect(data.reports[0].resultCount).toBe(12);
    });
  });

  describe('GET /api/patients/[id]/bloodwork/[reportId] (clinic single)', () => {
    it('returns 404 when report not found', async () => {
      mockUser = adminUser;
      mockPatientFindUnique.mockResolvedValue({ id: 1, clinicId: 1 });
      mockLabReportFindFirst.mockResolvedValue(null);
      const { GET } = await import('@/app/api/patients/[id]/bloodwork/[reportId]/route');
      const req = new NextRequest('http://localhost/api/patients/1/bloodwork/99', { method: 'GET' });
      const res = await GET(req, { params: Promise.resolve({ id: '1', reportId: '99' }) });
      expect(res.status).toBe(404);
    });

    it('returns 200 and report detail when found', async () => {
      mockUser = adminUser;
      mockPatientFindUnique.mockResolvedValue({ id: 1, clinicId: 1 });
      mockLabReportFindFirst.mockResolvedValue({
        id: 1,
        documentId: 10,
        labName: 'Quest Diagnostics',
        specimenId: null,
        collectedAt: new Date('2024-01-15'),
        reportedAt: new Date('2024-01-16'),
        fasting: true,
        createdAt: new Date('2024-01-16'),
        results: [
          {
            id: 1,
            testName: 'Glucose',
            value: '95',
            valueNumeric: 95,
            unit: 'mg/dL',
            referenceRange: '70-99',
            flag: null,
            category: 'metabolic',
          },
        ],
      });
      const { GET } = await import('@/app/api/patients/[id]/bloodwork/[reportId]/route');
      const req = new NextRequest('http://localhost/api/patients/1/bloodwork/1', { method: 'GET' });
      const res = await GET(req, { params: Promise.resolve({ id: '1', reportId: '1' }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(1);
      expect(data.results).toHaveLength(1);
      expect(data.results[0].testName).toBe('Glucose');
      expect(data.summary).toBeDefined();
      expect(data.summary.total).toBe(1);
    });
  });

  describe('POST /api/patients/[id]/bloodwork/upload (clinic upload)', () => {
    it('returns 400 when no file provided', async () => {
      mockUser = adminUser;
      mockPatientFindUnique.mockResolvedValue({ id: 1, clinicId: 1 });
      const formData = new FormData();
      const { POST } = await import('@/app/api/patients/[id]/bloodwork/upload/route');
      const req = new NextRequest('http://localhost/api/patients/1/bloodwork/upload', {
        method: 'POST',
        body: formData,
      });
      const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('PDF');
    });

    it('returns 201 and labReportId when service succeeds', async () => {
      const { createBloodworkReportFromPdf } = await import('@/lib/bloodwork/service');
      vi.mocked(createBloodworkReportFromPdf).mockResolvedValue({
        labReportId: 1,
        documentId: 10,
        resultCount: 12,
      });
      mockUser = adminUser;
      mockPatientFindUnique.mockResolvedValue({ id: 1, clinicId: 1 });
      const formData = new FormData();
      formData.append('file', new Blob(['fake pdf content'], { type: 'application/pdf' }), 'report.pdf');
      const { POST } = await import('@/app/api/patients/[id]/bloodwork/upload/route');
      const req = new NextRequest('http://localhost/api/patients/1/bloodwork/upload', {
        method: 'POST',
        body: formData,
      });
      const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.labReportId).toBe(1);
      expect(data.documentId).toBe(10);
      expect(data.resultCount).toBe(12);
    });
  });

  describe('GET /api/patient-portal/bloodwork (portal list)', () => {
    it('returns 401 when not authenticated', async () => {
      mockUser = null;
      const { GET } = await import('@/app/api/patient-portal/bloodwork/route');
      const req = new NextRequest('http://localhost/api/patient-portal/bloodwork', { method: 'GET' });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('returns 404 when user has no patientId', async () => {
      mockUser = { id: 1, role: 'patient', clinicId: 1 };
      const { GET } = await import('@/app/api/patient-portal/bloodwork/route');
      const req = new NextRequest('http://localhost/api/patient-portal/bloodwork', { method: 'GET' });
      const res = await GET(req);
      expect(res.status).toBe(404);
    });

    it('returns 200 and reports array for patient', async () => {
      mockUser = patientUser;
      mockLabReportFindMany.mockResolvedValue([]);
      const { GET } = await import('@/app/api/patient-portal/bloodwork/route');
      const req = new NextRequest('http://localhost/api/patient-portal/bloodwork', { method: 'GET' });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reports).toEqual([]);
    });
  });

  describe('POST /api/patient-portal/bloodwork/upload (portal upload)', () => {
    it('returns 400 when patient has no clinic (clinicId null)', async () => {
      mockUser = patientUser;
      mockPatientFindUnique.mockResolvedValue({ id: 10, clinicId: null });
      const formData = new FormData();
      formData.append('file', new Blob(['x'], { type: 'application/pdf' }), 'report.pdf');
      const { POST } = await import('@/app/api/patient-portal/bloodwork/upload/route');
      const req = new NextRequest('http://localhost/api/patient-portal/bloodwork/upload', {
        method: 'POST',
        body: formData,
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('clinic');
    });

    it('returns 400 when formData() throws (e.g. body too large or malformed)', async () => {
      mockUser = patientUser;
      const req = {
        formData: () => Promise.reject(new Error('Body parse error')),
      } as unknown as NextRequest;
      const { POST } = await import('@/app/api/patient-portal/bloodwork/upload/route');
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });
});
