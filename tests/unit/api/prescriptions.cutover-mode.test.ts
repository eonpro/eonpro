import { beforeEach, describe, expect, it, vi } from 'vitest';

const createPrescriptionMock = vi.hoisted(() => vi.fn());
const safeParseMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/middleware', () => ({
  withClinicalAuth: vi.fn((handler: unknown) => handler),
}));

vi.mock('@/domains/prescription', () => {
  class PrescriptionError extends Error {
    statusCode: number;
    code?: string;

    constructor(message: string, statusCode = 500, code?: string) {
      super(message);
      this.name = 'PrescriptionError';
      this.statusCode = statusCode;
      this.code = code;
    }
  }

  return {
    prescriptionService: {
      createPrescription: createPrescriptionMock,
    },
    PrescriptionError,
  };
});

vi.mock('@/lib/validate', () => ({
  prescriptionSchema: {
    safeParse: safeParseMock,
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('@/lib/lifefile', () => ({
  default: { createFullOrder: vi.fn() },
  getEnvCredentials: vi.fn(() => null),
}));

vi.mock('@/lib/clinic-lifefile', () => ({
  getClinicLifefileClient: vi.fn(),
  getClinicLifefileCredentials: vi.fn(),
}));

vi.mock('@/lib/pdf', () => ({
  generatePrescriptionPDF: vi.fn(),
}));

vi.mock('@/lib/medications', () => ({
  MEDS: {},
  GLP1_PRODUCT_IDS: new Set(),
  SYRINGE_KIT_PRODUCT_ID: 0,
  ELITE_ADDON_PRODUCT_IDS: new Set(),
  ELITE_SYRINGE_KIT_QUANTITY: 0,
}));

vi.mock('@/lib/shipping', () => ({
  SHIPPING_METHODS: [],
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
  basePrisma: {},
  withRetry: vi.fn(),
}));

vi.mock('@/lib/audit/hipaa-audit', () => ({
  auditLog: vi.fn(),
  AuditEventType: {},
}));

vi.mock('@/services/refill', () => ({
  markPrescribed: vi.fn(),
}));

vi.mock('@/services/provider', () => ({
  providerCompensationService: {
    recordPrescription: vi.fn(),
  },
}));

vi.mock('@/services/billing', () => ({
  platformFeeService: {
    recordPrescriptionFee: vi.fn(),
  },
}));

vi.mock('@/lib/utils/search', () => ({
  buildPatientSearchIndex: vi.fn(() => ''),
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  computeEmailHash: vi.fn(() => 'email-hash'),
  computeDobHash: vi.fn(() => 'dob-hash'),
}));

import { POST } from '@/app/api/prescriptions/route';
import { PrescriptionError } from '@/domains/prescription';

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/prescriptions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/prescriptions cutover mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PRESCRIPTIONS_CUTOVER_MODE;
    delete process.env.PRESCRIPTIONS_CUTOVER_CLINIC_IDS;
  });

  it('defaults to legacy mode when env flag is unset', async () => {
    const req = makeRequest({ any: 'payload' });
    const res = await POST(req as never, {
      id: 1,
      email: 'user@example.com',
      role: 'patient',
      clinicId: 1,
    } as never);

    expect(res.status).toBe(403);
    expect(createPrescriptionMock).not.toHaveBeenCalled();
  });

  it('routes to service mode when PRESCRIPTIONS_CUTOVER_MODE=service', async () => {
    process.env.PRESCRIPTIONS_CUTOVER_MODE = 'service';
    safeParseMock.mockReturnValue({
      success: true,
      data: {
        providerId: 10,
        patient: {
          firstName: 'Pat',
          lastName: 'One',
          dob: '1990-01-01',
          gender: 'm',
          phone: '5551112222',
          email: 'pat@example.com',
          address1: '123 Main',
          city: 'Tampa',
          state: 'FL',
          zip: '33602',
        },
        rxs: [{ medicationKey: 'x', quantity: 1, refills: 0, sig: 'sig' }],
        shippingMethod: 'standard',
      },
    });
    createPrescriptionMock.mockResolvedValue({
      success: true,
      order: { id: 123 },
    });

    const req = makeRequest({ providerId: 10 });
    const res = await POST(req as never, {
      id: 7,
      email: 'provider@example.com',
      role: 'provider',
      clinicId: 3,
      providerId: 10,
    } as never);
    const json = (await res.json()) as { success: boolean; order: { id: number } };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(createPrescriptionMock).toHaveBeenCalledTimes(1);
    expect(createPrescriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 10 }),
      expect.objectContaining({ id: 7, role: 'provider', clinicId: 3, providerId: 10 })
    );
  });

  it('maps PrescriptionError from service mode to status/code response', async () => {
    process.env.PRESCRIPTIONS_CUTOVER_MODE = 'service';
    safeParseMock.mockReturnValue({
      success: true,
      data: {
        providerId: 10,
        patient: {},
        rxs: [],
        shippingMethod: 'standard',
      },
    });
    createPrescriptionMock.mockRejectedValue(
      new PrescriptionError('Business rule failed', 422, 'RULE_VIOLATION')
    );

    const req = makeRequest({ providerId: 10 });
    const res = await POST(req as never, {
      id: 7,
      email: 'provider@example.com',
      role: 'provider',
      clinicId: 3,
      providerId: 10,
    } as never);
    const json = (await res.json()) as { error: string; code: string };

    expect(res.status).toBe(422);
    expect(json.error).toBe('Business rule failed');
    expect(json.code).toBe('RULE_VIOLATION');
  });

  it('forces queueForProvider for sales_rep in service mode', async () => {
    process.env.PRESCRIPTIONS_CUTOVER_MODE = 'service';
    safeParseMock.mockImplementation((data: Record<string, unknown>) => ({
      success: true,
      data,
    }));
    createPrescriptionMock.mockResolvedValue({
      success: true,
      order: { id: 999 },
      queuedForProvider: true,
    });

    const req = makeRequest({ providerId: 10, queueForProvider: false });
    const res = await POST(req as never, {
      id: 88,
      email: 'sales@example.com',
      role: 'sales_rep',
      clinicId: 5,
    } as never);

    expect(res.status).toBe(200);
    expect(createPrescriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ queueForProvider: true }),
      expect.objectContaining({ role: 'sales_rep' })
    );
  });

  it('keeps unauthorized contract parity in legacy and service modes', async () => {
    const reqLegacy = makeRequest({ any: 'payload' });
    const legacyRes = await POST(reqLegacy as never, {
      id: 11,
      email: 'patient@example.com',
      role: 'patient',
      clinicId: 1,
    } as never);
    const legacyJson = (await legacyRes.json()) as { error: string };

    process.env.PRESCRIPTIONS_CUTOVER_MODE = 'service';
    const reqService = makeRequest({ any: 'payload' });
    const serviceRes = await POST(reqService as never, {
      id: 11,
      email: 'patient@example.com',
      role: 'patient',
      clinicId: 1,
    } as never);
    const serviceJson = (await serviceRes.json()) as { error: string };

    expect(legacyRes.status).toBe(403);
    expect(serviceRes.status).toBe(403);
    expect(legacyJson.error).toBe('Not authorized to create prescriptions');
    expect(serviceJson.error).toBe('Not authorized to create prescriptions');
    expect(createPrescriptionMock).not.toHaveBeenCalled();
  });

  it('maps pool exhaustion to 503 in service mode', async () => {
    process.env.PRESCRIPTIONS_CUTOVER_MODE = 'service';
    safeParseMock.mockReturnValue({
      success: true,
      data: {
        providerId: 10,
        patient: {},
        rxs: [],
        shippingMethod: 'standard',
      },
    });
    createPrescriptionMock.mockRejectedValue(
      Object.assign(new Error('connection pool timeout exceeded'), { code: 'P2024' })
    );

    const req = makeRequest({ providerId: 10 });
    const res = await POST(req as never, {
      id: 7,
      email: 'provider@example.com',
      role: 'provider',
      clinicId: 3,
      providerId: 10,
    } as never);
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(503);
    expect(json.error).toContain('Service temporarily busy');
    expect(res.headers.get('Retry-After')).toBe('15');
  });

  it('respects clinic allowlist and keeps non-canary clinic on legacy path', async () => {
    process.env.PRESCRIPTIONS_CUTOVER_MODE = 'service';
    process.env.PRESCRIPTIONS_CUTOVER_CLINIC_IDS = '99';
    safeParseMock.mockReturnValue({
      success: true,
      data: {
        providerId: 10,
        patient: {},
        rxs: [],
        shippingMethod: 'standard',
      },
    });
    createPrescriptionMock.mockResolvedValue({
      success: true,
      order: { id: 1 },
    });

    const req = makeRequest({ providerId: 10 });
    const res = await POST(req as never, {
      id: 7,
      email: 'provider@example.com',
      role: 'provider',
      clinicId: 3,
      providerId: 10,
    } as never);

    expect(createPrescriptionMock).not.toHaveBeenCalled();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('uses service mode for allowlisted clinic', async () => {
    process.env.PRESCRIPTIONS_CUTOVER_MODE = 'service';
    process.env.PRESCRIPTIONS_CUTOVER_CLINIC_IDS = '3';
    safeParseMock.mockReturnValue({
      success: true,
      data: {
        providerId: 10,
        patient: {},
        rxs: [],
        shippingMethod: 'standard',
      },
    });
    createPrescriptionMock.mockResolvedValue({
      success: true,
      order: { id: 777 },
    });

    const req = makeRequest({ providerId: 10 });
    const res = await POST(req as never, {
      id: 7,
      email: 'provider@example.com',
      role: 'provider',
      clinicId: 3,
      providerId: 10,
    } as never);

    expect(res.status).toBe(200);
    expect(createPrescriptionMock).toHaveBeenCalledTimes(1);
  });
});

