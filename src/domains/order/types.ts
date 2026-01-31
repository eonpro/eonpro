/**
 * Order Domain Types
 * ==================
 *
 * Type definitions for the order domain including Order, Rx, and OrderEvent.
 *
 * @module domains/order/types
 */

/**
 * Order status values
 */
export type OrderStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'ERROR'
  | 'sent'
  | 'error';

/**
 * Shipping status values
 */
export type ShippingStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'returned';

/**
 * Order entity from database
 */
export interface Order {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  clinicId: number | null;
  messageId: string;
  referenceId: string;
  lifefileOrderId: string | null;
  status: string | null;
  patientId: number;
  providerId: number;
  shippingMethod: number;
  primaryMedName: string | null;
  primaryMedStrength: string | null;
  primaryMedForm: string | null;
  errorMessage: string | null;
  requestJson: string | null;
  responseJson: string | null;
  lastWebhookAt: Date | null;
  lastWebhookPayload: string | null;
  shippingStatus: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

/**
 * Rx (prescription item) entity
 */
export interface Rx {
  id: number;
  orderId: number;
  medicationKey: string;
  medName: string;
  strength: string;
  form: string;
  quantity: string;
  refills: string;
  sig: string;
}

/**
 * Order event entity (status changes, webhook events)
 */
export interface OrderEvent {
  id: number;
  createdAt: Date;
  orderId: number;
  lifefileOrderId: string | null;
  eventType: string;
  payload: unknown;
  note: string | null;
}

/**
 * Order with related patient info
 */
export interface OrderWithPatient extends Order {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
  };
}

/**
 * Order with all related data
 */
export interface OrderWithDetails extends Order {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
  };
  provider: {
    id: number;
    firstName: string;
    lastName: string;
    npi: string;
  };
  rxs: Rx[];
  events: OrderEvent[];
  clinic?: {
    id: number;
    name: string;
  } | null;
}

/**
 * Order summary for lists
 */
export interface OrderSummary {
  id: number;
  createdAt: Date;
  status: string | null;
  patientId: number;
  patientName: string;
  primaryMedName: string | null;
  shippingStatus: string | null;
  trackingNumber: string | null;
  clinicId: number | null;
}

/**
 * Create order input
 */
export interface CreateOrderInput {
  messageId: string;
  referenceId: string;
  patientId: number;
  providerId: number;
  shippingMethod: number;
  primaryMedName?: string;
  primaryMedStrength?: string;
  primaryMedForm?: string;
  status?: string;
  requestJson?: string;
  clinicId?: number | null;
}

/**
 * Create Rx input
 */
export interface CreateRxInput {
  orderId: number;
  medicationKey: string;
  medName: string;
  strength: string;
  form: string;
  quantity: string;
  refills: string;
  sig: string;
}

/**
 * Update order input
 */
export interface UpdateOrderInput {
  lifefileOrderId?: string | null;
  status?: string | null;
  errorMessage?: string | null;
  responseJson?: string | null;
  lastWebhookAt?: Date | null;
  lastWebhookPayload?: string | null;
  shippingStatus?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
}

/**
 * Create order event input
 */
export interface CreateOrderEventInput {
  orderId: number;
  lifefileOrderId?: string | null;
  eventType: string;
  payload?: unknown;
  note?: string | null;
}

/**
 * Order list filters
 */
export interface OrderListFilters {
  clinicId?: number | null;
  patientId?: number;
  providerId?: number;
  status?: string | string[];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  hasTrackingNumber?: boolean;
}

/**
 * Order list result
 */
export interface OrderListResult {
  orders: OrderWithPatient[];
  count: number;
}

/**
 * Event types for order events
 */
export const ORDER_EVENT_TYPES = {
  CREATED: 'CREATED',
  SUBMITTED: 'SUBMITTED',
  STATUS_UPDATE: 'STATUS_UPDATE',
  SHIPPING_UPDATE: 'SHIPPING_UPDATE',
  WEBHOOK_RECEIVED: 'WEBHOOK_RECEIVED',
  ERROR: 'ERROR',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderEventType = (typeof ORDER_EVENT_TYPES)[keyof typeof ORDER_EVENT_TYPES];
