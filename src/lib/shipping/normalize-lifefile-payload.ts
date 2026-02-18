/**
 * Lifefile Shipping Webhook Payload Normalizer
 * =============================================
 *
 * Lifefile sends shipping data as an ARRAY of Rx line items:
 *   [{ fillId, orderId, trackingNumber, deliveryService, rxNumber, rxStatus, ... }]
 *
 * Multiple items may share the same trackingNumber (one per Rx in the order).
 * This module normalizes the raw payload into a consistent format for processing.
 */

import { z } from 'zod';
import { logger } from '@/lib/logger';

const lifefileItemSchema = z.object({
  fillId: z.string().optional(),
  orderId: z.string().min(1, 'orderId is required'),
  service: z.string().optional(),
  shipZip: z.string().optional(),
  lfdrugId: z.string().optional(),
  rxNumber: z.string().optional(),
  rxStatus: z.string().optional(),
  shipCity: z.string().optional(),
  patientId: z.string().optional(),
  shipState: z.string().optional(),
  practiceId: z.string().optional(),
  providerId: z.string().optional(),
  shipCarrier: z.string().optional(),
  shipCountry: z.string().optional(),
  patientEmail: z.string().optional(),
  trackingNumber: z.string().min(1, 'trackingNumber is required'),
  deliveryService: z.string().optional(),
  foreignRxNumber: z.string().nullable().optional(),
  OrderReferenceId: z.string().nullable().optional(),
  pharmacyLocation: z.string().optional(),
  rxStatusDateTime: z.string().optional(),
  shipAddressLine1: z.string().nullable().optional(),
  shipAddressLine2: z.string().nullable().optional(),
  shipAddressLine3: z.string().nullable().optional(),
});

export type LifefileShipmentItem = z.infer<typeof lifefileItemSchema>;

export interface NormalizedShipment {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  deliveryService: string;
  status: string;
  patientEmail?: string;
  patientId?: string;
  rxItems: LifefileShipmentItem[];
  statusDateTime?: string;
  shipAddress?: {
    line1?: string;
    line2?: string;
    line3?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}

/**
 * Normalize Lifefile's raw webhook payload into a consistent format.
 *
 * Accepts:
 * - Array of Rx items (Lifefile's actual format)
 * - Single object (our original assumed format, for backward compatibility)
 *
 * Returns null if the payload is invalid.
 */
export function normalizeLifefilePayload(
  rawPayload: unknown,
  webhookTag: string
): NormalizedShipment | null {
  // Handle array format (Lifefile's actual format)
  if (Array.isArray(rawPayload)) {
    if (rawPayload.length === 0) {
      logger.error(`[${webhookTag}] Empty array payload`);
      return null;
    }

    const validItems: LifefileShipmentItem[] = [];
    for (const item of rawPayload) {
      const result = lifefileItemSchema.safeParse(item);
      if (result.success) {
        validItems.push(result.data);
      } else {
        logger.warn(`[${webhookTag}] Skipping invalid item in array`, {
          errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      }
    }

    if (validItems.length === 0) {
      logger.error(`[${webhookTag}] No valid items in array payload`);
      return null;
    }

    const first = validItems[0];
    const carrier = extractCarrier(first.deliveryService || first.shipCarrier || first.service || '');

    return {
      orderId: first.orderId,
      trackingNumber: first.trackingNumber,
      carrier,
      deliveryService: first.deliveryService || first.service || carrier,
      status: mapRxStatus(first.rxStatus),
      patientEmail: first.patientEmail?.trim() || undefined,
      patientId: first.patientId || undefined,
      rxItems: validItems,
      statusDateTime: first.rxStatusDateTime || undefined,
      shipAddress: {
        line1: first.shipAddressLine1 || undefined,
        line2: first.shipAddressLine2 || undefined,
        line3: first.shipAddressLine3 || undefined,
        city: first.shipCity || undefined,
        state: first.shipState || undefined,
        zip: first.shipZip || undefined,
        country: first.shipCountry || undefined,
      },
    };
  }

  // Handle single object format (backward compatibility with our original schema)
  if (rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)) {
    const obj = rawPayload as Record<string, any>;

    if (obj.trackingNumber && obj.orderId) {
      const carrier = extractCarrier(obj.deliveryService || obj.shipCarrier || obj.service || '');
      return {
        orderId: String(obj.orderId),
        trackingNumber: String(obj.trackingNumber),
        carrier,
        deliveryService: obj.deliveryService || obj.service || carrier,
        status: mapRxStatus(obj.rxStatus || obj.status),
        patientEmail: obj.patientEmail?.trim() || undefined,
        patientId: obj.patientId || undefined,
        rxItems: [],
        statusDateTime: obj.rxStatusDateTime || obj.timestamp || undefined,
      };
    }
  }

  logger.error(`[${webhookTag}] Unrecognized payload format`, {
    type: typeof rawPayload,
    isArray: Array.isArray(rawPayload),
  });
  return null;
}

/**
 * Extract the carrier name from Lifefile's deliveryService string.
 * e.g., "UPS - NEXT DAY - FLORIDA" → "UPS"
 *       "FEDEX-STANDARD OVERNIGHT" → "FedEx"
 */
function extractCarrier(service: string): string {
  const upper = service.toUpperCase();
  if (upper.includes('UPS')) return 'UPS';
  if (upper.includes('FEDEX') || upper.includes('FED EX')) return 'FedEx';
  if (upper.includes('USPS')) return 'USPS';
  if (upper.includes('DHL')) return 'DHL';
  if (upper.includes('EASYPOST')) return 'EasyPost';
  return service.split(/[\s-]/)[0] || 'Unknown';
}

/**
 * Map Lifefile's rxStatus to our shipping status string.
 */
function mapRxStatus(status?: string): string {
  if (!status) return 'shipped';
  const upper = status.toUpperCase();
  if (upper === 'SHIPPED') return 'shipped';
  if (upper === 'DELIVERED') return 'delivered';
  if (upper === 'IN_TRANSIT' || upper === 'IN TRANSIT') return 'in_transit';
  if (upper === 'OUT_FOR_DELIVERY' || upper === 'OUT FOR DELIVERY') return 'out_for_delivery';
  if (upper === 'CANCELLED' || upper === 'CANCELED') return 'cancelled';
  if (upper === 'RETURNED') return 'returned';
  return 'shipped';
}
