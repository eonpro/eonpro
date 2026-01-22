/**
 * Order Service Tests
 * ===================
 *
 * Unit tests for the order service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderService } from '@/domains/order/services/order.service';
import { orderRepository } from '@/domains/order/repositories';
import {
  NotFoundError,
  ForbiddenError,
} from '@/domains/shared/errors';
import type { UserContext } from '@/domains/shared/types';

// Mock repository
vi.mock('@/domains/order/repositories', () => ({
  orderRepository: {
    findById: vi.fn(),
    findByIdWithPatient: vi.fn(),
    findByIdWithDetails: vi.fn(),
    findByMessageId: vi.fn(),
    findByLifefileOrderId: vi.fn(),
    list: vi.fn(),
    listRecent: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateByMessageId: vi.fn(),
    getRxsByOrderId: vi.fn(),
    createRxs: vi.fn(),
    getEventsByOrderId: vi.fn(),
    createEvent: vi.fn(),
    countByStatus: vi.fn(),
    getPatientOrders: vi.fn(),
    getProviderOrders: vi.fn(),
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

describe('OrderService', () => {
  const mockAdminContext: UserContext = {
    id: 1,
    email: 'admin@clinic.com',
    role: 'admin',
    clinicId: 1,
    patientId: null,
    providerId: null,
  };

  const mockSuperAdmin: UserContext = {
    id: 2,
    email: 'super@admin.com',
    role: 'super_admin',
    clinicId: null,
    patientId: null,
    providerId: null,
  };

  const mockPatientContext: UserContext = {
    id: 3,
    email: 'patient@test.com',
    role: 'patient',
    clinicId: 1,
    patientId: 100,
    providerId: null,
  };

  const mockOrder = {
    id: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    clinicId: 1,
    messageId: 'msg-123',
    referenceId: 'ref-123',
    lifefileOrderId: 'lf-456',
    status: 'PENDING',
    patientId: 100,
    providerId: 5,
    shippingMethod: 1,
    primaryMedName: 'Test Med',
    primaryMedStrength: '10mg',
    primaryMedForm: 'tablet',
    errorMessage: null,
    requestJson: null,
    responseJson: null,
    lastWebhookAt: null,
    lastWebhookPayload: null,
    shippingStatus: null,
    trackingNumber: null,
    trackingUrl: null,
    patient: { id: 100, firstName: 'John', lastName: 'Doe' },
    provider: { id: 5, firstName: 'Dr', lastName: 'Smith', npi: '1234567890' },
    rxs: [],
    events: [],
    clinic: { id: 1, name: 'Test Clinic' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getById', () => {
    it('should return order when found and user has access', async () => {
      vi.mocked(orderRepository.findByIdWithDetails).mockResolvedValue(mockOrder);

      const result = await orderService.getById(1, mockAdminContext);

      expect(result).toEqual(mockOrder);
    });

    it('should throw NotFoundError when order not found', async () => {
      vi.mocked(orderRepository.findByIdWithDetails).mockResolvedValue(null);

      await expect(orderService.getById(999, mockAdminContext)).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw ForbiddenError when user has no clinic', async () => {
      const noClinicUser: UserContext = {
        ...mockAdminContext,
        clinicId: undefined,
      };

      vi.mocked(orderRepository.findByIdWithDetails).mockResolvedValue(mockOrder);

      await expect(orderService.getById(1, noClinicUser)).rejects.toThrow(
        ForbiddenError
      );
    });

    it('should throw ForbiddenError when order is from different clinic', async () => {
      const differentClinicOrder = { ...mockOrder, clinicId: 999 };
      vi.mocked(orderRepository.findByIdWithDetails).mockResolvedValue(
        differentClinicOrder
      );

      await expect(orderService.getById(1, mockAdminContext)).rejects.toThrow(
        ForbiddenError
      );
    });

    it('should allow super_admin to access any order', async () => {
      const differentClinicOrder = { ...mockOrder, clinicId: 999 };
      vi.mocked(orderRepository.findByIdWithDetails).mockResolvedValue(
        differentClinicOrder
      );

      const result = await orderService.getById(1, mockSuperAdmin);

      expect(result).toEqual(differentClinicOrder);
    });

    it('should allow patient to access own order', async () => {
      vi.mocked(orderRepository.findByIdWithDetails).mockResolvedValue(mockOrder);

      const result = await orderService.getById(1, mockPatientContext);

      expect(result).toEqual(mockOrder);
    });

    it('should deny patient access to other patient order', async () => {
      const otherPatientOrder = { ...mockOrder, patientId: 999 };
      vi.mocked(orderRepository.findByIdWithDetails).mockResolvedValue(
        otherPatientOrder
      );

      await expect(orderService.getById(1, mockPatientContext)).rejects.toThrow(
        ForbiddenError
      );
    });
  });

  describe('listOrders', () => {
    it('should list orders for admin with clinic filter', async () => {
      vi.mocked(orderRepository.list).mockResolvedValue({
        orders: [mockOrder],
        count: 1,
      });

      const result = await orderService.listOrders(mockAdminContext);

      expect(result.count).toBe(1);
      expect(orderRepository.list).toHaveBeenCalledWith(
        expect.objectContaining({
          clinicId: 1,
        })
      );
    });

    it('should list all orders for super_admin', async () => {
      vi.mocked(orderRepository.list).mockResolvedValue({
        orders: [mockOrder],
        count: 1,
      });

      await orderService.listOrders(mockSuperAdmin);

      expect(orderRepository.list).toHaveBeenCalledWith(
        expect.not.objectContaining({
          clinicId: expect.anything(),
        })
      );
    });

    it('should throw ForbiddenError for user with no clinic', async () => {
      const noClinicUser: UserContext = {
        ...mockAdminContext,
        clinicId: undefined,
      };

      await expect(orderService.listOrders(noClinicUser)).rejects.toThrow(
        ForbiddenError
      );
    });

    it('should filter by patient for patient user', async () => {
      vi.mocked(orderRepository.list).mockResolvedValue({
        orders: [],
        count: 0,
      });

      await orderService.listOrders(mockPatientContext);

      expect(orderRepository.list).toHaveBeenCalledWith(
        expect.objectContaining({
          patientId: 100,
        })
      );
    });

    it('should apply recent filter', async () => {
      vi.mocked(orderRepository.list).mockResolvedValue({
        orders: [],
        count: 0,
      });

      await orderService.listOrders(mockAdminContext, { recent: '24h' });

      expect(orderRepository.list).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: expect.any(Date),
        })
      );
    });

    it('should apply status filter', async () => {
      vi.mocked(orderRepository.list).mockResolvedValue({
        orders: [],
        count: 0,
      });

      await orderService.listOrders(mockAdminContext, { status: 'PENDING' });

      expect(orderRepository.list).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PENDING',
        })
      );
    });
  });

  describe('updateStatus', () => {
    it('should update order status and create event', async () => {
      vi.mocked(orderRepository.findByIdWithDetails).mockResolvedValue(mockOrder);
      vi.mocked(orderRepository.update).mockResolvedValue({
        ...mockOrder,
        status: 'SHIPPED',
      });
      vi.mocked(orderRepository.createEvent).mockResolvedValue({
        id: 1,
        orderId: 1,
        eventType: 'STATUS_UPDATE',
        createdAt: new Date(),
        lifefileOrderId: null,
        payload: null,
        note: null,
      });

      const result = await orderService.updateStatus(1, 'SHIPPED', mockAdminContext);

      expect(result.status).toBe('SHIPPED');
      expect(orderRepository.update).toHaveBeenCalledWith(1, { status: 'SHIPPED' });
      expect(orderRepository.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 1,
          eventType: 'STATUS_UPDATE',
        })
      );
    });
  });

  describe('updateFromWebhook', () => {
    it('should update order from webhook and create event', async () => {
      vi.mocked(orderRepository.update).mockResolvedValue({
        ...mockOrder,
        status: 'SHIPPED',
        shippingStatus: 'in_transit',
      });
      vi.mocked(orderRepository.createEvent).mockResolvedValue({
        id: 1,
        orderId: 1,
        eventType: 'WEBHOOK_RECEIVED',
        createdAt: new Date(),
        lifefileOrderId: null,
        payload: null,
        note: null,
      });

      const result = await orderService.updateFromWebhook(1, {
        status: 'SHIPPED',
        shippingStatus: 'in_transit',
        webhookPayload: '{"status":"shipped"}',
      });

      expect(result.status).toBe('SHIPPED');
      expect(orderRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          status: 'SHIPPED',
          shippingStatus: 'in_transit',
          lastWebhookAt: expect.any(Date),
        })
      );
    });
  });

  describe('markError', () => {
    it('should mark order as error and create event', async () => {
      vi.mocked(orderRepository.update).mockResolvedValue({
        ...mockOrder,
        status: 'error',
        errorMessage: 'Test error',
      });
      vi.mocked(orderRepository.createEvent).mockResolvedValue({
        id: 1,
        orderId: 1,
        eventType: 'ERROR',
        createdAt: new Date(),
        lifefileOrderId: null,
        payload: null,
        note: 'Test error',
      });

      const result = await orderService.markError(1, 'Test error', mockAdminContext);

      expect(result.status).toBe('error');
      expect(orderRepository.update).toHaveBeenCalledWith(1, {
        status: 'error',
        errorMessage: 'Test error',
      });
    });
  });

  describe('getOrderEvents', () => {
    it('should return events for order with access check', async () => {
      const mockEvents = [
        { id: 1, orderId: 1, eventType: 'CREATED', createdAt: new Date() },
      ];

      vi.mocked(orderRepository.findByIdWithDetails).mockResolvedValue(mockOrder);
      vi.mocked(orderRepository.getEventsByOrderId).mockResolvedValue(mockEvents as any);

      const result = await orderService.getOrderEvents(1, mockAdminContext);

      expect(result).toEqual(mockEvents);
    });
  });

  describe('getPatientOrders', () => {
    it('should return orders for patient', async () => {
      vi.mocked(orderRepository.getPatientOrders).mockResolvedValue([mockOrder]);

      const result = await orderService.getPatientOrders(100, mockAdminContext);

      expect(result).toHaveLength(1);
    });

    it('should allow patient to get own orders', async () => {
      vi.mocked(orderRepository.getPatientOrders).mockResolvedValue([mockOrder]);

      const result = await orderService.getPatientOrders(100, mockPatientContext);

      expect(result).toHaveLength(1);
    });

    it('should deny patient access to other patient orders', async () => {
      await expect(
        orderService.getPatientOrders(999, mockPatientContext)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should filter by clinic for non-super-admin', async () => {
      const mixedClinicOrders = [
        mockOrder,
        { ...mockOrder, id: 2, clinicId: 999 },
      ];
      vi.mocked(orderRepository.getPatientOrders).mockResolvedValue(
        mixedClinicOrders
      );

      const result = await orderService.getPatientOrders(100, mockAdminContext);

      expect(result).toHaveLength(1);
      expect(result[0].clinicId).toBe(1);
    });
  });

  describe('getStatusCounts', () => {
    it('should return status counts for clinic', async () => {
      vi.mocked(orderRepository.countByStatus).mockResolvedValue({
        PENDING: 5,
        SHIPPED: 10,
      });

      const result = await orderService.getStatusCounts(mockAdminContext);

      expect(result).toEqual({ PENDING: 5, SHIPPED: 10 });
      expect(orderRepository.countByStatus).toHaveBeenCalledWith(1);
    });

    it('should return all status counts for super_admin', async () => {
      vi.mocked(orderRepository.countByStatus).mockResolvedValue({
        PENDING: 5,
        SHIPPED: 10,
      });

      await orderService.getStatusCounts(mockSuperAdmin);

      expect(orderRepository.countByStatus).toHaveBeenCalledWith(undefined);
    });
  });
});
