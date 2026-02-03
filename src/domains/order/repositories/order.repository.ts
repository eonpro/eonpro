/**
 * Order Repository
 * =================
 *
 * Data access layer for order operations.
 * Handles database queries for orders, prescriptions (Rx), and order events.
 *
 * @module domains/order/repositories
 */

import { type Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';
import type {
  Order,
  Rx,
  OrderEvent,
  OrderWithPatient,
  OrderWithDetails,
  OrderSummary,
  CreateOrderInput,
  CreateRxInput,
  UpdateOrderInput,
  CreateOrderEventInput,
  OrderListFilters,
  OrderListResult,
} from '../types';

/**
 * PHI fields that need decryption for patient data
 */
const PATIENT_PHI_FIELDS = ['firstName', 'lastName', 'email', 'phone'] as const;

/**
 * Select fields for order with patient
 */
const ORDER_WITH_PATIENT_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  clinicId: true,
  messageId: true,
  referenceId: true,
  lifefileOrderId: true,
  status: true,
  patientId: true,
  providerId: true,
  shippingMethod: true,
  primaryMedName: true,
  primaryMedStrength: true,
  primaryMedForm: true,
  errorMessage: true,
  shippingStatus: true,
  trackingNumber: true,
  trackingUrl: true,
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
  rxs: {
    select: {
      id: true,
      medName: true,
      strength: true,
      form: true,
      quantity: true,
      refills: true,
      sig: true,
    },
  },
} as const;

/**
 * Select fields for order with full details
 */
const ORDER_WITH_DETAILS_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  clinicId: true,
  messageId: true,
  referenceId: true,
  lifefileOrderId: true,
  status: true,
  patientId: true,
  providerId: true,
  shippingMethod: true,
  primaryMedName: true,
  primaryMedStrength: true,
  primaryMedForm: true,
  errorMessage: true,
  requestJson: true,
  responseJson: true,
  lastWebhookAt: true,
  lastWebhookPayload: true,
  shippingStatus: true,
  trackingNumber: true,
  trackingUrl: true,
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  },
  provider: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      npi: true,
    },
  },
  rxs: true,
  events: {
    orderBy: { createdAt: 'desc' as const },
    take: 20,
  },
  clinic: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

// ============================================================================
// PHI Decryption Helpers
// ============================================================================

/**
 * Decrypt patient PHI fields within an order
 * Handles decryption failures gracefully by returning raw data
 */
function decryptOrderPatient<T extends { patient?: Record<string, unknown> | null }>(
  order: T
): T {
  if (!order.patient) {
    return order;
  }

  try {
    const decryptedPatient = decryptPatientPHI(
      order.patient as Record<string, unknown>,
      [...PATIENT_PHI_FIELDS]
    );
    return {
      ...order,
      patient: decryptedPatient,
    };
  } catch (error) {
    // If decryption fails, return order with original patient data
    // This handles cases where data might not be encrypted yet (migration period)
    logger.warn('Failed to decrypt patient PHI in order, returning raw data', {
      orderId: (order as Record<string, unknown>).id,
      patientId: order.patient?.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return order;
  }
}

/**
 * Decrypt patient and provider PHI fields within an order with details
 */
function decryptOrderDetails<T extends { patient?: Record<string, unknown> | null; provider?: Record<string, unknown> | null }>(
  order: T
): T {
  let result = order;

  // Decrypt patient PHI
  if (result.patient) {
    result = decryptOrderPatient(result);
  }

  // Decrypt provider PHI (firstName, lastName are also PHI)
  if (result.provider) {
    try {
      const decryptedProvider = decryptPatientPHI(
        result.provider as Record<string, unknown>,
        ['firstName', 'lastName']
      );
      result = {
        ...result,
        provider: decryptedProvider,
      };
    } catch (error) {
      logger.warn('Failed to decrypt provider PHI in order, returning raw data', {
        orderId: (order as Record<string, unknown>).id,
        providerId: result.provider?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return result;
}

export const orderRepository = {
  // ============================================================================
  // Order CRUD
  // ============================================================================

  /**
   * Find order by ID
   */
  async findById(id: number): Promise<Order | null> {
    const order = await prisma.order.findUnique({
      where: { id },
    });

    return order as Order | null;
  },

  /**
   * Find order by ID with patient info
   */
  async findByIdWithPatient(id: number): Promise<OrderWithPatient | null> {
    const order = await prisma.order.findUnique({
      where: { id },
      select: ORDER_WITH_PATIENT_SELECT,
    });

    if (!order) {
      return null;
    }

    // Decrypt patient PHI fields before returning
    return decryptOrderPatient(order) as OrderWithPatient;
  },

  /**
   * Find order by ID with full details
   */
  async findByIdWithDetails(id: number): Promise<OrderWithDetails | null> {
    const order = await prisma.order.findUnique({
      where: { id },
      select: ORDER_WITH_DETAILS_SELECT,
    });

    if (!order) {
      return null;
    }

    // Decrypt patient and provider PHI fields before returning
    return decryptOrderDetails(order) as OrderWithDetails;
  },

  /**
   * Find order by messageId (unique identifier)
   */
  async findByMessageId(messageId: string): Promise<Order | null> {
    const order = await prisma.order.findFirst({
      where: { messageId },
    });

    return order as Order | null;
  },

  /**
   * Find order by Lifefile order ID
   */
  async findByLifefileOrderId(lifefileOrderId: string): Promise<Order | null> {
    const order = await prisma.order.findFirst({
      where: { lifefileOrderId },
    });

    return order as Order | null;
  },

  /**
   * List orders with filtering
   */
  async list(filters: OrderListFilters): Promise<OrderListResult> {
    const where: Record<string, unknown> = {};

    // Clinic filter (required for non-super-admin)
    if (filters.clinicId !== undefined) {
      where.clinicId = filters.clinicId;
    }

    // Patient filter
    if (filters.patientId) {
      where.patientId = filters.patientId;
    }

    // Provider filter
    if (filters.providerId) {
      where.providerId = filters.providerId;
    }

    // Status filter
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        where.status = { in: filters.status };
      } else {
        where.status = filters.status;
      }
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        (where.createdAt as Record<string, unknown>).gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        (where.createdAt as Record<string, unknown>).lte = filters.dateTo;
      }
    }

    // Tracking number filter
    if (filters.hasTrackingNumber === true) {
      where.trackingNumber = { not: null };
    } else if (filters.hasTrackingNumber === false) {
      where.trackingNumber = null;
    }

    const limit = filters.limit ?? 100;

    logger.debug('[OrderRepository] list query', { filters, where });

    const orders = await prisma.order.findMany({
      where,
      select: ORDER_WITH_PATIENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Decrypt patient PHI fields before returning
    const decryptedOrders = orders.map((order: typeof orders[number]) => decryptOrderPatient(order));

    return {
      orders: decryptedOrders as OrderWithPatient[],
      count: decryptedOrders.length,
    };
  },

  /**
   * List recent orders (last N hours)
   */
  async listRecent(hours: number, clinicId?: number | null): Promise<OrderWithPatient[]> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);

    const where: Record<string, unknown> = {
      createdAt: { gte: cutoff },
    };

    if (clinicId !== undefined) {
      where.clinicId = clinicId;
    }

    const orders = await prisma.order.findMany({
      where,
      select: ORDER_WITH_PATIENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Decrypt patient PHI fields before returning
    return orders.map((order: typeof orders[number]) => decryptOrderPatient(order)) as OrderWithPatient[];
  },

  /**
   * Create a new order
   */
  async create(input: CreateOrderInput): Promise<Order> {
    const order = await prisma.order.create({
      data: {
        messageId: input.messageId,
        referenceId: input.referenceId,
        patientId: input.patientId,
        providerId: input.providerId,
        shippingMethod: input.shippingMethod,
        primaryMedName: input.primaryMedName ?? null,
        primaryMedStrength: input.primaryMedStrength ?? null,
        primaryMedForm: input.primaryMedForm ?? null,
        status: input.status ?? 'PENDING',
        requestJson: input.requestJson ?? null,
        clinicId: input.clinicId ?? null,
      },
    });

    logger.info('[OrderRepository] created order', {
      orderId: order.id,
      messageId: order.messageId,
      patientId: order.patientId,
      clinicId: order.clinicId,
    });

    return order as Order;
  },

  /**
   * Update an order
   */
  async update(id: number, input: UpdateOrderInput): Promise<Order> {
    const data: Record<string, unknown> = {};

    if (input.lifefileOrderId !== undefined) data.lifefileOrderId = input.lifefileOrderId;
    if (input.status !== undefined) data.status = input.status;
    if (input.errorMessage !== undefined) data.errorMessage = input.errorMessage;
    if (input.responseJson !== undefined) data.responseJson = input.responseJson;
    if (input.lastWebhookAt !== undefined) data.lastWebhookAt = input.lastWebhookAt;
    if (input.lastWebhookPayload !== undefined) data.lastWebhookPayload = input.lastWebhookPayload;
    if (input.shippingStatus !== undefined) data.shippingStatus = input.shippingStatus;
    if (input.trackingNumber !== undefined) data.trackingNumber = input.trackingNumber;
    if (input.trackingUrl !== undefined) data.trackingUrl = input.trackingUrl;

    const order = await prisma.order.update({
      where: { id },
      data,
    });

    logger.info('[OrderRepository] updated order', {
      orderId: id,
      updates: Object.keys(data),
    });

    return order as Order;
  },

  /**
   * Update order by messageId
   */
  async updateByMessageId(messageId: string, input: UpdateOrderInput): Promise<number> {
    const data: Record<string, unknown> = {};

    if (input.status !== undefined) data.status = input.status;
    if (input.errorMessage !== undefined) data.errorMessage = input.errorMessage;

    const result = await prisma.order.updateMany({
      where: { messageId },
      data,
    });

    logger.info('[OrderRepository] updated orders by messageId', {
      messageId,
      count: result.count,
    });

    return result.count;
  },

  // ============================================================================
  // Rx (Prescription) Operations
  // ============================================================================

  /**
   * Get Rx items for an order
   */
  async getRxsByOrderId(orderId: number): Promise<Rx[]> {
    const rxs = await prisma.rx.findMany({
      where: { orderId },
    });

    return rxs as Rx[];
  },

  /**
   * Create Rx items for an order
   */
  async createRxs(inputs: CreateRxInput[]): Promise<number> {
    const result = await prisma.rx.createMany({
      data: inputs.map((input) => ({
        orderId: input.orderId,
        medicationKey: input.medicationKey,
        medName: input.medName,
        strength: input.strength,
        form: input.form,
        quantity: input.quantity,
        refills: input.refills,
        sig: input.sig,
      })),
    });

    logger.info('[OrderRepository] created Rx items', {
      orderId: inputs[0]?.orderId,
      count: result.count,
    });

    return result.count;
  },

  // ============================================================================
  // Order Event Operations
  // ============================================================================

  /**
   * Get events for an order
   */
  async getEventsByOrderId(orderId: number, limit = 20): Promise<OrderEvent[]> {
    const events = await prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return events as OrderEvent[];
  },

  /**
   * Create an order event
   */
  async createEvent(input: CreateOrderEventInput): Promise<OrderEvent> {
    const event = await prisma.orderEvent.create({
      data: {
        orderId: input.orderId,
        lifefileOrderId: input.lifefileOrderId ?? null,
        eventType: input.eventType,
        payload: input.payload ?? null,
        note: input.note ?? null,
      },
    });

    logger.debug('[OrderRepository] created order event', {
      eventId: event.id,
      orderId: event.orderId,
      eventType: event.eventType,
    });

    return event as OrderEvent;
  },

  // ============================================================================
  // Aggregate Queries
  // ============================================================================

  /**
   * Count orders by status for a clinic
   */
  async countByStatus(clinicId?: number | null): Promise<Record<string, number>> {
    const where: Record<string, unknown> = {};
    if (clinicId !== undefined) {
      where.clinicId = clinicId;
    }

    const groups = await prisma.order.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const counts: Record<string, number> = {};
    for (const group of groups) {
      counts[group.status ?? 'unknown'] = group._count;
    }

    return counts;
  },

  /**
   * Get orders for a patient
   */
  async getPatientOrders(patientId: number, limit = 50): Promise<OrderWithDetails[]> {
    const orders = await prisma.order.findMany({
      where: { patientId },
      select: ORDER_WITH_DETAILS_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Decrypt patient and provider PHI fields before returning
    return orders.map((order: typeof orders[number]) => decryptOrderDetails(order)) as OrderWithDetails[];
  },

  /**
   * Get orders for a provider
   */
  async getProviderOrders(providerId: number, limit = 50): Promise<OrderWithPatient[]> {
    const orders = await prisma.order.findMany({
      where: { providerId },
      select: ORDER_WITH_PATIENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Decrypt patient PHI fields before returning
    return orders.map((order: typeof orders[number]) => decryptOrderPatient(order)) as OrderWithPatient[];
  },

  // ============================================================================
  // Transaction Support
  // ============================================================================

  /**
   * Create order with Rx items in a transaction
   */
  async createWithRxs(
    orderInput: CreateOrderInput,
    rxInputs: Omit<CreateRxInput, 'orderId'>[]
  ): Promise<OrderWithDetails> {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create order
      const order = await tx.order.create({
        data: {
          messageId: orderInput.messageId,
          referenceId: orderInput.referenceId,
          patientId: orderInput.patientId,
          providerId: orderInput.providerId,
          shippingMethod: orderInput.shippingMethod,
          primaryMedName: orderInput.primaryMedName ?? null,
          primaryMedStrength: orderInput.primaryMedStrength ?? null,
          primaryMedForm: orderInput.primaryMedForm ?? null,
          status: orderInput.status ?? 'PENDING',
          requestJson: orderInput.requestJson ?? null,
          clinicId: orderInput.clinicId ?? null,
        },
      });

      // Create Rx items
      if (rxInputs.length > 0) {
        await tx.rx.createMany({
          data: rxInputs.map((rx) => ({
            orderId: order.id,
            medicationKey: rx.medicationKey,
            medName: rx.medName,
            strength: rx.strength,
            form: rx.form,
            quantity: rx.quantity,
            refills: rx.refills,
            sig: rx.sig,
          })),
        });
      }

      // Create initial event
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          eventType: 'CREATED',
          note: `Order created with ${rxInputs.length} prescription(s)`,
        },
      });

      // Fetch complete order
      const completeOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: ORDER_WITH_DETAILS_SELECT,
      });

      logger.info('[OrderRepository] created order with Rx items', {
        orderId: order.id,
        rxCount: rxInputs.length,
        clinicId: order.clinicId,
      });

      if (!completeOrder) {
        throw new Error('Failed to fetch created order');
      }

      // Decrypt patient and provider PHI fields before returning
      return decryptOrderDetails(completeOrder) as OrderWithDetails;
    });
  },
};

export type OrderRepository = typeof orderRepository;
