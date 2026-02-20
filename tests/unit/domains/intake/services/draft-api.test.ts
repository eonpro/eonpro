/**
 * Draft API Route Tests
 * =====================
 *
 * Tests for the intake form draft upsert/load API routes, including
 * PHI encryption, validation, and clinic resolution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---- Mocks ----

const mockClinicFindFirst = vi.fn();
const mockTemplateFindFirst = vi.fn();
const mockDraftUpsert = vi.fn();
const mockDraftFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    clinic: { findFirst: (...args: unknown[]) => mockClinicFindFirst(...args) },
    intakeFormTemplate: { findFirst: (...args: unknown[]) => mockTemplateFindFirst(...args) },
    intakeFormDraft: {
      upsert: (...args: unknown[]) => mockDraftUpsert(...args),
      findUnique: (...args: unknown[]) => mockDraftFindUnique(...args),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/domains/shared/errors', () => ({
  handleApiError: vi.fn((_err: unknown, _ctx?: unknown) => {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }),
}));

let encryptCalled = false;
let decryptCalled = false;
vi.mock('@/lib/security/phi-encryption', () => ({
  encryptPHI: (val: string) => { encryptCalled = true; return `enc:${val}`; },
  decryptPHI: (val: string) => { decryptCalled = true; return val.replace('enc:', ''); },
  isEncrypted: (val: string) => typeof val === 'string' && val.startsWith('enc:'),
}));

import { POST, GET } from '@/app/api/intake-forms/drafts/route';

function makeRequest(method: string, body?: Record<string, unknown>, query?: string): NextRequest {
  const url = `http://localhost:3000/api/intake-forms/drafts${query ? `?${query}` : ''}`;
  if (method === 'GET') {
    return new NextRequest(url, { method });
  }
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Draft API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    encryptCalled = false;
    decryptCalled = false;
  });

  // -----------------------------------------------------------------------
  // POST /api/intake-forms/drafts
  // -----------------------------------------------------------------------

  describe('POST', () => {
    const validBody = {
      sessionId: 'INT-123-abc',
      templateId: '5',
      clinicSlug: 'eonmeds',
      currentStep: 'step-2',
      completedSteps: ['step-1'],
      responses: { firstName: 'Jane', favoriteColor: 'blue' },
    };

    it('upserts a draft and encrypts PHI fields', async () => {
      mockClinicFindFirst.mockResolvedValue({ id: 1 });
      mockDraftUpsert.mockResolvedValue({});

      const res = await POST(makeRequest('POST', validBody));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.sessionId).toBe('INT-123-abc');
      expect(encryptCalled).toBe(true);
      expect(mockDraftUpsert).toHaveBeenCalled();
    });

    it('returns 400 on invalid body', async () => {
      const res = await POST(makeRequest('POST', { sessionId: '' }));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Validation');
    });

    it('returns 404 when clinic is not found', async () => {
      mockClinicFindFirst.mockResolvedValue(null);

      const res = await POST(makeRequest('POST', validBody));
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toContain('Clinic');
    });

    it('resolves templateId from treatmentType slug when non-numeric', async () => {
      mockClinicFindFirst.mockResolvedValue({ id: 1 });
      mockTemplateFindFirst.mockResolvedValue({ id: 42 });
      mockDraftUpsert.mockResolvedValue({});

      const body = { ...validBody, templateId: 'weight-loss' };
      const res = await POST(makeRequest('POST', body));

      expect(res.status).toBe(200);
      expect(mockTemplateFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ treatmentType: 'weight-loss' }),
        }),
      );
    });

    it('returns 404 when template slug cannot be resolved', async () => {
      mockClinicFindFirst.mockResolvedValue({ id: 1 });
      mockTemplateFindFirst.mockResolvedValue(null);

      const body = { ...validBody, templateId: 'nonexistent-type' };
      const res = await POST(makeRequest('POST', body));
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toContain('Template');
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/intake-forms/drafts
  // -----------------------------------------------------------------------

  describe('GET', () => {
    it('returns the draft and decrypts PHI fields', async () => {
      mockDraftFindUnique.mockResolvedValue({
        sessionId: 'INT-123-abc',
        currentStep: 'step-2',
        completedSteps: ['step-1'],
        responses: { firstName: 'enc:Jane', favoriteColor: 'blue' },
        startedAt: new Date(),
        lastSavedAt: new Date(),
        status: 'IN_PROGRESS',
        template: { name: 'Weight Loss Intake', treatmentType: 'weight-loss' },
      });

      const res = await GET(makeRequest('GET', undefined, 'sessionId=INT-123-abc'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.draft.sessionId).toBe('INT-123-abc');
      expect(data.draft.responses.firstName).toBe('Jane');
      expect(decryptCalled).toBe(true);
    });

    it('returns 400 when sessionId query param is missing', async () => {
      const res = await GET(makeRequest('GET'));
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('sessionId');
    });

    it('returns 404 when draft is not found', async () => {
      mockDraftFindUnique.mockResolvedValue(null);

      const res = await GET(makeRequest('GET', undefined, 'sessionId=nonexistent'));
      const data = await res.json();

      expect(res.status).toBe(404);
    });

    it('returns 404 when draft status is not IN_PROGRESS', async () => {
      mockDraftFindUnique.mockResolvedValue({
        sessionId: 'INT-123-abc',
        status: 'COMPLETED',
        responses: {},
        template: { name: 'Test', treatmentType: 'test' },
      });

      const res = await GET(makeRequest('GET', undefined, 'sessionId=INT-123-abc'));
      const data = await res.json();

      expect(res.status).toBe(404);
    });
  });
});
