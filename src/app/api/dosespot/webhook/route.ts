import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

/**
 * DoseSpot Webhook Handler
 *
 * Receives notifications from DoseSpot (e.g., prescription status changes).
 * Verifies the Subscription-Key header against the configured key.
 * Feature-flagged: returns 404 if DoseSpot is globally disabled.
 */
export async function POST(req: NextRequest) {
  try {
    if (process.env.NEXT_PUBLIC_ENABLE_DOSSPOT_EPRESCRIBING !== 'true') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const expectedKey = process.env.DOSESPOT_SUBSCRIPTION_KEY;
    if (expectedKey) {
      const providedKey =
        req.headers.get('subscription-key') ||
        req.headers.get('x-subscription-key') ||
        req.headers.get('x-api-key');
      if (!providedKey || providedKey !== expectedKey) {
        logger.warn('[DOSESPOT WEBHOOK] Invalid or missing Subscription-Key');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      logger.error('[DOSESPOT WEBHOOK] DOSESPOT_SUBSCRIPTION_KEY not configured — rejecting in production');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    const payload = await req.json();

    logger.info('[DOSESPOT WEBHOOK] Received', {
      payloadKeys: Object.keys(payload),
    });

    // Store as OrderEvent for audit trail
    // DoseSpot webhook payloads vary -- store the raw payload
    if (payload.PrescriptionId || payload.PatientId) {
      await prisma.orderEvent.create({
        data: {
          orderId: 0, // Placeholder -- linked via DoseSpot IDs in post-processing
          eventType: 'DOSESPOT_WEBHOOK',
          payload: JSON.parse(JSON.stringify(payload)),
          note: `DoseSpot webhook: ${payload.EventType || 'unknown'}`,
        },
      });
    }

    return NextResponse.json({ success: true, received: true });
  } catch (error) {
    logger.error('[DOSESPOT WEBHOOK] Error processing', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
