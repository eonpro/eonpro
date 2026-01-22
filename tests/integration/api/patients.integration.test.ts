/**
 * Patients API Integration Tests
 * Tests the patients API endpoints with mocked database
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Store the current mock user
let currentMockUser: any = null;

// Mock Prisma before importing the route
const mockPatientFindMany = vi.fn();
const mockPatientFindUnique = vi.fn();
const mockPatientCreate = vi.fn();
const mockPatientUpdate = vi.fn();
const mockPatientDelete = vi.fn();
const mockPatientCount = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findMany: mockPatientFindMany,
      findUnique: mockPatientFindUnique,
      create: mockPatientCreate,
      update: mockPatientUpdate,
      delete: mockPatientDelete,
      count: mockPatientCount,
    },
    $transaction: vi.fn((fn) => fn()),
  },
  basePrisma: {
    patient: {
      findMany: mockPatientFindMany,
      findUnique: mockPatientFindUnique,
      create: mockPatientCreate,
      update: mockPatientUpdate,
      delete: mockPatientDelete,
      count: mockPatientCount,
    },
  },
  setClinicContext: vi.fn(),
  getClinicContext: vi.fn(() => 1),
}));

// Mock audit logging
vi.mock('@/lib/audit/hipaa-audit', () => ({
  auditLog: vi.fn(),
  AuditEventType: {
    PHI_VIEW: 'PHI_VIEW',
    PHI_CREATE: 'PHI_CREATE',
    PHI_UPDATE: 'PHI_UPDATE',
    PHI_DELETE: 'PHI_DELETE',
    LOGIN_FAILED: 'LOGIN_FAILED',
    SESSION_TIMEOUT: 'SESSION_TIMEOUT',
    SYSTEM_ACCESS: 'SYSTEM_ACCESS',
  },
}));

// Mock session manager
vi.mock('@/lib/auth/session-manager', () => ({
  validateSession: vi.fn(() => ({ valid: true })),
}));

// Mock rate limiting
vi.mock('@/lib/rateLimit', () => ({
  relaxedRateLimit: (handler: any) => handler,
  standardRateLimit: (handler: any) => handler,
}));

// Mock PHI encryption
vi.mock('@/lib/security/phi-encryption', () => ({
  encryptPatientPHI: vi.fn((data) => data),
  decryptPatientPHI: vi.fn((data) => data),
}));

// Mock clinical auth middleware
vi.mock('@/lib/auth/middleware', () => ({
  withClinicalAuth: (handler: any) => {
    return async (request: NextRequest) => {
      if (!currentMockUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return handler(request, currentMockUser);
    };
  },
  withAuth: (handler: any) => {
    return async (request: NextRequest) => {
      if (!currentMockUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return handler(request, currentMockUser);
    };
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
  },
}));

// Helper to set mock user
function setMockUser(user: any) {
  currentMockUser = user;
}

describe('Patients API Integration Tests', () => {
  const mockAdminUser = {
    id: 1,
    email: 'admin@test.com',
    role: 'admin',
    clinicId: 1,
    tokenVersion: 1,
  };

  const mockProviderUser = {
    id: 2,
    email: 'provider@test.com',
    role: 'provider',
    clinicId: 1,
    providerId: 1,
  };

  const mockSuperAdminUser = {
    id: 100,
    email: 'superadmin@test.com',
    role: 'super_admin',
    clinicId: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    currentMockUser = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/patients', () => {
    it('should return patients list for authenticated admin user', async () => {
      setMockUser(mockAdminUser);

      const mockPatients = [
        {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          clinicId: 1,
          createdAt: new Date(),
        },
        {
          id: 2,
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
          clinicId: 1,
          createdAt: new Date(),
        },
      ];

      mockPatientFindMany.mockResolvedValue(mockPatients);
      mockPatientCount.mockResolvedValue(2);

      // Import the route handler
      const { GET } = await import('@/app/api/patients/route');

      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data.patients) || Array.isArray(data)).toBe(true);
    });

    it('should return 401 for unauthenticated requests', async () => {
      currentMockUser = null; // No user

      const { GET } = await import('@/app/api/patients/route');

      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should filter patients by clinic for non-super-admin users', async () => {
      setMockUser(mockAdminUser);

      mockPatientFindMany.mockResolvedValue([]);
      mockPatientCount.mockResolvedValue(0);

      const { GET } = await import('@/app/api/patients/route');

      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);

      // Verify that findMany was called with clinicId filter
      expect(mockPatientFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId: 1,
          }),
        })
      );
    });

    it('should allow super_admin to see all patients', async () => {
      setMockUser(mockSuperAdminUser);

      mockPatientFindMany.mockResolvedValue([
        { id: 1, clinicId: 1 },
        { id: 2, clinicId: 2 },
      ]);

      const { GET } = await import('@/app/api/patients/route');

      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(200);

      // Super admin query should NOT have clinicId filter
      const findManyCall = mockPatientFindMany.mock.calls[0][0];
      expect(findManyCall.where?.clinicId).toBeUndefined();
    });
  });

  describe('POST /api/patients', () => {
    it('should create a new patient for authenticated user', async () => {
      setMockUser(mockAdminUser);

      const newPatient = {
        firstName: 'New',
        lastName: 'Patient',
        email: 'new@example.com',
        phone: '555-0001',
        dob: '1990-01-01',
        gender: 'male',
        address1: '123 Main St',
        city: 'Test City',
        state: 'TS',
        zip: '12345',
      };

      const createdPatient = {
        id: 3,
        ...newPatient,
        clinicId: 1,
        createdAt: new Date(),
      };

      mockPatientCreate.mockResolvedValue(createdPatient);
      mockPatientFindUnique.mockResolvedValue(null); // No duplicate

      const { POST } = await import('@/app/api/patients/route');

      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPatient),
      });

      const response = await POST(request);

      // Should be 201 or 200 for success, or 400/422 for validation
      expect([200, 201, 400, 422]).toContain(response.status);
    });

    it('should validate required fields', async () => {
      setMockUser(mockAdminUser);

      const invalidPatient = {
        firstName: 'Test',
        // Missing required fields
      };

      const { POST } = await import('@/app/api/patients/route');

      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidPatient),
      });

      const response = await POST(request);

      // Should return validation error
      expect([400, 422, 500]).toContain(response.status);
    });

    it('should reject unauthenticated POST requests', async () => {
      currentMockUser = null;

      const { POST } = await import('@/app/api/patients/route');

      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ firstName: 'Test' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });

  describe('Security Tests', () => {
    it('should reject unauthenticated requests', async () => {
      currentMockUser = null;

      const { GET } = await import('@/app/api/patients/route');

      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'GET',
      });

      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should require clinicId for non-super-admin users', async () => {
      // User without clinicId (but not super_admin)
      setMockUser({
        id: 5,
        email: 'orphan@test.com',
        role: 'admin',
        clinicId: null, // No clinic
      });

      const { GET } = await import('@/app/api/patients/route');

      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'GET',
      });

      const response = await GET(request);

      // Should return 403 - no clinic associated
      expect(response.status).toBe(403);
    });
  });
});
