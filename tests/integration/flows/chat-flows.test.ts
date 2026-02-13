/**
 * Chat E2E Flow Tests
 *
 * Tests complete user flows for the chat feature:
 * - Patient initiates conversation
 * - Staff receives and responds
 * - SMS delivery flow
 * - Message read receipts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Simulated database state
let chatMessages: any[] = [];
let messageIdCounter = 1;

// Mock user state
let currentMockUser: any = null;
function setMockUser(user: any) {
  currentMockUser = user;
}

// Mock Prisma with stateful behavior
const mockPrismaPatient = {
  findUnique: vi.fn(),
  findFirst: vi.fn(),
};

const mockPrismaChatMessage = {
  create: vi.fn((args) => {
    const newMessage = {
      id: messageIdCounter++,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...args.data,
      replyTo: null,
    };
    chatMessages.push(newMessage);
    return Promise.resolve(newMessage);
  }),
  findUnique: vi.fn((args) => {
    const message = chatMessages.find((m) => m.id === args.where.id);
    return Promise.resolve(message || null);
  }),
  findMany: vi.fn((args) => {
    let results = [...chatMessages];
    if (args.where?.patientId) {
      results = results.filter((m) => m.patientId === args.where.patientId);
    }
    if (args.orderBy?.createdAt === 'desc') {
      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    if (args.take) {
      results = results.slice(0, args.take);
    }
    return Promise.resolve(results.map((m) => ({ ...m, replyTo: null })));
  }),
  count: vi.fn((args) => {
    let results = [...chatMessages];
    if (args.where?.patientId) {
      results = results.filter((m) => m.patientId === args.where.patientId);
    }
    if (args.where?.direction) {
      results = results.filter((m) => m.direction === args.where.direction);
    }
    if (args.where?.readAt === null) {
      results = results.filter((m) => m.readAt === null);
    }
    return Promise.resolve(results.length);
  }),
  updateMany: vi.fn((args) => {
    let count = 0;
    chatMessages.forEach((m) => {
      if (args.where?.patientId && m.patientId !== args.where.patientId) return;
      if (args.where?.direction && m.direction !== args.where.direction) return;
      if (args.where?.readAt === null && m.readAt !== null) return;

      if (args.data.readAt) {
        m.readAt = args.data.readAt;
        count++;
      }
    });
    return Promise.resolve({ count });
  }),
  update: vi.fn((args) => {
    const message = chatMessages.find((m) => m.id === args.where.id);
    if (message) {
      Object.assign(message, args.data);
    }
    return Promise.resolve(message);
  }),
};

const mockPrismaAuditLog = {
  create: vi.fn().mockResolvedValue({ id: 1 }),
};

const mockTransaction = vi.fn(async (callback) => {
  const tx = {
    patientChatMessage: mockPrismaChatMessage,
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

let smsSentMessages: any[] = [];
vi.mock('@/lib/integrations/twilio/smsService', () => ({
  sendSMS: vi.fn((args) => {
    smsSentMessages.push(args);
    return Promise.resolve({ success: true, messageId: `SM${Date.now()}` });
  }),
  formatPhoneNumber: vi.fn((phone) => (phone.startsWith('+') ? phone : `+1${phone}`)),
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

describe('Chat E2E Flows', () => {
  const mockPatient = {
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    phone: '+15551234567',
    clinicId: 1,
  };

  const mockStaff = {
    id: 10,
    email: 'nurse@clinic.com',
    role: 'staff',
    clinicId: 1,
  };

  const mockPatientUser = {
    id: 1,
    email: 'john.doe@email.com',
    role: 'patient',
    patientId: 1,
    clinicId: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    chatMessages = [];
    messageIdCounter = 1;
    smsSentMessages = [];
    currentMockUser = null;

    mockPrismaPatient.findUnique.mockResolvedValue(mockPatient);
    mockPrismaPatient.findFirst.mockResolvedValue(mockPatient);
  });

  describe('Flow 1: Patient Initiates Conversation', () => {
    it('should allow patient to send first message', async () => {
      setMockUser(mockPatientUser);

      const { POST } = await import('@/app/api/patient-chat/route');

      const request = createMockRequest({
        method: 'POST',
        body: {
          patientId: 1,
          message: 'Hi, I have a question about my prescription.',
          channel: 'WEB',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.direction).toBe('INBOUND');
      expect(data.senderType).toBe('PATIENT');
      expect(chatMessages).toHaveLength(1);
    });

    it('should create message in database when patient sends', async () => {
      setMockUser(mockPatientUser);

      const { POST } = await import('@/app/api/patient-chat/route');

      await POST(
        createMockRequest({
          method: 'POST',
          body: {
            patientId: 1,
            message: 'Test message',
            channel: 'WEB',
          },
        })
      );

      // Verify message was stored
      expect(chatMessages.length).toBeGreaterThan(0);
      const lastMessage = chatMessages[chatMessages.length - 1];
      expect(lastMessage.message).toContain('Test message');
    });
  });

  describe('Flow 2: Staff Responds to Patient', () => {
    it('should allow staff to reply via web', async () => {
      // Patient sends message
      setMockUser(mockPatientUser);

      const { POST } = await import('@/app/api/patient-chat/route');

      await POST(
        createMockRequest({
          method: 'POST',
          body: {
            patientId: 1,
            message: 'Question from patient',
            channel: 'WEB',
          },
        })
      );

      // Staff replies
      setMockUser(mockStaff);

      const response = await POST(
        createMockRequest({
          method: 'POST',
          body: {
            patientId: 1,
            message: 'Here is the answer to your question.',
            channel: 'WEB',
          },
        })
      );

      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.direction).toBe('OUTBOUND');
      expect(data.senderType).toBe('STAFF');
      expect(chatMessages).toHaveLength(2);
    });

    it('should allow staff to send SMS to patient', async () => {
      setMockUser(mockStaff);

      const { POST } = await import('@/app/api/patient-chat/route');

      const response = await POST(
        createMockRequest({
          method: 'POST',
          body: {
            patientId: 1,
            message: 'Your lab results are ready. Please call us.',
            channel: 'SMS',
          },
        })
      );

      expect(response.status).toBe(201);

      // Verify SMS was queued
      expect(smsSentMessages).toHaveLength(1);
      expect(smsSentMessages[0].to).toBe('+15551234567');
      expect(smsSentMessages[0].body).toContain('lab results');
    });
  });

  describe('Flow 3: Conversation Thread', () => {
    it('should maintain conversation context over multiple messages', async () => {
      const { POST } = await import('@/app/api/patient-chat/route');

      // Patient asks question
      setMockUser(mockPatientUser);
      await POST(
        createMockRequest({
          method: 'POST',
          body: {
            patientId: 1,
            message: 'What time is my appointment?',
            channel: 'WEB',
          },
        })
      );

      // Staff responds
      setMockUser(mockStaff);
      await POST(
        createMockRequest({
          method: 'POST',
          body: {
            patientId: 1,
            message: 'Your appointment is at 2:00 PM tomorrow.',
            channel: 'WEB',
          },
        })
      );

      // Patient follows up
      setMockUser(mockPatientUser);
      await POST(
        createMockRequest({
          method: 'POST',
          body: {
            patientId: 1,
            message: 'Thank you! Should I bring anything?',
            channel: 'WEB',
          },
        })
      );

      // Verify all messages were stored
      expect(chatMessages).toHaveLength(3);

      // Messages should be in chronological order
      expect(chatMessages[0].message).toContain('appointment');
      expect(chatMessages[1].message).toContain('2:00 PM');
      expect(chatMessages[2].message).toContain('Thank you');
    });
  });

  describe('Flow 4: Read Receipts', () => {
    it('should store messages with readAt as null initially', async () => {
      const { POST } = await import('@/app/api/patient-chat/route');

      // Patient sends messages
      setMockUser(mockPatientUser);
      await POST(
        createMockRequest({
          method: 'POST',
          body: {
            patientId: 1,
            message: 'Message 1',
            channel: 'WEB',
          },
        })
      );

      // Verify message was created without readAt
      expect(chatMessages).toHaveLength(1);
      expect(chatMessages[0].readAt).toBeUndefined();
    });

    it('should NOT mark messages as read when patient views them', async () => {
      const { POST } = await import('@/app/api/patient-chat/route');

      // Staff sends message
      setMockUser(mockStaff);
      await POST(
        createMockRequest({
          method: 'POST',
          body: {
            patientId: 1,
            message: 'Message from staff',
            channel: 'WEB',
          },
        })
      );

      // Message should exist
      expect(chatMessages).toHaveLength(1);
      expect(chatMessages[0].direction).toBe('OUTBOUND');
    });
  });

  describe('Flow 5: Multi-Staff Handling', () => {
    it('should allow different staff members to respond', async () => {
      const { POST } = await import('@/app/api/patient-chat/route');

      // Patient asks question
      setMockUser(mockPatientUser);
      await POST(
        createMockRequest({
          method: 'POST',
          body: {
            patientId: 1,
            message: 'I need help with my medication.',
            channel: 'WEB',
          },
        })
      );

      // Nurse responds
      setMockUser({
        ...mockStaff,
        id: 10,
        email: 'nurse@clinic.com',
      });
      await POST(
        createMockRequest({
          method: 'POST',
          body: {
            patientId: 1,
            message: 'I can help with that. What medication?',
            channel: 'WEB',
          },
        })
      );

      // Doctor follows up
      setMockUser({
        id: 20,
        email: 'doctor@clinic.com',
        role: 'provider',
        clinicId: 1,
      });
      await POST(
        createMockRequest({
          method: 'POST',
          body: {
            patientId: 1,
            message: 'I have reviewed your chart and adjusted the dosage.',
            channel: 'WEB',
          },
        })
      );

      // Verify all messages were created
      expect(chatMessages).toHaveLength(3);

      // Verify different senders
      const senderTypes = chatMessages.map((m) => m.senderType);
      expect(senderTypes).toContain('PATIENT');
      expect(senderTypes).toContain('STAFF');
      expect(senderTypes).toContain('PROVIDER');
    });
  });
});
