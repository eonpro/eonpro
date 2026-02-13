/**
 * Ticket Service Unit Tests
 * =========================
 *
 * Tests for ticket service business logic: create, getById, list, update,
 * changeStatus. Ensures validation, clinic isolation, and status transitions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '@/domains/shared/errors';
import type { UserContext } from '@/domains/shared/types';
import type { CreateTicketInput, TicketWithRelations, TicketListItem, TicketListResult } from '@/domains/ticket';

// Hoist mock refs so vi.mock factory can use them
const mocks = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByTicketNumber: vi.fn(),
  mockFindMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateStatus: vi.fn(),
  mockLogActivity: vi.fn(),
  mockAddWatcher: vi.fn(),
  mockTransaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      ticketStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    })
  ),
  mockUserFindFirst: vi.fn(),
  mockTeamFindFirst: vi.fn(),
}));

vi.mock('@/domains/ticket/repositories/ticket.repository', () => ({
  ticketRepository: {
    create: (...args: unknown[]) => mocks.mockCreate(...args),
    findById: (...args: unknown[]) => mocks.mockFindById(...args),
    findByTicketNumber: (...args: unknown[]) => mocks.mockFindByTicketNumber(...args),
    findMany: (...args: unknown[]) => mocks.mockFindMany(...args),
    update: (...args: unknown[]) => mocks.mockUpdate(...args),
    updateStatus: (...args: unknown[]) => mocks.mockUpdateStatus(...args),
    logActivity: (...args: unknown[]) => mocks.mockLogActivity(...args),
    addWatcher: (...args: unknown[]) => mocks.mockAddWatcher(...args),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mocks.mockTransaction(...args),
    user: { findFirst: mocks.mockUserFindFirst },
    ticketTeam: { findFirst: mocks.mockTeamFindFirst },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks (use service module directly to avoid pulling Sentry/observability)
import { ticketService } from '@/domains/ticket/services';

describe('TicketService', () => {
  const adminContext: UserContext = {
    id: 1,
    email: 'admin@clinic.com',
    role: 'admin',
    clinicId: 10,
  };

  const superAdminContext: UserContext = {
    id: 2,
    email: 'super@platform.com',
    role: 'super_admin',
    clinicId: null,
  };

  const createInput: CreateTicketInput = {
    clinicId: 10,
    title: 'Test ticket',
    description: 'Test description',
    category: 'GENERAL',
    priority: 'P3_MEDIUM',
  };

  const mockTicket: TicketWithRelations = {
    id: 1,
    clinicId: 10,
    ticketNumber: 'TKT-000001',
    title: 'Test ticket',
    description: 'Test description',
    status: 'NEW',
    priority: 'P3_MEDIUM',
    category: 'GENERAL',
    source: 'INTERNAL',
    createdById: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActivityAt: new Date(),
    createdBy: {
      id: 1,
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@clinic.com',
    } as TicketWithRelations['createdBy'],
  } as TicketWithRelations;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockUserFindFirst.mockResolvedValue({ id: 1 });
    mocks.mockTeamFindFirst.mockResolvedValue(null);
    mocks.mockLogActivity.mockResolvedValue(undefined);
    mocks.mockAddWatcher.mockResolvedValue(undefined);
  });

  describe('create', () => {
    it('throws ValidationError when title is empty', async () => {
      await expect(
        ticketService.create(
          { ...createInput, title: '' },
          adminContext
        )
      ).rejects.toThrow(ValidationError);
      expect(mocks.mockCreate).not.toHaveBeenCalled();
    });

    it('throws ValidationError when description is empty', async () => {
      await expect(
        ticketService.create(
          { ...createInput, description: '' },
          adminContext
        )
      ).rejects.toThrow(ValidationError);
      expect(mocks.mockCreate).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when admin creates ticket for another clinic', async () => {
      await expect(
        ticketService.create(
          { ...createInput, clinicId: 99 },
          adminContext
        )
      ).rejects.toThrow(ForbiddenError);
      expect(mocks.mockCreate).not.toHaveBeenCalled();
    });

    it('creates ticket and returns with relations when input is valid', async () => {
      mocks.mockCreate.mockResolvedValue({ ...mockTicket });
      mocks.mockFindById.mockResolvedValue(mockTicket);
      mocks.mockTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn({}));

      const result = await ticketService.create(createInput, adminContext);

      expect(mocks.mockCreate).toHaveBeenCalled();
      expect(mocks.mockLogActivity).toHaveBeenCalled();
      expect(mocks.mockAddWatcher).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.title).toBe(createInput.title);
      expect(result.ticketNumber).toBeDefined();
    });
  });

  describe('getById', () => {
    it('throws NotFoundError when ticket does not exist', async () => {
      mocks.mockFindById.mockResolvedValue(null);

      await expect(
        ticketService.getById(999, adminContext)
      ).rejects.toThrow(NotFoundError);

      expect(mocks.mockFindById).toHaveBeenCalledWith(999, adminContext);
    });

    it('returns ticket when found', async () => {
      mocks.mockFindById.mockResolvedValue(mockTicket);

      const result = await ticketService.getById(1, adminContext);

      expect(result).toEqual(mockTicket);
      expect(mocks.mockFindById).toHaveBeenCalledWith(1, adminContext);
    });
  });

  describe('getByTicketNumber', () => {
    it('throws NotFoundError when ticket number not found', async () => {
      mocks.mockFindByTicketNumber.mockResolvedValue(null);

      await expect(
        ticketService.getByTicketNumber('TKT-999999', adminContext)
      ).rejects.toThrow(NotFoundError);

      expect(mocks.mockFindByTicketNumber).toHaveBeenCalledWith('TKT-999999', adminContext);
    });

    it('returns ticket when found by ticket number', async () => {
      mocks.mockFindByTicketNumber.mockResolvedValue(mockTicket);

      const result = await ticketService.getByTicketNumber('TKT-000001', adminContext);

      expect(result).toEqual(mockTicket);
    });
  });

  describe('list', () => {
    it('delegates to repository and returns result', async () => {
      const listResult: TicketListResult = {
        tickets: [mockTicket as unknown as TicketListItem],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasMore: false,
        },
      };
      mocks.mockFindMany.mockResolvedValue(listResult);

      const result = await ticketService.list(
        { status: 'NEW' },
        { page: 1, limit: 20 },
        adminContext
      );

      expect(result).toEqual(listResult);
      expect(mocks.mockFindMany).toHaveBeenCalledWith(
        { status: 'NEW' },
        { page: 1, limit: 20 },
        adminContext
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundError when ticket does not exist', async () => {
      mocks.mockFindById.mockResolvedValue(null);

      await expect(
        ticketService.update(999, { title: 'Updated' }, adminContext)
      ).rejects.toThrow(NotFoundError);

      expect(mocks.mockUpdate).not.toHaveBeenCalled();
    });

    it('throws ValidationError for invalid status transition', async () => {
      mocks.mockFindById.mockResolvedValue({ ...mockTicket, status: 'RESOLVED' });

      await expect(
        ticketService.update(1, { status: 'OPEN' }, adminContext)
      ).rejects.toThrow(ValidationError);

      expect(mocks.mockUpdate).not.toHaveBeenCalled();
    });

    it('updates ticket and returns with relations', async () => {
      mocks.mockFindById
        .mockResolvedValueOnce(mockTicket)
        .mockResolvedValueOnce({ ...mockTicket, title: 'Updated title' });
      mocks.mockUpdate.mockResolvedValue(undefined);
      mocks.mockTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn({}));

      const result = await ticketService.update(
        1,
        { title: 'Updated title' },
        adminContext
      );

      expect(mocks.mockUpdate).toHaveBeenCalledWith(1, { title: 'Updated title' }, adminContext, expect.anything());
      expect(result.title).toBe('Updated title');
    });
  });

  describe('assign', () => {
    it('does not create TicketAssignment when assignedToId is null (unassign)', async () => {
      const mockTx = {
        ticketStatusHistory: { create: vi.fn().mockResolvedValue({}) },
        ticketAssignment: { create: vi.fn() },
      };
      mocks.mockTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx));
      mocks.mockFindById.mockResolvedValue(mockTicket);
      mocks.mockUpdate.mockResolvedValue(undefined);

      await ticketService.assign(1, { assignedToId: null }, adminContext);

      expect(mockTx.ticketAssignment.create).not.toHaveBeenCalled();
    });
  });

  describe('changeStatus', () => {
    it('throws NotFoundError when ticket does not exist', async () => {
      mocks.mockFindById.mockResolvedValue(null);

      await expect(
        ticketService.changeStatus(999, 'OPEN', 'reason', adminContext)
      ).rejects.toThrow(NotFoundError);

      expect(mocks.mockUpdateStatus).not.toHaveBeenCalled();
    });

    it('throws ValidationError for invalid status transition', async () => {
      mocks.mockFindById.mockResolvedValue({ ...mockTicket, status: 'NEW' });

      await expect(
        ticketService.changeStatus(1, 'RESOLVED', undefined, adminContext)
      ).rejects.toThrow(ValidationError);

      expect(mocks.mockUpdateStatus).not.toHaveBeenCalled();
    });

    it('changes status and returns updated ticket', async () => {
      mocks.mockFindById
        .mockResolvedValueOnce({ ...mockTicket, status: 'OPEN' })
        .mockResolvedValueOnce({ ...mockTicket, status: 'RESOLVED' });
      mocks.mockUpdateStatus.mockResolvedValue(undefined);
      mocks.mockTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({ ticketStatusHistory: { create: vi.fn().mockResolvedValue({}) } })
      );

      const result = await ticketService.changeStatus(
        1,
        'RESOLVED',
        'Fixed',
        adminContext
      );

      expect(mocks.mockUpdateStatus).toHaveBeenCalled();
      expect(mocks.mockLogActivity).toHaveBeenCalled();
      expect(result.status).toBe('RESOLVED');
    });
  });
});
