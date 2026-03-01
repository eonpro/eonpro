/**
 * Order Service
 * =============
 *
 * Business logic layer for order operations.
 * Handles validation, authorization, and orchestrates repository calls.
 *
 * Note: Prescription creation logic (Lifefile API, PDF generation) is complex
 * and remains in the route handler. This service handles core order operations.
 *
 * @module domains/order/services
 */

import { logger } from '@/lib/logger';
import { orderRepository } from '../repositories';
import type {
  Order,
  OrderWithPatient,
  OrderWithDetails,
  CreateOrderInput,
  UpdateOrderInput,
  OrderListFilters,
  OrderListResult,
  OrderEvent,
  CreateOrderEventInput,
  Rx,
} from '../types';
import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors';
import type { UserContext } from '../../shared/types';

/**
 * Order service result types
 */
export interface GetOrderResult {
  order: OrderWithDetails;
}

export interface ListOrdersResult extends OrderListResult {}

export const orderService = {
  // ============================================================================
  // Order Retrieval
  // ============================================================================

  /**
   * Get order by ID with access control
   *
   * @throws NotFoundError if order doesn't exist
   * @throws ForbiddenError if user doesn't have access
   */
  async getById(id: number, userContext: UserContext): Promise<OrderWithDetails> {
    const order = await orderRepository.findByIdWithDetails(id);

    if (!order) {
      throw new NotFoundError('Order', id);
    }

    // Check access
    if (userContext.role !== 'super_admin') {
      // Must have clinic context
      if (!userContext.clinicId) {
        throw new ForbiddenError('No clinic associated with your account');
      }

      // Order must belong to user's clinic
      if (order.clinicId !== userContext.clinicId) {
        logger.security('[OrderService] Cross-clinic access attempt', {
          userId: userContext.id,
          userClinicId: userContext.clinicId,
          orderClinicId: order.clinicId,
          orderId: id,
        });
        throw new ForbiddenError('You do not have access to this order');
      }

      // Patient users can only see their own orders
      if (userContext.role === 'patient') {
        if (userContext.patientId !== order.patientId) {
          throw new ForbiddenError('You do not have access to this order');
        }
      }
    }

    return order;
  },

  /**
   * Get order by Lifefile order ID
   */
  async getByLifefileId(lifefileOrderId: string): Promise<Order | null> {
    return orderRepository.findByLifefileOrderId(lifefileOrderId);
  },

  /**
   * Get order by message ID
   */
  async getByMessageId(messageId: string): Promise<Order | null> {
    return orderRepository.findByMessageId(messageId);
  },

  // ============================================================================
  // Order Listing
  // ============================================================================

  /**
   * List orders based on user context
   *
   * - Super admin sees all orders
   * - Other users see only their clinic's orders
   * - Patient sees only their own orders
   */
  async listOrders(
    userContext: UserContext,
    options: {
      limit?: number;
      offset?: number;
      recent?: string; // e.g., '24h', '7d'
      status?: string | string[];
      patientId?: number;
      providerId?: number;
      hasTrackingNumber?: boolean;
      awaitingFulfillment?: boolean;
      search?: string;
    } = {}
  ): Promise<ListOrdersResult> {
    logger.info('[OrderService] listOrders', {
      userId: userContext.id,
      role: userContext.role,
      clinicId: userContext.clinicId,
      options: { ...options, search: options.search ? '[PRESENT]' : undefined },
    });

    // Build filters
    const filters: OrderListFilters = {
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
    };

    // Clinic filter
    if (userContext.role !== 'super_admin') {
      if (!userContext.clinicId) {
        throw new ForbiddenError('No clinic associated with your account');
      }
      filters.clinicId = userContext.clinicId;
    }

    // Patient can only see own orders
    if (userContext.role === 'patient') {
      if (!userContext.patientId) {
        return { orders: [], count: 0, total: 0, hasMore: false };
      }
      filters.patientId = userContext.patientId;
    } else if (options.patientId) {
      filters.patientId = options.patientId;
    }

    // Provider filter
    if (options.providerId) {
      filters.providerId = options.providerId;
    }

    // Status filter
    if (options.status) {
      filters.status = options.status;
    }

    // Recent filter (e.g., '24h', '7d')
    if (options.recent) {
      const match = options.recent.match(/^(\d+)([hd])$/);
      if (match) {
        const value = parseInt(match[1], 10);
        const unit = match[2];
        const now = new Date();

        if (unit === 'h') {
          filters.dateFrom = new Date(now.getTime() - value * 60 * 60 * 1000);
        } else if (unit === 'd') {
          filters.dateFrom = new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
        }
      }
    }

    // Tracking number filter
    if (options.hasTrackingNumber !== undefined) {
      filters.hasTrackingNumber = options.hasTrackingNumber;
    }

    // Awaiting fulfillment filter
    if (options.awaitingFulfillment) {
      filters.awaitingFulfillment = true;
    }

    // Search filter (patient name via searchIndex, medication name)
    if (options.search && options.search.trim().length > 0) {
      filters.search = options.search.trim();
    }

    const result = await orderRepository.list(filters);

    logger.info('[OrderService] listOrders result', {
      count: result.count,
      userId: userContext.id,
    });

    return result;
  },

  // ============================================================================
  // Order Status Updates
  // ============================================================================

  /**
   * Update order status
   */
  async updateStatus(
    id: number,
    status: string,
    userContext: UserContext,
    note?: string
  ): Promise<Order> {
    // Verify access
    await this.getById(id, userContext);

    // Update order
    const order = await orderRepository.update(id, { status });

    // Create event
    await orderRepository.createEvent({
      orderId: id,
      eventType: 'STATUS_UPDATE',
      payload: { status, previousStatus: order.status },
      note: note ?? `Status updated to ${status}`,
    });

    logger.info('[OrderService] updated order status', {
      orderId: id,
      status,
      updatedBy: userContext.id,
    });

    return order;
  },

  /**
   * Update order from webhook
   * Used by Lifefile webhook handler
   */
  async updateFromWebhook(
    id: number,
    updates: {
      status?: string;
      shippingStatus?: string;
      trackingNumber?: string;
      trackingUrl?: string;
      webhookPayload: string;
    }
  ): Promise<Order> {
    const order = await orderRepository.update(id, {
      status: updates.status,
      shippingStatus: updates.shippingStatus,
      trackingNumber: updates.trackingNumber,
      trackingUrl: updates.trackingUrl,
      lastWebhookAt: new Date(),
      lastWebhookPayload: updates.webhookPayload,
    });

    // Create event
    await orderRepository.createEvent({
      orderId: id,
      lifefileOrderId: order.lifefileOrderId,
      eventType: 'WEBHOOK_RECEIVED',
      payload: JSON.parse(updates.webhookPayload),
      note: updates.status ? `Status: ${updates.status}` : undefined,
    });

    logger.info('[OrderService] updated order from webhook', {
      orderId: id,
      status: updates.status,
      shippingStatus: updates.shippingStatus,
    });

    return order;
  },

  /**
   * Mark order as error
   */
  async markError(id: number, errorMessage: string, userContext?: UserContext): Promise<Order> {
    const order = await orderRepository.update(id, {
      status: 'error',
      errorMessage,
    });

    await orderRepository.createEvent({
      orderId: id,
      eventType: 'ERROR',
      payload: { errorMessage },
      note: errorMessage,
    });

    logger.warn('[OrderService] marked order as error', {
      orderId: id,
      errorMessage,
      markedBy: userContext?.email ?? 'system',
    });

    return order;
  },

  // ============================================================================
  // Order Events
  // ============================================================================

  /**
   * Get events for an order
   */
  async getOrderEvents(orderId: number, userContext: UserContext): Promise<OrderEvent[]> {
    // Verify access
    await this.getById(orderId, userContext);

    return orderRepository.getEventsByOrderId(orderId);
  },

  /**
   * Add event to order
   */
  async addOrderEvent(
    orderId: number,
    event: Omit<CreateOrderEventInput, 'orderId'>,
    userContext: UserContext
  ): Promise<OrderEvent> {
    // Verify access
    await this.getById(orderId, userContext);

    return orderRepository.createEvent({
      ...event,
      orderId,
    });
  },

  // ============================================================================
  // Rx (Prescription) Operations
  // ============================================================================

  /**
   * Get prescriptions for an order
   */
  async getOrderRxs(orderId: number, userContext: UserContext): Promise<Rx[]> {
    // Verify access
    await this.getById(orderId, userContext);

    return orderRepository.getRxsByOrderId(orderId);
  },

  // ============================================================================
  // Patient/Provider Specific
  // ============================================================================

  /**
   * Get orders for a specific patient
   */
  async getPatientOrders(patientId: number, userContext: UserContext): Promise<OrderWithDetails[]> {
    // Patient can only see own orders
    if (userContext.role === 'patient' && userContext.patientId !== patientId) {
      throw new ForbiddenError('You can only view your own orders');
    }

    // Non-super-admin must have clinic
    if (userContext.role !== 'super_admin' && !userContext.clinicId) {
      throw new ForbiddenError('No clinic associated with your account');
    }

    const orders = await orderRepository.getPatientOrders(patientId);

    // Filter by clinic for non-super-admin
    if (userContext.role !== 'super_admin') {
      return orders.filter((o) => o.clinicId === userContext.clinicId);
    }

    return orders;
  },

  /**
   * Get orders for a specific provider
   */
  async getProviderOrders(
    providerId: number,
    userContext: UserContext
  ): Promise<OrderWithPatient[]> {
    // Non-super-admin must have clinic
    if (userContext.role !== 'super_admin' && !userContext.clinicId) {
      throw new ForbiddenError('No clinic associated with your account');
    }

    const orders = await orderRepository.getProviderOrders(providerId);

    // Filter by clinic for non-super-admin
    if (userContext.role !== 'super_admin') {
      return orders.filter((o) => o.clinicId === userContext.clinicId);
    }

    return orders;
  },

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get order count by status
   */
  async getStatusCounts(userContext: UserContext): Promise<Record<string, number>> {
    const clinicId = userContext.role === 'super_admin' ? undefined : userContext.clinicId;

    if (!clinicId && userContext.role !== 'super_admin') {
      return {};
    }

    return orderRepository.countByStatus(clinicId);
  },
};

export type OrderService = typeof orderService;
