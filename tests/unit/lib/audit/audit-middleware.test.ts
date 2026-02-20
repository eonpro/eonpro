import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/audit/hipaa-audit', () => ({
  auditPhiAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { auditPhiAccess } from '@/lib/audit/hipaa-audit';
import { withAutoAudit } from '@/lib/audit/audit-middleware';

const mockAuditPhiAccess = vi.mocked(auditPhiAccess);

const mockUser = {
  id: 1,
  email: 'user@test.com',
  role: 'provider',
  clinicId: 5,
};

describe('withAutoAudit', () => {
  beforeEach(() => {
    mockAuditPhiAccess.mockReset();
    mockAuditPhiAccess.mockResolvedValue(undefined);
  });

  it('calls auditPhiAccess for GET /api/patients/123 (PHI route)', async () => {
    const req = new NextRequest('http://localhost/api/patients/123', { method: 'GET' });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withAutoAudit(handler);

    await wrapped(req, mockUser);

    expect(mockAuditPhiAccess).toHaveBeenCalledTimes(1);
    expect(mockAuditPhiAccess).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        action: 'patient:view',
        clinicId: 5,
        userId: 1,
        patientId: 123,
        route: '/api/patients/123',
      })
    );
  });

  it("infers action 'view' for GET, 'create' for POST, 'edit' for PATCH/PUT, 'delete' for DELETE", async () => {
    const baseUrl = 'http://localhost/api/patients/456';
    const handler = vi.fn().mockResolvedValue(NextResponse.json({}));

    await withAutoAudit(handler)(new NextRequest(baseUrl, { method: 'GET' }), mockUser);
    expect(mockAuditPhiAccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'patient:view' }));
    mockAuditPhiAccess.mockClear();

    await withAutoAudit(handler)(new NextRequest(baseUrl, { method: 'POST' }), mockUser);
    expect(mockAuditPhiAccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'patient:create' }));
    mockAuditPhiAccess.mockClear();

    await withAutoAudit(handler)(new NextRequest(baseUrl, { method: 'PATCH' }), mockUser);
    expect(mockAuditPhiAccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'patient:edit' }));
    mockAuditPhiAccess.mockClear();

    await withAutoAudit(handler)(new NextRequest(baseUrl, { method: 'PUT' }), mockUser);
    expect(mockAuditPhiAccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'patient:edit' }));
    mockAuditPhiAccess.mockClear();

    await withAutoAudit(handler)(new NextRequest(baseUrl, { method: 'DELETE' }), mockUser);
    expect(mockAuditPhiAccess).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'patient:delete' }));
  });

  it('extracts resourceId from URL path (e.g., 123 from /api/patients/123)', async () => {
    const req = new NextRequest('http://localhost/api/patients/123', { method: 'GET' });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({}));
    const wrapped = withAutoAudit(handler);

    await wrapped(req, mockUser);

    const call = mockAuditPhiAccess.mock.calls[0];
    expect(call[1].patientId).toBe(123);
  });

  it('extracts resourceId from nested path (e.g., /api/patients/123/documents)', async () => {
    const req = new NextRequest('http://localhost/api/patients/123/documents', { method: 'GET' });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({}));
    const wrapped = withAutoAudit(handler);

    await wrapped(req, { ...mockUser, clinicId: 1 });

    expect(mockAuditPhiAccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ patientId: 123 })
    );
  });

  it('does NOT call auditPhiAccess for non-PHI routes (e.g., /api/settings)', async () => {
    const req = new NextRequest('http://localhost/api/settings', { method: 'GET' });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ settings: {} }));
    const wrapped = withAutoAudit(handler);

    await wrapped(req, mockUser);

    expect(mockAuditPhiAccess).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does NOT call auditPhiAccess for non-PHI route /api/providers', async () => {
    const req = new NextRequest('http://localhost/api/providers/1', { method: 'GET' });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({}));
    const wrapped = withAutoAudit(handler);

    await wrapped(req, mockUser);

    expect(mockAuditPhiAccess).not.toHaveBeenCalled();
  });

  it('calls the inner handler and returns its response', async () => {
    const req = new NextRequest('http://localhost/api/patients/123', { method: 'GET' });
    const response = NextResponse.json({ patient: { id: 123 } }, { status: 200 });
    const handler = vi.fn().mockResolvedValue(response);
    const wrapped = withAutoAudit(handler);

    const result = await wrapped(req, mockUser);

    expect(handler).toHaveBeenCalledWith(req, mockUser);
    expect(result).toBe(response);
    expect(result.status).toBe(200);
  });

  it('auditPhiAccess failure does not block the response', async () => {
    mockAuditPhiAccess.mockRejectedValueOnce(new Error('Audit DB unavailable'));
    const req = new NextRequest('http://localhost/api/patients/123', { method: 'GET' });
    const response = NextResponse.json({ ok: true });
    const handler = vi.fn().mockResolvedValue(response);
    const wrapped = withAutoAudit(handler);

    const result = await wrapped(req, mockUser);

    expect(result).toBe(response);
    expect(result.status).toBe(200);
  });
});
