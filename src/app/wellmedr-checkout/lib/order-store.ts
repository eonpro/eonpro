/**
 * Order store — replaces Airtable with platform DB.
 * For now, uses a simple in-memory + session approach.
 * In production, integrate with prisma.order or a dedicated WellMedR orders table.
 */

import { logger } from '@/lib/logger';

interface OrderRecord {
  id: string;
  submissionId: string;
  subscriptionId: string;
  customerId: string;
  customerEmail: string;
  productName: string;
  medicationType: string;
  planType: string;
  priceId: string;
  amount: number;
  shippingAddress: Record<string, unknown>;
  billingAddress: Record<string, unknown>;
  selectedAddons: string[];
  paymentStatus: string;
  subscriptionStatus: string;
  orderStatus: string;
  createdAt: Date;
}

const orders = new Map<string, OrderRecord>();

export async function createOrder(params: {
  submissionId: string;
  subscriptionId: string;
  customerId: string;
  customerEmail: string;
  productName: string;
  medicationType: string;
  planType: string;
  priceId: string;
  amount: number;
  shippingAddress: Record<string, unknown>;
  billingAddress: Record<string, unknown>;
  selectedAddons?: string[];
}): Promise<OrderRecord> {
  const record: OrderRecord = {
    id: crypto.randomUUID(),
    ...params,
    selectedAddons: params.selectedAddons || [],
    paymentStatus: 'pending',
    subscriptionStatus: 'incomplete',
    orderStatus: 'created',
    createdAt: new Date(),
  };
  orders.set(record.subscriptionId, record);
  logger.info('[wellmedr-order] Created order', {
    orderId: record.id,
    subscriptionId: record.subscriptionId,
  });
  return record;
}

export async function findOrderBySubscriptionId(
  subscriptionId: string
): Promise<OrderRecord | null> {
  return orders.get(subscriptionId) || null;
}

export async function findOrderByCustomerId(customerId: string): Promise<OrderRecord | null> {
  for (const order of orders.values()) {
    if (order.customerId === customerId) return order;
  }
  return null;
}

export async function updateOrderPaymentStatus(orderId: string, status: string): Promise<void> {
  for (const order of orders.values()) {
    if (order.id === orderId) {
      order.paymentStatus = status;
      return;
    }
  }
}

export async function updateOrderSubscriptionStatus(
  orderId: string,
  status: string
): Promise<void> {
  for (const order of orders.values()) {
    if (order.id === orderId) {
      order.subscriptionStatus = status;
      return;
    }
  }
}

export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  for (const order of orders.values()) {
    if (order.id === orderId) {
      order.orderStatus = status;
      return;
    }
  }
}

export async function updateOrderPaymentDetails(
  orderId: string,
  details: Record<string, unknown>
): Promise<void> {
  for (const order of orders.values()) {
    if (order.id === orderId) {
      Object.assign(order, details);
      return;
    }
  }
}

export async function updateOrderAddonMetadata(orderId: string, addons: string[]): Promise<void> {
  for (const order of orders.values()) {
    if (order.id === orderId) {
      order.selectedAddons = addons;
      return;
    }
  }
}
