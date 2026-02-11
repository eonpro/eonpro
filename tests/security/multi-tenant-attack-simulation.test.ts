/**
 * Multi-Tenant Attack Simulation
 * ===============================
 *
 * Simulates real-world cross-tenant access attempts:
 * - Attacker has valid auth for Clinic 1
 * - Attacker requests resources belonging to Clinic 2 (by ID enumeration)
 * - Verifies: 404 response, no PHI leaked, anti-enumeration (same body for nonexistent vs wrong-clinic)
 *
 * @security CRITICAL - Validates tenant isolation under attack conditions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const CLINIC_ATTACKER = 1;
const CLINIC_VICTIM = 2;
const VICTIM_PATIENT_ID = 999;
const VICTIM_INVOICE_ID = 555;

const mockPatientFindFirst = vi.fn();
const mockPatientFindUnique = vi.fn();
const mockInvoiceFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findFirst: mockPatientFindFirst,
      findUnique: mockPatientFindUnique,
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    invoice: {
      findUnique: mockInvoiceFindUnique,
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
  },
  basePrisma: {},
  runWithClinicContext: (_clinicId: number, fn: () => unknown) => fn(),
  setClinicContext: vi.fn(),
  getClinicContext: vi.fn(() => CLINIC_ATTACKER),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), api: vi.fn(), requestSummary: vi.fn() },
}));

vi.mock('@/lib/audit/hipaa-audit', () => ({
  auditPhiAccess: vi.fn().mockResolvedValue(undefined),
  buildAuditPhiOptions: vi.fn(() => ({})),
  AuditEventType: {},
}));

vi.mock('@/lib/rateLimit', () => ({
  relaxedRateLimit: (h: unknown) => h,
  standardRateLimit: (h: unknown) => h,
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  encryptPatientPHI: vi.fn((d: Record<string, unknown>) => d),
  decryptPatientPHI: vi.fn((d: Record<string, unknown>) => d),
}));

let mockUser: { id: number; role: string; clinicId: number; email: string } | null = null;

vi.mock('@/lib/auth', () => ({
  getAuthUser: vi.fn().mockImplementation(() => Promise.resolve(mockUser)),
  requireAuth: vi.fn().mockImplementation(() => Promise.resolve(mockUser)),
}));

vi.mock('@/lib/auth/middleware-with-params', () => ({
  withAuthParams: (
    handler: (req: NextRequest, user: unknown, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
    _opts?: { roles?: string[] }
  ) =>
    async (req: NextRequest, ctx?: { params?: Promise<{ id: string }> }) => {
      if (!mockUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const params = ctx?.params ?? Promise.resolve({ id: '' });
      return handler(req, mockUser, { params });
    },
}));

describe('Multi-tenant attack simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
  });

  describe('Scenario: Attacker (Clinic 1) tries to access Clinic 2 patient by ID', () => {
    it('GET /api/patients/[id] returns 404 with generic body (no PHI, no enumeration)', async () => {
      mockUser = {
        id: 1,
        email: 'attacker@clinic1.com',
        role: 'admin',
        clinicId: CLINIC_ATTACKER,
      };

      mockPatientFindFirst.mockResolvedValue(null);

      const { GET } = await import('@/app/api/patients/[id]/route');
      const req = new NextRequest(`http://localhost/api/patients/${VICTIM_PATIENT_ID}`);
      const res = await GET(req, { params: Promise.resolve({ id: String(VICTIM_PATIENT_ID) }) });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: 'Not found' });
      expect(body).not.toHaveProperty('patient');
      expect(body).not.toHaveProperty('firstName');
      expect(body).not.toHaveProperty('email');

      expect(mockPatientFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: VICTIM_PATIENT_ID,
            clinicId: CLINIC_ATTACKER,
          }),
        })
      );
    });

    it('PATCH /api/patients/[id] returns 404 when attacking cross-tenant patient', async () => {
      mockUser = {
        id: 1,
        email: 'attacker@clinic1.com',
        role: 'admin',
        clinicId: CLINIC_ATTACKER,
      };

      mockPatientFindFirst.mockResolvedValue(null);

      const { PATCH } = await import('@/app/api/patients/[id]/route');
      const req = new NextRequest(`http://localhost/api/patients/${VICTIM_PATIENT_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: 'Hacked' }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: String(VICTIM_PATIENT_ID) }) });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: 'Not found' });
    });

    it('same 404 body for nonexistent ID vs cross-tenant ID (anti-enumeration)', async () => {
      mockUser = {
        id: 1,
        email: 'attacker@clinic1.com',
        role: 'admin',
        clinicId: CLINIC_ATTACKER,
      };

      mockPatientFindFirst.mockResolvedValue(null);

      const { GET } = await import('@/app/api/patients/[id]/route');

      const reqNonexistent = new NextRequest('http://localhost/api/patients/88888');
      const reqCrossTenant = new NextRequest(`http://localhost/api/patients/${VICTIM_PATIENT_ID}`);

      const res1 = await GET(reqNonexistent, { params: Promise.resolve({ id: '88888' }) });
      const res2 = await GET(reqCrossTenant, { params: Promise.resolve({ id: String(VICTIM_PATIENT_ID) }) });

      expect(res1.status).toBe(404);
      expect(res2.status).toBe(404);

      const body1 = await res1.json();
      const body2 = await res2.json();
      expect(body1).toEqual(body2);
      expect(body1).toEqual({ error: 'Not found' });
    });
  });

  describe('Scenario: Attacker (Clinic 1) tries to access Clinic 2 invoice by ID', () => {
    it('GET /api/stripe/invoices/[id] returns 404 when ensureTenantResource detects wrong clinic', async () => {
      mockUser = {
        id: 1,
        email: 'attacker@clinic1.com',
        role: 'admin',
        clinicId: CLINIC_ATTACKER,
      };

      mockInvoiceFindUnique.mockResolvedValue({
        id: VICTIM_INVOICE_ID,
        clinicId: CLINIC_VICTIM,
        patientId: 1,
        status: 'draft',
      });

      const { GET } = await import('@/app/api/stripe/invoices/[id]/route');
      const req = new NextRequest(`http://localhost/api/stripe/invoices/${VICTIM_INVOICE_ID}`);
      const res = await GET(req, { params: Promise.resolve({ id: String(VICTIM_INVOICE_ID) }) });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({ error: 'Not found' });
      expect(body).not.toHaveProperty('invoice');
      expect(body).not.toHaveProperty('patient');
    });
  });

  describe('Scenario: Defense-in-depth - ensureTenantResource catches wrong-clinic data', () => {
    it('ensureTenantResource catches wrong-clinic resource and returns 404', async () => {
      const { ensureTenantResource } = await import('@/lib/tenant-response');

      const wrongClinicResource = { id: VICTIM_PATIENT_ID, clinicId: CLINIC_VICTIM };
      const res = ensureTenantResource(wrongClinicResource, CLINIC_ATTACKER);

      expect(res).not.toBeNull();
      expect(res!.status).toBe(404);
      const body = await res!.json();
      expect(body).toEqual({ error: 'Not found' });
    });
  });
});
