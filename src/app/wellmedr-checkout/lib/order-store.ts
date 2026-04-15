/**
 * Order store — Redis-backed ephemeral order tracking.
 *
 * Stores checkout order records in Redis (via Upstash REST) with a 24-hour TTL.
 * Falls back gracefully to no-op when Redis is unavailable (same behavior as
 * the platform cache module).
 *
 * Primary key: `sub:{subscriptionId}`. Secondary index: `cust:{customerId}`.
 */

import cache from '@/lib/cache/redis';
import { logger } from '@/lib/logger';

const NS = 'wm-orders';
const TTL = 86_400; // 24 hours

export interface OrderRecord {
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
  createdAt: string;
}

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
    createdAt: new Date().toISOString(),
  };

  await cache.set(`sub:${record.subscriptionId}`, record, { namespace: NS, ttl: TTL });
  await cache.set(`cust:${record.customerId}`, record.subscriptionId, { namespace: NS, ttl: TTL });

  logger.info('[wellmedr-order] Created order', {
    orderId: record.id,
    subscriptionId: record.subscriptionId,
  });
  return record;
}

export async function findOrderBySubscriptionId(
  subscriptionId: string
): Promise<OrderRecord | null> {
  return cache.get<OrderRecord>(`sub:${subscriptionId}`, { namespace: NS });
}

export async function findOrderByCustomerId(customerId: string): Promise<OrderRecord | null> {
  const subscriptionId = await cache.get<string>(`cust:${customerId}`, { namespace: NS });
  if (!subscriptionId) return null;
  return cache.get<OrderRecord>(`sub:${subscriptionId}`, { namespace: NS });
}

async function patchOrder(
  subscriptionId: string,
  patch: Partial<OrderRecord>
): Promise<void> {
  const order = await cache.get<OrderRecord>(`sub:${subscriptionId}`, { namespace: NS });
  if (!order) return;
  const updated = { ...order, ...patch };
  await cache.set(`sub:${subscriptionId}`, updated, { namespace: NS, ttl: TTL });
}

export async function updateOrderPaymentStatus(
  subscriptionId: string,
  status: string
): Promise<void> {
  await patchOrder(subscriptionId, { paymentStatus: status });
}

export async function updateOrderSubscriptionStatus(
  subscriptionId: string,
  status: string
): Promise<void> {
  await patchOrder(subscriptionId, { subscriptionStatus: status });
}

export async function updateOrderStatus(subscriptionId: string, status: string): Promise<void> {
  await patchOrder(subscriptionId, { orderStatus: status });
}

export async function updateOrderPaymentDetails(
  subscriptionId: string,
  details: Record<string, unknown>
): Promise<void> {
  await patchOrder(subscriptionId, details as Partial<OrderRecord>);
}

export async function updateOrderAddonMetadata(
  subscriptionId: string,
  addons: string[]
): Promise<void> {
  await patchOrder(subscriptionId, { selectedAddons: addons });
}
