import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { basePrisma } from '@/lib/db';

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
      if (!providedKey) {
        logger.warn('[DOSESPOT WEBHOOK] Missing Subscription-Key header');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const expectedBuf = Buffer.from(expectedKey);
      const providedBuf = Buffer.from(providedKey);
      if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        logger.warn('[DOSESPOT WEBHOOK] Invalid Subscription-Key');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      logger.error('[DOSESPOT WEBHOOK] DOSESPOT_SUBSCRIPTION_KEY not configured — rejecting in production');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    const payload = await req.json();

    logger.info('[DOSESPOT WEBHOOK] Received', {
      payloadKeys: Object.keys(payload),
      eventType: payload.EventType,
      prescriptionId: payload.PrescriptionId,
      patientId: payload.PatientId,
    });

    if (payload.PrescriptionId || payload.PatientId) {
      // Try to find the matching order by doseSpotPrescriptionId
      let linkedOrderId: number | null = null;
      if (payload.PrescriptionId) {
        const matchingOrder = await basePrisma.order.findFirst({
          where: { doseSpotPrescriptionId: Number(payload.PrescriptionId) },
          select: { id: true },
        });
        linkedOrderId = matchingOrder?.id ?? null;
      }

      if (linkedOrderId) {
        await basePrisma.orderEvent.create({
          data: {
            orderId: linkedOrderId,
            eventType: 'DOSESPOT_WEBHOOK',
            payload: JSON.parse(JSON.stringify(payload)),
            note: `DoseSpot webhook: ${payload.EventType || 'unknown'}`,
          },
        });
      } else {
        logger.warn('[DOSESPOT WEBHOOK] No matching order found, payload logged only', {
          prescriptionId: payload.PrescriptionId,
          patientId: payload.PatientId,
          eventType: payload.EventType,
        });
      }
    }

    return NextResponse.json({ success: true, received: true });
  } catch (error) {
    logger.error('[DOSESPOT WEBHOOK] Error processing', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
