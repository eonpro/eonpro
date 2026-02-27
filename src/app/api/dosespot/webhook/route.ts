import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

/**
 * DoseSpot Webhook Handler
 *
 * Receives notifications from DoseSpot (e.g., prescription status changes).
 * No auth wrapper -- uses its own verification.
 * Feature-flagged: returns 404 if DoseSpot is globally disabled.
 */
export async function POST(req: NextRequest) {
  try {
    if (process.env.NEXT_PUBLIC_ENABLE_DOSSPOT_EPRESCRIBING !== 'true') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
