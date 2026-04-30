/**
 * Patient Chat Attachments — full send/list flow
 *
 * Targets `/api/patient-chat` POST + GET extensions for chat attachments.
 * The original `tests/integration/api/patient-chat.test.ts` covers the
 * text-only behavior; this file covers everything that depends on the new
 * `attachments[]` field shape — schema validation, cross-tenant defense,
 * persistence, and signed-URL resolution on read.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrismaPatient = { findUnique: vi.fn() };
const mockPrismaChatMessage = {
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
};
const mockPrismaAuditLog = { create: vi.fn().mockResolvedValue({ id: 1 }) };

const txCreate = vi.fn();
const mockTransaction = vi.fn(async (callback: (tx: unknown) => unknown) => {
  return callback({
    patientChatMessage: { create: txCreate },
  });
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
  runWithClinicContext: vi.fn((_clinicId, cb: () => unknown) => cb()),
}));

vi.mock('@/lib/integrations/twilio/smsService', () => ({
  sendSMS: vi.fn().mockResolvedValue({ success: true, messageId: 'SM123' }),
  formatPhoneNumber: vi.fn((p: string) => (p.startsWith('+') ? p : `+1${p}`)),
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
  standardRateLimit: (handler: unknown) => handler,
}));

const notifyAdminsMock = vi.fn();
vi.mock('@/services/notification/notificationService', () => ({
  notificationService: { notifyAdmins: notifyAdminsMock },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPHI: (s: string | null | undefined) => s ?? '',
  encryptPHI: (s: string) => s,
}));

const mockGenerateSignedUrl = vi.fn(
  async (key: string) => `https://signed.example.com/${key}?ttl=3600`
);
vi.mock('@/lib/integrations/aws/s3Service', () => ({
  generateSignedUrl: (...args: unknown[]) => mockGenerateSignedUrl(...(args as Parameters<typeof mockGenerateSignedUrl>)),
}));

const mockIsS3Enabled = vi.fn(() => true);
vi.mock('@/lib/integrations/aws/s3Config', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/integrations/aws/s3Config')>(
      '@/lib/integrations/aws/s3Config'
    );
  return { ...actual, isS3Enabled: () => mockIsS3Enabled() };
});

let currentMockUser: Record<string, unknown> | null = null;
vi.mock('@/lib/auth/middleware', () => ({
  withAuth: (handler: (req: NextRequest, user: unknown) => Promise<Response>) => async (req: NextRequest) => {
    if (!currentMockUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return handler(req, currentMockUser);
  },
  AuthUser: {},
}));

function setUser(u: Record<string, unknown> | null) {
  currentMockUser = u;
}

function postReq(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost:3000/api/patient-chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function getReq(qs: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/patient-chat');
  Object.entries(qs).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mkPatient = (overrides: Record<string, unknown> = {}) => ({
  id: 42,
  firstName: 'Ada',
  lastName: 'Lovelace',
  phone: '+15555550100',
  clinicId: 5,
  ...overrides,
});

const validKey = 'chat-attachments/5/42/1700000000000-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png';
const otherClinicKey = 'chat-attachments/8/42/1700000000000-bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee.png';
const otherPatientKey = 'chat-attachments/5/99/1700000000000-cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee.png';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/patient-chat — attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser({
      id: 7,
      role: 'patient',
      patientId: 42,
      clinicId: 5,
      email: 'p@test',
    });
    mockIsS3Enabled.mockReturnValue(true);
    mockPrismaPatient.findUnique.mockResolvedValue(mkPatient());
    notifyAdminsMock.mockResolvedValue(undefined);
    txCreate.mockImplementation(async ({ data }) => ({
      id: 1234,
      ...data,
    }));
    mockPrismaChatMessage.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      patientId: 42,
      clinicId: 5,
      message: 'persisted',
      direction: 'INBOUND',
      channel: 'WEB',
      attachments: null,
      replyTo: null,
    }));
  });

  it('persists attachments[] to the JSON column on success', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');

    const res = await POST(
      postReq({
        patientId: 42,
        message: 'Here is my ID photo',
        channel: 'WEB',
        attachments: [
          {
            s3Key: validKey,
            name: 'id.png',
            mime: 'image/png',
            size: 4096,
          },
        ],
      })
    );

    expect(res.status).toBe(201);
    expect(txCreate).toHaveBeenCalledTimes(1);
    const written = txCreate.mock.calls[0][0].data;
    expect(Array.isArray(written.attachments)).toBe(true);
    expect(written.attachments).toHaveLength(1);
    expect(written.attachments[0].s3Key).toBe(validKey);
    expect(written.attachments[0].mime).toBe('image/png');
    expect(written.attachments[0].size).toBe(4096);
    expect(written.attachments[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof written.attachments[0].uploadedAt).toBe('string');
  });

  it('allows attachment-only messages (empty text body)', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(
      postReq({
        patientId: 42,
        message: '',
        channel: 'WEB',
        attachments: [
          { s3Key: validKey, name: 'x.png', mime: 'image/png', size: 100 },
        ],
      })
    );
    expect(res.status).toBe(201);
  });

  it('still rejects empty message with no attachments (backward compat)', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(postReq({ patientId: 42, message: '', channel: 'WEB' }));
    expect(res.status).toBe(400);
  });

  it('rejects an s3Key from another patient (cross-tenant TOCTOU)', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(
      postReq({
        patientId: 42,
        message: 'attempting bypass',
        channel: 'WEB',
        attachments: [
          { s3Key: otherPatientKey, name: 'x.png', mime: 'image/png', size: 100 },
        ],
      })
    );
    expect(res.status).toBe(400);
    expect(txCreate).not.toHaveBeenCalled();
  });

  it('rejects an s3Key from another clinic', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(
      postReq({
        patientId: 42,
        message: 'attempting bypass',
        channel: 'WEB',
        attachments: [
          { s3Key: otherClinicKey, name: 'x.png', mime: 'image/png', size: 100 },
        ],
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects more than 5 attachments per message', async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      s3Key: validKey.replace('aaaa', `aaa${i}`),
      name: `${i}.png`,
      mime: 'image/png',
      size: 100,
    }));
    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(
      postReq({ patientId: 42, message: 'too many', channel: 'WEB', attachments: six })
    );
    expect(res.status).toBe(400);
  });

  it('rejects an attachment whose mime is not on the chat allowlist', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(
      postReq({
        patientId: 42,
        message: 'bad mime',
        channel: 'WEB',
        attachments: [
          { s3Key: validKey, name: 'x.docx', mime: 'application/msword', size: 100 },
        ],
      })
    );
    expect(res.status).toBe(400);
  });

  it('rejects an attachment whose size exceeds 15 MB', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(
      postReq({
        patientId: 42,
        message: 'huge',
        channel: 'WEB',
        attachments: [
          {
            s3Key: validKey,
            name: 'huge.png',
            mime: 'image/png',
            size: 20 * 1024 * 1024,
          },
        ],
      })
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/patient-chat — attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser({
      id: 11,
      role: 'staff',
      clinicId: 5,
      email: 'staff@test',
    });
    mockIsS3Enabled.mockReturnValue(true);
    mockPrismaPatient.findUnique.mockResolvedValue(mkPatient());
    mockPrismaChatMessage.count.mockResolvedValue(0);
    mockPrismaChatMessage.updateMany.mockResolvedValue({ count: 0 });
  });

  it('resolves each attachment s3Key into a signed URL and strips raw keys', async () => {
    const persistedAttachment = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      s3Key: validKey,
      name: 'id.png',
      mime: 'image/png',
      size: 4096,
      uploadedAt: '2026-04-26T12:00:00.000Z',
    };

    mockPrismaChatMessage.findMany.mockResolvedValue([
      {
        id: 1,
        patientId: 42,
        clinicId: 5,
        message: 'see attachment',
        direction: 'INBOUND',
        channel: 'WEB',
        createdAt: new Date('2026-04-26T12:00:00Z'),
        readAt: null,
        replyTo: null,
        attachments: [persistedAttachment],
      },
    ]);

    const { GET } = await import('@/app/api/patient-chat/route');
    const res = await GET(getReq({ patientId: '42' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    const message = body.data[0];

    expect(Array.isArray(message.attachments)).toBe(true);
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0].url).toContain('signed.example.com');
    expect(message.attachments[0].id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(message.attachments[0].mime).toBe('image/png');
    expect(message.attachments[0].size).toBe(4096);
    expect(message.attachments[0].name).toBe('id.png');
    // raw S3 key must never leak to the client
    expect('s3Key' in message.attachments[0]).toBe(false);
    expect('thumbnailKey' in message.attachments[0]).toBe(false);

    expect(mockGenerateSignedUrl).toHaveBeenCalledWith(validKey, 'GET', 3600);
  });

  it('handles messages with no attachments unchanged', async () => {
    mockPrismaChatMessage.findMany.mockResolvedValue([
      {
        id: 2,
        patientId: 42,
        clinicId: 5,
        message: 'plain text',
        direction: 'INBOUND',
        channel: 'WEB',
        createdAt: new Date(),
        readAt: null,
        replyTo: null,
        attachments: null,
      },
    ]);

    const { GET } = await import('@/app/api/patient-chat/route');
    const res = await GET(getReq({ patientId: '42' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].attachments == null || body.data[0].attachments.length === 0).toBe(
      true
    );
    expect(mockGenerateSignedUrl).not.toHaveBeenCalled();
  });

  it('skips attachments with malformed shape rather than crashing the request', async () => {
    mockPrismaChatMessage.findMany.mockResolvedValue([
      {
        id: 3,
        patientId: 42,
        clinicId: 5,
        message: 'mix',
        direction: 'INBOUND',
        channel: 'WEB',
        createdAt: new Date(),
        readAt: null,
        replyTo: null,
        attachments: [
          { not: 'a real attachment' },
          {
            id: 'good-id',
            s3Key: validKey,
            name: 'a.png',
            mime: 'image/png',
            size: 1,
            uploadedAt: '2026-04-26T00:00:00Z',
          },
        ],
      },
    ]);
    const { GET } = await import('@/app/api/patient-chat/route');
    const res = await GET(getReq({ patientId: '42' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].attachments).toHaveLength(1);
    expect(body.data[0].attachments[0].id).toBe('good-id');
  });

  it('falls back to no signed URL when S3 is disabled (returns metadata only)', async () => {
    mockIsS3Enabled.mockReturnValue(false);
    mockPrismaChatMessage.findMany.mockResolvedValue([
      {
        id: 4,
        patientId: 42,
        clinicId: 5,
        message: '',
        direction: 'INBOUND',
        channel: 'WEB',
        createdAt: new Date(),
        readAt: null,
        replyTo: null,
        attachments: [
          {
            id: 'x',
            s3Key: validKey,
            name: 'a.png',
            mime: 'image/png',
            size: 1,
            uploadedAt: '2026-04-26T00:00:00Z',
          },
        ],
      },
    ]);
    const { GET } = await import('@/app/api/patient-chat/route');
    const res = await GET(getReq({ patientId: '42' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // attachment should be present with no URL (clients render fallback icon)
    expect(body.data[0].attachments[0]).toMatchObject({
      id: 'x',
      mime: 'image/png',
      name: 'a.png',
    });
    expect(body.data[0].attachments[0].url).toBeFalsy();
  });
});
