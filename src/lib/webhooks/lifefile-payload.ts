/**
 * Lifefile webhook payload helpers
 * ================================
 * Normalize order/reference IDs from various payload shapes (top-level, nested,
 * snake_case) so order lookup works regardless of how Lifefile sends the webhook.
 *
 * Enterprise: input validation, length limits, no PHI in logs, pure functions.
 * @module lib/webhooks/lifefile-payload
 */

import type { ShippingStatus } from '@prisma/client';

/** Max length for order/reference IDs (DB column safe; prevents abuse) */
const MAX_ID_LENGTH = 255;

/** Keys checked for Lifefile order ID (order of precedence) */
const ID_KEYS = Object.freeze(['orderId', 'order_id', 'id']);

/** Keys checked for reference ID */
const REF_KEYS = Object.freeze(['referenceId', 'reference_id', 'reference']);

/** Nested paths to search for identifiers */
const NESTED_PATHS = Object.freeze(['order', 'data', 'prescription', 'rx']);

export interface LifefileOrderIdentifiers {
  orderId: string | null;
  referenceId: string | null;
}

export interface OrderLookupWhere {
  clinicId: number;
  OR: Array<{ lifefileOrderId: string } | { referenceId: string }>;
}

/**
 * Normalize and validate a string for use as order/reference ID.
 * Returns null if invalid (null, empty after trim, or exceeds MAX_ID_LENGTH).
 */
function normalizeId(value: unknown): string | null {
  if (value == null) return null;
  let s: string;
  if (typeof value === 'string') {
    s = value.trim();
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    s = String(value);
  } else {
    return null;
  }
  if (!s || s.length > MAX_ID_LENGTH) return null;
  return s;
}

/**
 * Extract first non-null string from object for given keys.
 */
function extractFrom(
  obj: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const s = normalizeId(obj[key]);
    if (s) return s;
  }
  return null;
}

/**
 * Get a nested object from payload; returns null if not a non-array object.
 */
function getNestedObject(payload: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const val = payload[key];
  if (val == null || typeof val !== 'object' || Array.isArray(val)) return null;
  return val as Record<string, unknown>;
}

/**
 * Extract Lifefile order ID and reference ID from a webhook payload.
 * Checks top-level, then payload.order, .data, .prescription, .rx for
 * orderId / order_id / id and referenceId / reference_id / reference.
 * All values are length-limited and sanitized.
 */
export function extractLifefileOrderIdentifiers(payload: unknown): LifefileOrderIdentifiers {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { orderId: null, referenceId: null };
  }
  const p = payload as Record<string, unknown>;

  let orderId = extractFrom(p, ID_KEYS);
  let referenceId = extractFrom(p, REF_KEYS);

  for (const path of NESTED_PATHS) {
    if (orderId && referenceId) break;
    const nested = getNestedObject(p, path);
    if (!nested) continue;
    if (!orderId) orderId = extractFrom(nested, ID_KEYS);
    if (!referenceId) referenceId = extractFrom(nested, REF_KEYS);
  }

  return {
    orderId: orderId ?? null,
    referenceId: referenceId ?? null,
  };
}

/**
 * Build Prisma where clause for finding an order by lifefileOrderId or referenceId.
 * Returns null if neither identifier is present (caller must not run lookup).
 */
export function buildOrderLookupWhere(
  clinicId: number,
  orderId: string | null,
  referenceId: string | null
): OrderLookupWhere | null {
  const conditions: OrderLookupWhere['OR'] = [];
  if (orderId) conditions.push({ lifefileOrderId: orderId });
  if (referenceId) conditions.push({ referenceId: referenceId });
  if (conditions.length === 0) return null;
  return { clinicId, OR: conditions };
}

/** Map webhook status strings to Prisma ShippingStatus enum */
const SHIPPING_STATUS_MAP: Record<string, ShippingStatus> = Object.freeze({
  pending: 'PENDING',
  label_created: 'LABEL_CREATED',
  shipped: 'SHIPPED',
  in_transit: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  returned: 'RETURNED',
  exception: 'EXCEPTION',
  cancelled: 'CANCELLED',
  labelcreated: 'LABEL_CREATED',
  intransit: 'IN_TRANSIT',
  outfordelivery: 'OUT_FOR_DELIVERY',
  update_received: 'SHIPPED',
});

/**
 * Map webhook status string to ShippingStatus enum for PatientShippingUpdate.
 * Unknown values default to SHIPPED.
 */
export function mapToShippingStatusEnum(status: string | null | undefined): ShippingStatus {
  if (status == null || typeof status !== 'string') return 'SHIPPED';
  const normalized = status.toLowerCase().replace(/[_\s-]/g, '');
  return SHIPPING_STATUS_MAP[normalized] ?? 'SHIPPED';
}

/** Maximum payload size (bytes) for webhook body to avoid DoS */
export const MAX_WEBHOOK_BODY_BYTES = 512 * 1024;

/** Max length for eventType stored in OrderEvent (safe for DB and logs) */
const MAX_EVENT_TYPE_LENGTH = 128;

/** Allow only alphanumeric, underscore, hyphen for event type (no injection) */
const SAFE_EVENT_TYPE_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Sanitize event type for OrderEvent.eventType and audit logs.
 * Returns safe string of max 128 chars; invalid input becomes "update".
 */
export function sanitizeEventType(value: string | null | undefined): string {
  if (value == null || typeof value !== 'string') return 'update';
  const trimmed = value.trim().slice(0, MAX_EVENT_TYPE_LENGTH);
  return SAFE_EVENT_TYPE_REGEX.test(trimmed) ? trimmed : 'update';
}
