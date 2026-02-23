/**
 * Unit tests for POST /api/admin/fix-incomplete-search-index
 * Ensures dry run does not mutate data and live run updates only incomplete records.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPatientFindMany = vi.fn();
const mockPatientCount = vi.fn();
const mockPatientUpdate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findMany: mockPatientFindMany,
      count: mockPatientCount,
      update: mockPatientUpdate,
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPHI: vi.fn((v: string) => (v && v.includes(':') ? 'decrypted' : v)),
}));

vi.mock('@/lib/auth/middleware', () => ({
  withAdminAuth: (handler: (req: NextRequest) => Promise<Response>) => handler,
}));

// Import after mocks
const { POST } = await import('@/app/api/admin/fix-incomplete-search-index/route');

describe('POST /api/admin/fix-incomplete-search-index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dry run returns count and does not call update', async () => {
    // First batch: one incomplete (single token), one complete
    mockPatientFindMany
      .mockResolvedValueOnce([
        { id: 1, searchIndex: 'eon-7914' },
        { id: 2, searchIndex: 'alexis adkins a@b.com eon-2' },
      ])
      .mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost/api/admin/fix-incomplete-search-index?dryRun=true');
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.patientsWithIncompleteSearchIndex).toBe(1);
    expect(mockPatientUpdate).not.toHaveBeenCalled();
  });

  it('dry run with no incomplete patients returns zero', async () => {
    mockPatientFindMany
      .mockResolvedValueOnce([
        { id: 1, searchIndex: 'alexis adkins a@b.com eon-1' },
      ])
      .mockResolvedValueOnce([]);

    const req = new NextRequest('http://localhost/api/admin/fix-incomplete-search-index?dryRun=true');
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.patientsWithIncompleteSearchIndex).toBe(0);
    expect(mockPatientUpdate).not.toHaveBeenCalled();
  });

  it('live run updates incomplete patients and does not update complete ones', async () => {
    const incompletePatient = {
      id: 13030,
      patientId: 'EON-7914',
      firstName: 'enc:iv:tag',
      lastName: 'enc:iv:tag',
      email: 'enc:iv:tag',
      phone: 'enc:iv:tag',
      searchIndex: 'eon-7914',
    };
    mockPatientFindMany
      .mockResolvedValueOnce([incompletePatient])
      .mockResolvedValueOnce([]);
    mockPatientUpdate.mockResolvedValue({});

    const req = new NextRequest('http://localhost/api/admin/fix-incomplete-search-index');
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.updated).toBe(1);
    expect(mockPatientUpdate).toHaveBeenCalledTimes(1);
    expect(mockPatientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 13030 },
        data: expect.objectContaining({
          searchIndex: expect.any(String),
        }),
      })
    );
    expect(mockPatientUpdate.mock.calls[0][0].data.searchIndex).toContain('eon-7914');
  });

  it('treats null and empty searchIndex as incomplete', async () => {
    mockPatientFindMany
      .mockResolvedValueOnce([
        { id: 10, patientId: 'EON-1', firstName: 'a', lastName: 'b', email: 'e', phone: 'p', searchIndex: null },
        { id: 11, patientId: 'EON-2', firstName: 'a', lastName: 'b', email: 'e', phone: 'p', searchIndex: '' },
      ])
      .mockResolvedValueOnce([]);
    mockPatientUpdate.mockResolvedValue({});

    const req = new NextRequest('http://localhost/api/admin/fix-incomplete-search-index');
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(2);
    expect(mockPatientUpdate).toHaveBeenCalledTimes(2);
  });
});
