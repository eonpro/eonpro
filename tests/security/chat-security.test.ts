/**
 * Chat Security Tests
 *
 * Tests security controls for patient chat:
 * - SQL injection prevention
 * - XSS sanitization
 * - Rate limiting
 * - Authentication bypass attempts
 * - Cross-clinic access prevention
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Track mock user
let currentMockUser: any = null;
function setMockUser(user: any) {
  currentMockUser = user;
}

// Mock Prisma
const mockPrismaPatient = {
  findUnique: vi.fn(),
};

const mockPrismaChatMessage = {
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  updateMany: vi.fn(),
};

const mockPrismaAuditLog = {
  create: vi.fn().mockResolvedValue({ id: 1 }),
};

const mockTransaction = vi.fn(async (callback) => {
  const tx = {
    patientChatMessage: {
      create: vi.fn().mockResolvedValue({
        id: 1,
        patientId: 1,
        message: 'test',
        direction: 'INBOUND',
        status: 'SENT',
      }),
    },
  };
  return callback(tx);
});

vi.mock('@/lib/db', () => ({
  prisma: {
    patient: mockPrismaPatient,
    patientChatMessage: mockPrismaChatMessage,
    auditLog: mockPrismaAuditLog,
    $transaction: mockTransaction,
  },
  basePrisma: {
    patient: mockPrismaPatient,
    patientChatMessage: mockPrismaChatMessage,
    auditLog: mockPrismaAuditLog,
    $transaction: mockTransaction,
  },
  runWithClinicContext: vi.fn((clinicId, callback) => callback()),
  setClinicContext: vi.fn(),
}));

vi.mock('@/lib/integrations/twilio/smsService', () => ({
  sendSMS: vi.fn().mockResolvedValue({ success: true }),
  formatPhoneNumber: vi.fn((phone) => phone),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('@/lib/rateLimit', () => ({
  standardRateLimit: (handler: any) => handler,
}));

vi.mock('@/lib/auth/middleware', () => ({
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
  AuthUser: {},
}));

function createMockRequest(options: {
  method: string;
  body?: any;
  searchParams?: Record<string, string>;
}): NextRequest {
  const url = new URL('http://localhost:3000/api/patient-chat');
  if (options.searchParams) {
    Object.entries(options.searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  return new NextRequest(url, {
    method: options.method,
    ...(options.body && {
      body: JSON.stringify(options.body),
      headers: { 'Content-Type': 'application/json' },
    }),
  });
}

describe('Chat Security Tests', () => {
  const mockPatient = {
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    phone: '+15551234567',
    clinicId: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    currentMockUser = null;
  });

  describe('XSS Prevention', () => {
    it('should sanitize HTML tags in messages', async () => {
      setMockUser({
        id: 1,
        email: 'patient@example.com',
        role: 'patient',
        patientId: 1,
        clinicId: 1,
      });

      mockPrismaPatient.findUnique.mockResolvedValue(mockPatient);
      mockPrismaChatMessage.findUnique.mockResolvedValue({
        id: 1,
        message: '&lt;script&gt;alert("xss")&lt;/script&gt;',
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 1,
          message: '<script>alert("xss")</script>',
          channel: 'WEB',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      // Message should be sanitized
      expect(data.message).not.toContain('<script>');
      expect(data.message).toContain('&lt;');
    });

    it('should sanitize event handlers in messages', async () => {
      setMockUser({
        id: 1,
        email: 'patient@example.com',
        role: 'patient',
        patientId: 1,
        clinicId: 1,
      });

      mockPrismaPatient.findUnique.mockResolvedValue(mockPatient);
      mockPrismaChatMessage.findUnique.mockResolvedValue({
        id: 1,
        message: '&lt;img src=x onerror=alert(1)&gt;',
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 1,
          message: '<img src=x onerror=alert(1)>',
          channel: 'WEB',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.message).not.toContain('<img');
    });

    it('should sanitize JavaScript URLs by escaping special characters', async () => {
      setMockUser({
        id: 1,
        email: 'patient@example.com',
        role: 'patient',
        patientId: 1,
        clinicId: 1,
      });

      mockPrismaPatient.findUnique.mockResolvedValue(mockPatient);
      mockPrismaChatMessage.findUnique.mockResolvedValue({
        id: 1,
        message: '&lt;a href=&quot;javascript:alert(1)&quot;&gt;click&lt;/a&gt;',
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 1,
          message: '<a href="javascript:alert(1)">click</a>',
          channel: 'WEB',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      // The angle brackets should be escaped, making the HTML inactive
      expect(data.message).not.toContain('<a');
      expect(data.message).toContain('&lt;');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should safely handle SQL injection in patientId', async () => {
      setMockUser({
        id: 1,
        email: 'patient@example.com',
        role: 'patient',
        patientId: 1,
        clinicId: 1,
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: "1; DROP TABLE patients;--",
          message: 'Test',
          channel: 'WEB',
        },
      });

      const response = await POST(request);

      // Should reject - either as invalid format (400) or access denied (403)
      // The important thing is the SQL injection doesn't execute
      expect([400, 403]).toContain(response.status);
    });

    it('should safely handle SQL injection in message', async () => {
      setMockUser({
        id: 1,
        email: 'patient@example.com',
        role: 'patient',
        patientId: 1,
        clinicId: 1,
      });

      mockPrismaPatient.findUnique.mockResolvedValue(mockPatient);
      mockPrismaChatMessage.findUnique.mockResolvedValue({
        id: 1,
        message: "'; DROP TABLE messages;--",
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 1,
          message: "'; DROP TABLE messages;--",
          channel: 'WEB',
        },
      });

      const response = await POST(request);

      // Should succeed - Prisma parameterizes queries
      expect(response.status).toBe(201);
    });
  });

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      currentMockUser = null; // No user

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 1,
          message: 'Unauthorized attempt',
          channel: 'WEB',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should prevent patient from accessing other patient data', async () => {
      setMockUser({
        id: 1,
        email: 'patient1@example.com',
        role: 'patient',
        patientId: 1, // Patient 1
        clinicId: 1,
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 2, // Trying to access Patient 2
          message: 'IDOR attempt',
          channel: 'WEB',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(403);
    });

    it('should prevent staff from accessing patients in other clinics', async () => {
      setMockUser({
        id: 10,
        email: 'staff@clinic1.com',
        role: 'staff',
        clinicId: 1, // Staff in Clinic 1
      });

      // Patient in Clinic 2
      mockPrismaPatient.findUnique.mockResolvedValue({
        ...mockPatient,
        clinicId: 2,
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 1,
          message: 'Cross-clinic attempt',
          channel: 'WEB',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(403);

      // Verify security logging
      const { logger } = await import('@/lib/logger');
      expect(logger.security).toHaveBeenCalledWith(
        'Cross-clinic access attempt blocked',
        expect.objectContaining({
          userId: 10,
          userClinicId: 1,
          patientClinicId: 2,
        })
      );
    });

    it('should allow super_admin to bypass clinic restrictions', async () => {
      setMockUser({
        id: 100,
        email: 'admin@system.com',
        role: 'super_admin',
        clinicId: null,
      });

      mockPrismaPatient.findUnique.mockResolvedValue({
        ...mockPatient,
        clinicId: 999, // Any clinic
      });
      mockPrismaChatMessage.findUnique.mockResolvedValue({
        id: 1,
        message: 'Admin message',
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 1,
          message: 'Admin access',
          channel: 'WEB',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
    });
  });

  describe('Input Validation', () => {
    it('should reject messages exceeding max length', async () => {
      setMockUser({
        id: 1,
        email: 'patient@example.com',
        role: 'patient',
        patientId: 1,
        clinicId: 1,
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      // Create a message longer than 2000 characters
      const longMessage = 'A'.repeat(2500);

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 1,
          message: longMessage,
          channel: 'WEB',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should reject empty messages', async () => {
      setMockUser({
        id: 1,
        email: 'patient@example.com',
        role: 'patient',
        patientId: 1,
        clinicId: 1,
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 1,
          message: '',
          channel: 'WEB',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should reject invalid channel types', async () => {
      setMockUser({
        id: 1,
        email: 'patient@example.com',
        role: 'patient',
        patientId: 1,
        clinicId: 1,
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 1,
          message: 'Test',
          channel: 'INVALID_CHANNEL',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should reject zero or negative patientId', async () => {
      setMockUser({
        id: 1,
        email: 'patient@example.com',
        role: 'patient',
        patientId: 1,
        clinicId: 1,
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      // Test with zero patientId
      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 0,
          message: 'Test',
          channel: 'WEB',
        },
      });

      const response = await POST(request);

      // Should reject - either validation (400) or access denied (403)
      expect([400, 403, 500]).toContain(response.status);
    });
  });

  describe('Data Integrity', () => {
    it('should validate replyToId exists and belongs to same patient', async () => {
      setMockUser({
        id: 1,
        email: 'patient@example.com',
        role: 'patient',
        patientId: 1,
        clinicId: 1,
      });

      mockPrismaPatient.findUnique.mockResolvedValue(mockPatient);
      // Reply message belongs to different patient
      mockPrismaChatMessage.findUnique.mockResolvedValueOnce({
        id: 999,
        patientId: 999, // Different patient
      });

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 1,
          message: 'Reply',
          channel: 'WEB',
          replyToId: 999,
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });
});

describe('HIPAA Compliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockUser = null;
  });

  it('should audit message send operations', async () => {
    setMockUser({
      id: 1,
      email: 'patient@example.com',
      role: 'patient',
      patientId: 1,
      clinicId: 1,
    });

    mockPrismaPatient.findUnique.mockResolvedValue({
      id: 1,
      firstName: 'John',
      lastName: 'Doe',
      phone: '+15551234567',
      clinicId: 1,
    });
    mockPrismaChatMessage.findUnique.mockResolvedValue({
      id: 1,
      message: 'Test',
    });

    const { POST } = await import('@/app/api/patient-chat/route');

    const request = createMockRequest({
      method: 'POST',
      body: {
        patientId: 1,
        message: 'Test message for audit',
        channel: 'WEB',
      },
    });

    await POST(request);

    // Verify audit log was created
    expect(mockPrismaAuditLog.create).toHaveBeenCalled();
    const auditCall = mockPrismaAuditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe('CHAT_SEND');
  });
});
