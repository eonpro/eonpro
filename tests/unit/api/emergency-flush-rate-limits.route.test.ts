import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  emergencyFlushAllAuthRateLimitsMock,
  loggerSecurityMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  emergencyFlushAllAuthRateLimitsMock: vi.fn(),
  loggerSecurityMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@/lib/auth/middleware', () => ({
  withSuperAdminAuth: (handler: unknown) => handler,
}));

vi.mock('@/lib/security/enterprise-rate-limiter', () => ({
  emergencyFlushAllAuthRateLimits: emergencyFlushAllAuthRateLimitsMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    security: loggerSecurityMock,
    error: loggerErrorMock,
  },
}));

import { POST } from '@/app/api/admin/emergency-flush-rate-limits/route';

describe('POST /api/admin/emergency-flush-rate-limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success payload with cleared count', async () => {
    emergencyFlushAllAuthRateLimitsMock.mockResolvedValue({ cleared: 42 });

    const req = {
      headers: new Headers({ 'x-forwarded-for': '1.2.3.4' }),
    } as Request;
    const user = { id: 999 } as never;

    const response = await POST(req as never, user);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.cleared).toBe(42);
    expect(body.message).toContain('Flushed 42 rate-limit entries');
    expect(body.timestamp).toBeTypeOf('string');
    expect(loggerSecurityMock).toHaveBeenCalledWith(
      '[EmergencyFlush] Rate limits flushed',
      expect.objectContaining({
        cleared: 42,
        userId: 999,
        ip: '1.2.3.4',
      }),
    );
  });

  it('returns 500 when emergency flush fails', async () => {
    emergencyFlushAllAuthRateLimitsMock.mockRejectedValue(new Error('redis down'));

    const req = { headers: new Headers() } as Request;
    const user = { id: 999 } as never;

    const response = await POST(req as never, user);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Flush failed' });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      '[EmergencyFlush] Failed',
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});
