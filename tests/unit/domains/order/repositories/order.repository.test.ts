/**
 * Order Repository Tests
 * ======================
 *
 * Unit tests for the order repository.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderRepository } from '@/domains/order/repositories/order.repository';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    rx: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    orderEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((fn) =>
      fn({
        order: {
          create: vi.fn(),
          findUnique: vi.fn(),
        },
        rx: {
          createMany: vi.fn(),
        },
        orderEvent: {
          create: vi.fn(),
        },
      })
    ),
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { prisma } from '@/lib/db';

describe('OrderRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findById', () => {
    it('should return order when found', async () => {
      const mockOrder = {
        id: 1,
        messageId: 'msg-123',
        status: 'PENDING',
        clinicId: 1,
      };

      vi.mocked(prisma.order.findUnique).mockResolvedValue(mockOrder as any);

      const result = await orderRepository.findById(1);

      expect(result).toEqual(mockOrder);
      expect(prisma.order.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should return null when not found', async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

      const result = await orderRepository.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findByMessageId', () => {
    it('should return order when messageId found', async () => {
      const mockOrder = { id: 1, messageId: 'msg-123' };

      vi.mocked(prisma.order.findFirst).mockResolvedValue(mockOrder as any);

      const result = await orderRepository.findByMessageId('msg-123');

      expect(result).toEqual(mockOrder);
      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: { messageId: 'msg-123' },
      });
    });
  });

  describe('findByLifefileOrderId', () => {
    it('should return order when lifefileOrderId found', async () => {
      const mockOrder = { id: 1, lifefileOrderId: 'lf-456' };

      vi.mocked(prisma.order.findFirst).mockResolvedValue(mockOrder as any);

      const result = await orderRepository.findByLifefileOrderId('lf-456');

      expect(result).toEqual(mockOrder);
      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: { lifefileOrderId: 'lf-456' },
      });
    });
  });

  describe('list', () => {
    it('should apply clinic filter', async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await orderRepository.list({ clinicId: 5 });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clinicId: 5 },
        })
      );
    });

    it('should apply patient filter', async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await orderRepository.list({ patientId: 10 });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ patientId: 10 }),
        })
      );
    });

    it('should apply status filter as array', async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await orderRepository.list({ status: ['PENDING', 'SHIPPED'] });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['PENDING', 'SHIPPED'] },
          }),
        })
      );
    });

    it('should apply date range filter', async () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await orderRepository.list({ dateFrom, dateTo });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: dateFrom, lte: dateTo },
          }),
        })
      );
    });

    it('should apply limit', async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await orderRepository.list({ limit: 50 });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it('should default limit to 100', async () => {
      vi.mocked(prisma.order.findMany).mockResolvedValue([]);

      await orderRepository.list({});

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });
  });

  describe('create', () => {
    it('should create order with required fields', async () => {
      const mockOrder = { id: 1, messageId: 'msg-123', status: 'PENDING' };
      vi.mocked(prisma.order.create).mockResolvedValue(mockOrder as any);

      const input = {
        messageId: 'msg-123',
        referenceId: 'ref-123',
        patientId: 10,
        providerId: 5,
        shippingMethod: 1,
      };

      const result = await orderRepository.create(input);

      expect(result).toEqual(mockOrder);
      expect(prisma.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: 'msg-123',
          status: 'PENDING',
        }),
      });
    });
  });

  describe('update', () => {
    it('should update specified fields only', async () => {
      const mockOrder = { id: 1, status: 'SHIPPED' };
      vi.mocked(prisma.order.update).mockResolvedValue(mockOrder as any);

      const result = await orderRepository.update(1, {
        status: 'SHIPPED',
        trackingNumber: 'TRACK123',
      });

      expect(result).toEqual(mockOrder);
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          status: 'SHIPPED',
          trackingNumber: 'TRACK123',
        },
      });
    });
  });

  describe('getRxsByOrderId', () => {
    it('should return Rx items for order', async () => {
      const mockRxs = [
        { id: 1, orderId: 1, medName: 'Med A' },
        { id: 2, orderId: 1, medName: 'Med B' },
      ];

      vi.mocked(prisma.rx.findMany).mockResolvedValue(mockRxs as any);

      const result = await orderRepository.getRxsByOrderId(1);

      expect(result).toEqual(mockRxs);
      expect(prisma.rx.findMany).toHaveBeenCalledWith({
        where: { orderId: 1 },
      });
    });
  });

  describe('createRxs', () => {
    it('should create multiple Rx items', async () => {
      vi.mocked(prisma.rx.createMany).mockResolvedValue({ count: 2 });

      const inputs = [
        {
          orderId: 1,
          medicationKey: 'med-a',
          medName: 'Med A',
          strength: '10mg',
          form: 'tablet',
          quantity: '30',
          refills: '2',
          sig: 'Take once daily',
        },
        {
          orderId: 1,
          medicationKey: 'med-b',
          medName: 'Med B',
          strength: '20mg',
          form: 'capsule',
          quantity: '60',
          refills: '0',
          sig: 'Take twice daily',
        },
      ];

      const result = await orderRepository.createRxs(inputs);

      expect(result).toBe(2);
      expect(prisma.rx.createMany).toHaveBeenCalledWith({
        data: inputs,
      });
    });
  });

  describe('createEvent', () => {
    it('should create order event', async () => {
      const mockEvent = {
        id: 1,
        orderId: 1,
        eventType: 'STATUS_UPDATE',
        note: 'Status changed',
      };

      vi.mocked(prisma.orderEvent.create).mockResolvedValue(mockEvent as any);

      const result = await orderRepository.createEvent({
        orderId: 1,
        eventType: 'STATUS_UPDATE',
        note: 'Status changed',
      });

      expect(result).toEqual(mockEvent);
    });
  });

  describe('countByStatus', () => {
    it('should return counts grouped by status', async () => {
      vi.mocked(prisma.order.groupBy).mockResolvedValue([
        { status: 'PENDING', _count: 5 },
        { status: 'SHIPPED', _count: 10 },
      ] as any);

      const result = await orderRepository.countByStatus(1);

      expect(result).toEqual({
        PENDING: 5,
        SHIPPED: 10,
      });
    });
  });
});
