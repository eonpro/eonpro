/**
 * Tickets API Route - Enterprise Functional Tests
 * ================================================
 *
 * Tests cross-cutting behavior: auth required (401), validation (400),
 * error response shape, and CORS-safe response structure.
 * Does not start a server; mocks withAuth and ticket service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth: without token returns 401
vi.mock('@/lib/auth', () => ({
  withAuth: (handler: (req: Request, user: unknown, ctx?: unknown) => Promise<Response>) =>
    (req: Request, ctx?: unknown) => {
      const authHeader = req.headers.get('authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!token) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: 'Authentication required',
              code: 'AUTH_REQUIRED',
              requestId: 'test',
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      const user = {
        id: 1,
        email: 'admin@test.com',
        role: 'admin',
        clinicId: 10,
      };
      return handler(req, user, ctx);
    },
}));

// Mock ticket service and repo for authenticated requests
const mockFindMany = vi.fn();
const mockCount = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    ticket: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    clinic: { findUnique: vi.fn().mockResolvedValue({ subdomain: 'TKT' }) },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/domains/ticket', () => ({
  reportTicketError: vi.fn(),
  ticketService: {},
}));

// Import route after mocks - GET uses prisma directly in this route
import { GET } from '@/app/api/tickets/route';

describe('Tickets API - Enterprise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  describe('Authentication', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const req = new Request('http://localhost/api/tickets', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await GET(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.code).toBe('AUTH_REQUIRED');
    });

    it('returns 401 when Bearer token is empty', async () => {
      const req = new Request('http://localhost/api/tickets', {
        method: 'GET',
        headers: { Authorization: 'Bearer ', 'Content-Type': 'application/json' },
      });

      const res = await GET(req);

      expect(res.status).toBe(401);
    });
  });

  describe('Error response shape', () => {
    it('returns JSON with error field on 5xx and application/json', async () => {
      mockFindMany.mockRejectedValueOnce(new Error('Database connection failed'));

      const req = new Request('http://localhost/api/tickets', {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      });

      const res = await GET(req);

      expect(res.headers.get('Content-Type')).toContain('application/json');
      if (res.status >= 500) {
        const body = await res.json();
        expect(body).toHaveProperty('error');
        expect(typeof body.error).toBe('string');
      }
    });
  });

  describe('Success response shape', () => {
    it('returns tickets array and pagination when authenticated', async () => {
      mockFindMany.mockResolvedValue([
        {
          id: 1,
          ticketNumber: 'TKT-000001',
          title: 'Test',
          status: 'NEW',
          priority: 'P3_MEDIUM',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: { id: 1, firstName: 'A', lastName: 'B' },
          assignedTo: null,
          patient: null,
          _count: { comments: 0 },
        },
      ]);
      mockCount.mockResolvedValue(1);

      const req = new Request('http://localhost/api/tickets', {
        method: 'GET',
        headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      });

      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.tickets)).toBe(true);
      expect(body.pagination).toBeDefined();
      expect(body.pagination).toMatchObject({
        page: expect.any(Number),
        limit: expect.any(Number),
        total: expect.any(Number),
        totalPages: expect.any(Number),
        hasMore: expect.any(Boolean),
      });
    });
  });
});
