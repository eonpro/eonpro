/**
 * Patient Chat Attachments Upload API — integration tests
 *
 * Covers `POST /api/patient-chat/attachments/upload` — the presigned-PUT
 * minting endpoint that lets either side of a patient ↔ clinic conversation
 * upload a file (image/PDF) directly to S3 before referencing it from a
 * subsequent `POST /api/patient-chat` call.
 *
 * Security-critical assertions:
 *   - Patient role can only upload for self
 *   - Staff/provider role can only upload for patients in their clinic
 *   - Super admin can upload for any clinic
 *   - MIME types outside the locked allowlist are rejected
 *   - File sizes above 15 MB are rejected
 *   - The returned `s3Key` is structurally valid (passes
 *     `validateChatAttachmentS3Key` for the resolved owner)
 *   - 503 returned cleanly when S3 is not enabled
 *   - HIPAA audit row is written on success
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { validateChatAttachmentS3Key } from '@/lib/chat-attachments';

// ---------------------------------------------------------------------------
// Mocks (all hoisted via vi.mock — must precede the route import)
// ---------------------------------------------------------------------------

const mockPrismaPatient = {
  findUnique: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  prisma: {
    patient: mockPrismaPatient,
  },
  basePrisma: {
    patient: mockPrismaPatient,
  },
  runWithClinicContext: vi.fn((_clinicId, callback: () => unknown) => callback()),
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

const mockGenerateSignedUrl = vi.fn();
vi.mock('@/lib/integrations/aws/s3Service', () => ({
  generateSignedUrl: (...args: unknown[]) => mockGenerateSignedUrl(...args),
}));

const mockIsS3Enabled = vi.fn();
const mockIsS3Configured = vi.fn();
vi.mock('@/lib/integrations/aws/s3Config', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/integrations/aws/s3Config')>(
      '@/lib/integrations/aws/s3Config'
    );
  return {
    ...actual,
    isS3Enabled: () => mockIsS3Enabled(),
    isS3Configured: () => mockIsS3Configured(),
    s3Config: {
      ...actual.s3Config,
      bucketName: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'AKIA-test',
      secretAccessKey: 'secret-test',
    },
  };
});

vi.mock('@/lib/features', () => ({
  isFeatureEnabled: vi.fn().mockReturnValue(true),
}));

const mockLogPHICreate = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/audit/hipaa-audit', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/audit/hipaa-audit')>(
      '@/lib/audit/hipaa-audit'
    );
  return {
    ...actual,
    logPHICreate: (...args: unknown[]) => mockLogPHICreate(...args),
  };
});

// Pass-through rate limiter (the production wrapper is independently tested).
vi.mock('@/lib/security/rate-limiter', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/security/rate-limiter')>(
      '@/lib/security/rate-limiter'
    );
  return {
    ...actual,
    withRateLimit: (handler: unknown) => handler,
  };
});

// Auth middleware — inject the configured user.
let currentMockUser: Record<string, unknown> | null = null;
vi.mock('@/lib/auth/middleware', () => ({
  withAuth: (handler: (req: NextRequest, user: unknown) => Promise<Response>) => {
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

function setMockUser(user: Record<string, unknown> | null) {
  currentMockUser = user;
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(
    new URL('http://localhost:3000/api/patient-chat/attachments/upload'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('POST /api/patient-chat/attachments/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockUser(null);
    mockIsS3Enabled.mockReturnValue(true);
    mockIsS3Configured.mockReturnValue(true);
    mockGenerateSignedUrl.mockResolvedValue('https://s3.example.com/signed-put-url?sig=abc');
  });

  it('returns 401 without an authenticated user', async () => {
    const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
    const res = await POST(makeRequest({ contentType: 'image/png', fileSize: 1024 }));
    expect(res.status).toBe(401);
  });

  it('returns 503 with diagnostics when S3 is not enabled', async () => {
    setMockUser({ id: 1, role: 'patient', patientId: 1, clinicId: 1, email: 'p@test' });
    mockIsS3Enabled.mockReturnValue(false);
    mockPrismaPatient.findUnique.mockResolvedValue({ id: 1, clinicId: 1 });

    const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
    const res = await POST(makeRequest({ contentType: 'image/png', fileSize: 1024 }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/storage/i);
  });

  describe('input validation', () => {
    beforeEach(() => {
      setMockUser({ id: 1, role: 'patient', patientId: 1, clinicId: 1, email: 'p@test' });
      mockPrismaPatient.findUnique.mockResolvedValue({ id: 1, clinicId: 1 });
    });

    it('rejects MIME types outside the chat allowlist', async () => {
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(
        makeRequest({ contentType: 'application/zip', fileSize: 1024 })
      );
      expect(res.status).toBe(400);
      expect(mockGenerateSignedUrl).not.toHaveBeenCalled();
    });

    it('rejects msword (intentionally not on the chat allowlist)', async () => {
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(
        makeRequest({
          contentType: 'application/msword',
          fileSize: 1024,
        })
      );
      expect(res.status).toBe(400);
    });

    it('rejects file sizes above 15 MB', async () => {
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(
        makeRequest({
          contentType: 'image/png',
          fileSize: 16 * 1024 * 1024,
        })
      );
      expect(res.status).toBe(400);
      expect(mockGenerateSignedUrl).not.toHaveBeenCalled();
    });

    it('rejects zero or negative file size', async () => {
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(
        makeRequest({ contentType: 'image/png', fileSize: 0 })
      );
      expect(res.status).toBe(400);
    });

    it('rejects missing contentType', async () => {
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(makeRequest({ fileSize: 1024 }));
      expect(res.status).toBe(400);
    });
  });

  describe('patient role', () => {
    beforeEach(() => {
      setMockUser({
        id: 7,
        role: 'patient',
        patientId: 42,
        clinicId: 5,
        email: 'p@test',
      });
      mockPrismaPatient.findUnique.mockResolvedValue({ id: 42, clinicId: 5 });
    });

    it('mints a presigned PUT URL scoped to the patient + clinic', async () => {
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(
        makeRequest({ contentType: 'image/png', fileSize: 12345, fileName: 'pic.png' })
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.uploadUrl).toBe('https://s3.example.com/signed-put-url?sig=abc');
      expect(body.maxSize).toBe(15 * 1024 * 1024);
      expect(body.expiresIn).toBe(300);

      expect(typeof body.s3Key).toBe('string');
      expect(validateChatAttachmentS3Key(body.s3Key, { clinicId: 5, patientId: 42 })).toBe(true);

      expect(mockGenerateSignedUrl).toHaveBeenCalledWith(body.s3Key, 'PUT', 300);
    });

    it('ignores any patientId in the body and uses the authed user.patientId', async () => {
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(
        makeRequest({
          contentType: 'application/pdf',
          fileSize: 5000,
          patientId: 999, // attempted spoof
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(validateChatAttachmentS3Key(body.s3Key, { clinicId: 5, patientId: 42 })).toBe(true);
      expect(validateChatAttachmentS3Key(body.s3Key, { clinicId: 5, patientId: 999 })).toBe(false);
    });

    it('returns 404 if the authed patient row no longer exists', async () => {
      mockPrismaPatient.findUnique.mockResolvedValue(null);
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(
        makeRequest({ contentType: 'image/png', fileSize: 1024 })
      );
      expect(res.status).toBe(404);
    });

    it('writes a HIPAA audit entry on success', async () => {
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      await POST(
        makeRequest({ contentType: 'image/jpeg', fileSize: 2048, fileName: 'x.jpg' })
      );
      expect(mockLogPHICreate).toHaveBeenCalled();
      const args = mockLogPHICreate.mock.calls[0];
      expect(args[2]).toBe('PatientChatAttachmentUpload');
      expect(args[4]).toBe(42); // patientId
    });
  });

  describe('staff role', () => {
    beforeEach(() => {
      setMockUser({
        id: 11,
        role: 'staff',
        clinicId: 5,
        email: 's@test',
      });
    });

    it('requires patientId in body for non-patient roles', async () => {
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(
        makeRequest({ contentType: 'image/png', fileSize: 1024 })
      );
      expect(res.status).toBe(400);
    });

    it('mints a presigned URL for a patient in the same clinic', async () => {
      mockPrismaPatient.findUnique.mockResolvedValue({ id: 42, clinicId: 5 });
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(
        makeRequest({
          contentType: 'application/pdf',
          fileSize: 1024,
          patientId: 42,
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(validateChatAttachmentS3Key(body.s3Key, { clinicId: 5, patientId: 42 })).toBe(true);
    });

    it('rejects cross-clinic upload attempts', async () => {
      mockPrismaPatient.findUnique.mockResolvedValue({ id: 42, clinicId: 99 });
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(
        makeRequest({
          contentType: 'image/png',
          fileSize: 1024,
          patientId: 42,
        })
      );
      expect(res.status).toBe(403);
      expect(mockGenerateSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('super admin', () => {
    it('can mint a presigned URL for a patient in any clinic', async () => {
      setMockUser({ id: 1, role: 'super_admin', email: 'admin@test' });
      mockPrismaPatient.findUnique.mockResolvedValue({ id: 42, clinicId: 99 });
      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(
        makeRequest({
          contentType: 'image/webp',
          fileSize: 1024,
          patientId: 42,
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(validateChatAttachmentS3Key(body.s3Key, { clinicId: 99, patientId: 42 })).toBe(true);
    });
  });

  describe('S3 signing failure', () => {
    it('returns 500 with stable error code when generateSignedUrl throws', async () => {
      setMockUser({ id: 1, role: 'patient', patientId: 1, clinicId: 1, email: 'p@test' });
      mockPrismaPatient.findUnique.mockResolvedValue({ id: 1, clinicId: 1 });
      mockGenerateSignedUrl.mockRejectedValueOnce(new Error('S3 unreachable'));

      const { POST } = await import('@/app/api/patient-chat/attachments/upload/route');
      const res = await POST(
        makeRequest({ contentType: 'image/png', fileSize: 1024 })
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.code).toBe('S3_SIGN_FAILED');
    });
  });
});
