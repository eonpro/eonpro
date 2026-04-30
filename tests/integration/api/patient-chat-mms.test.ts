/**
 * Patient chat — staff outbound MMS
 *
 * Targets the SMS+attachments path of `POST /api/patient-chat`. When staff
 * send `channel: 'SMS'` with attachments:
 *   - each attachment is validated against Twilio's MMS allowlist
 *     (JPEG/JPG/PNG only, ≤5 MB)
 *   - per-attachment violations short-circuit BEFORE the chat row is
 *     created (no half-state)
 *   - on the happy path, `sendSMS` is called with `mediaUrl[]` of 24h
 *     signed URLs (one per attachment), and the chat row's `attachments`
 *     column persists the metadata as for web channel
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

const sendSMSMock = vi.fn();
vi.mock('@/lib/integrations/twilio/smsService', () => ({
  sendSMS: (...args: unknown[]) => sendSMSMock(...args),
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

const generateSignedUrlMock = vi.fn(
  async (key: string, _op: string, ttl: number) => `https://signed.example.com/${key}?ttl=${ttl}`
);
vi.mock('@/lib/integrations/aws/s3Service', () => ({
  generateSignedUrl: (...args: unknown[]) =>
    generateSignedUrlMock(...(args as Parameters<typeof generateSignedUrlMock>)),
}));

vi.mock('@/lib/integrations/aws/s3Config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/integrations/aws/s3Config')>(
    '@/lib/integrations/aws/s3Config'
  );
  return { ...actual, isS3Enabled: () => true };
});

let currentMockUser: Record<string, unknown> | null = null;
vi.mock('@/lib/auth/middleware', () => ({
  withAuth:
    (handler: (req: NextRequest, user: unknown) => Promise<Response>) =>
    async (req: NextRequest) => {
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

const mkPatient = (overrides: Record<string, unknown> = {}) => ({
  id: 42,
  firstName: 'Ada',
  lastName: 'Lovelace',
  phone: '+15555550100',
  clinicId: 5,
  ...overrides,
});

const validPngKey = 'chat-attachments/5/42/1700000000000-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png';
const validJpegKey = 'chat-attachments/5/42/1700000000001-bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
const validPdfKey = 'chat-attachments/5/42/1700000000002-cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee.pdf';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/patient-chat — staff outbound MMS (channel=SMS + attachments)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUser({
      id: 11,
      role: 'staff',
      clinicId: 5,
      email: 'staff@test',
    });
    mockPrismaPatient.findUnique.mockResolvedValue(mkPatient());
    notifyAdminsMock.mockResolvedValue(undefined);
    sendSMSMock.mockResolvedValue({
      success: true,
      messageId: 'SMabc123',
      details: { status: 'queued', price: '0.02', priceUnit: 'USD' },
    });
    txCreate.mockImplementation(async ({ data }) => ({ id: 9000, ...data }));
    mockPrismaChatMessage.update.mockResolvedValue({});
    mockPrismaChatMessage.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      patientId: 42,
      clinicId: 5,
      message: 'see the photo',
      direction: 'OUTBOUND',
      channel: 'SMS',
      attachments: null,
      replyTo: null,
    }));
  });

  it('passes mediaUrl[] of 24h signed URLs to sendSMS on the happy path', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(
      postReq({
        patientId: 42,
        message: 'Here is your dose chart',
        channel: 'SMS',
        attachments: [{ s3Key: validPngKey, name: 'chart.png', mime: 'image/png', size: 200_000 }],
      })
    );

    expect(res.status).toBe(201);
    expect(sendSMSMock).toHaveBeenCalledTimes(1);
    const arg = sendSMSMock.mock.calls[0][0];
    expect(arg.body).toBe('Here is your dose chart');
    expect(Array.isArray(arg.mediaUrl)).toBe(true);
    expect(arg.mediaUrl).toHaveLength(1);
    expect(arg.mediaUrl[0]).toContain('signed.example.com');
    // 24h TTL specifically for MMS deliveries (NOT the 1h web TTL)
    expect(generateSignedUrlMock).toHaveBeenCalledWith(validPngKey, 'GET', 24 * 60 * 60);
  });

  it('forwards multiple media URLs in submission order', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    await POST(
      postReq({
        patientId: 42,
        message: '',
        channel: 'SMS',
        attachments: [
          { s3Key: validPngKey, name: 'a.png', mime: 'image/png', size: 1000 },
          { s3Key: validJpegKey, name: 'b.jpg', mime: 'image/jpeg', size: 2000 },
        ],
      })
    );
    const arg = sendSMSMock.mock.calls[0][0];
    expect(arg.mediaUrl).toHaveLength(2);
    expect(arg.mediaUrl[0]).toContain(validPngKey);
    expect(arg.mediaUrl[1]).toContain(validJpegKey);
  });

  it('rejects PDF attachments with a clear error before any chat row is created', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(
      postReq({
        patientId: 42,
        message: 'see attached',
        channel: 'SMS',
        attachments: [{ s3Key: validPdfKey, name: 'lab.pdf', mime: 'application/pdf', size: 1000 }],
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/PDF/i);
    expect(body.error).toMatch(/Web/i);
    expect(txCreate).not.toHaveBeenCalled();
    expect(sendSMSMock).not.toHaveBeenCalled();
  });

  it('rejects HEIC + WebP over MMS', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(
      postReq({
        patientId: 42,
        message: '',
        channel: 'SMS',
        attachments: [{ s3Key: validPngKey, name: 'p.heic', mime: 'image/heic', size: 1000 }],
      })
    );
    expect(res.status).toBe(400);
    expect(sendSMSMock).not.toHaveBeenCalled();
  });

  it('rejects images larger than 5 MB even if the MIME is allowed', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(
      postReq({
        patientId: 42,
        message: 'big',
        channel: 'SMS',
        attachments: [
          { s3Key: validPngKey, name: 'huge.png', mime: 'image/png', size: 8 * 1024 * 1024 },
        ],
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/5\s*MB/i);
    expect(sendSMSMock).not.toHaveBeenCalled();
  });

  it('still allows attachment-only SMS (empty body) when image is in-spec', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(
      postReq({
        patientId: 42,
        message: '',
        channel: 'SMS',
        attachments: [{ s3Key: validPngKey, name: 'a.png', mime: 'image/png', size: 1000 }],
      })
    );
    expect(res.status).toBe(201);
    expect(sendSMSMock).toHaveBeenCalledTimes(1);
  });

  it('marks the chat row FAILED with the failureReason from sendSMS when Twilio rejects', async () => {
    sendSMSMock.mockResolvedValueOnce({
      success: false,
      blocked: true,
      blockReason: 'Recipient has opted out of SMS',
      error: 'Recipient opted out',
    });

    const { POST } = await import('@/app/api/patient-chat/route');
    const res = await POST(
      postReq({
        patientId: 42,
        message: 'hi',
        channel: 'SMS',
        attachments: [{ s3Key: validPngKey, name: 'a.png', mime: 'image/png', size: 1000 }],
      })
    );

    expect(res.status).toBe(201); // chat row still persisted, marked failed
    const updateCalls = mockPrismaChatMessage.update.mock.calls;
    const failedUpdate = updateCalls.find(
      ([call]) => (call as { data?: { status?: string } })?.data?.status === 'FAILED'
    );
    expect(failedUpdate).toBeTruthy();
    if (failedUpdate) {
      expect(failedUpdate[0].data.failureReason).toMatch(/opt(ed)? out/i);
    }
  });

  it('does NOT pass mediaUrl[] for plain SMS (no attachments) — backward compatibility', async () => {
    const { POST } = await import('@/app/api/patient-chat/route');
    await POST(
      postReq({
        patientId: 42,
        message: 'just text',
        channel: 'SMS',
      })
    );
    const arg = sendSMSMock.mock.calls[0][0];
    expect(arg.mediaUrl).toBeUndefined();
  });
});
