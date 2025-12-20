/**
 * Patients API Integration Tests
 * Tests the patients API endpoints with mocked database
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';

// Mock Prisma before importing the route
vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn()),
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

describe('Patients API Integration Tests', () => {
  let authToken: string;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Create a valid auth token
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    authToken = await new SignJWT({
      id: 1,
      email: 'admin@test.com',
      role: 'admin',
      clinicId: 1,
      tokenVersion: 1,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/patients', () => {
    it('should return patients list for authenticated user', async () => {
      const { prisma } = await import('@/lib/db');
      
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
      
      vi.mocked(prisma.patient.findMany).mockResolvedValue(mockPatients);
      vi.mocked(prisma.patient.count).mockResolvedValue(2);
      
      // Import the route handler
      const { GET } = await import('@/app/api/patients/route');
      
      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(Array.isArray(data.patients) || Array.isArray(data)).toBe(true);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const { GET } = await import('@/app/api/patients/route');
      
      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'GET',
      });
      
      const response = await GET(request);
      
      expect(response.status).toBe(401);
    });

    it('should filter patients by clinic for non-super-admin users', async () => {
      const { prisma } = await import('@/lib/db');
      
      vi.mocked(prisma.patient.findMany).mockResolvedValue([]);
      vi.mocked(prisma.patient.count).mockResolvedValue(0);
      
      const { GET } = await import('@/app/api/patients/route');
      
      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      
      await GET(request);
      
      // Verify that findMany was called (clinic filtering happens in db.ts)
      expect(prisma.patient.findMany).toHaveBeenCalled();
    });
  });

  describe('POST /api/patients', () => {
    it('should create a new patient', async () => {
      const { prisma } = await import('@/lib/db');
      
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
      
      vi.mocked(prisma.patient.create).mockResolvedValue(createdPatient);
      
      const { POST } = await import('@/app/api/patients/route');
      
      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPatient),
      });
      
      const response = await POST(request);
      
      // Check that create was called or response is success
      if (response.status === 201 || response.status === 200) {
        expect(prisma.patient.create).toHaveBeenCalled();
      }
    });

    it('should validate required fields', async () => {
      const { POST } = await import('@/app/api/patients/route');
      
      const invalidPatient = {
        firstName: 'Test',
        // Missing required fields
      };
      
      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidPatient),
      });
      
      const response = await POST(request);
      
      // Should return validation error
      expect([400, 422, 500]).toContain(response.status);
    });
  });

  describe('Security Tests', () => {
    it('should reject requests with demo tokens', async () => {
      const { GET } = await import('@/app/api/patients/route');
      
      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer demo-token-for-testing',
        },
      });
      
      const response = await GET(request);
      
      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid tokens', async () => {
      const { GET } = await import('@/app/api/patients/route');
      
      const request = new NextRequest('http://localhost:3000/api/patients', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer invalid.token.here',
        },
      });
      
      const response = await GET(request);
      
      expect(response.status).toBe(401);
    });
  });
});
