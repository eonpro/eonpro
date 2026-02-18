/**
 * POST /api/admin/shipping/rematch
 * GET  /api/admin/shipping/rematch
 *
 * GET:  List unmatched shipping records for the clinic
 * POST: Re-attempt matching unmatched records against orders/patients
 *
 * When Lifefile pushes tracking data that can't be matched to a patient/order,
 * it's stored with patientId=null. This endpoint lets admins view those records
 * and trigger re-matching (e.g., after orders are imported or corrected).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { findPatientForShipping } from '@/lib/shipping/find-patient';
import { sendTrackingNotificationSMS } from '@/lib/shipping/tracking-sms';
import { logger } from '@/lib/logger';

async function handleGet(req: NextRequest, user: AuthUser) {
  const clinicId = user.clinicId;
  if (!clinicId) {
    return NextResponse.json({ error: 'No clinic context' }, { status: 400 });
  }

  return runWithClinicContext(clinicId, async () => {
    const unmatched = await prisma.patientShippingUpdate.findMany({
      where: {
        clinicId,
        matchedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        trackingNumber: true,
        carrier: true,
        status: true,
        lifefileOrderId: true,
        brand: true,
        shippedAt: true,
        rawPayload: true,
        createdAt: true,
      },
    });

    const matched = await prisma.patientShippingUpdate.count({
      where: { clinicId, matchedAt: { not: null } },
    });

    return NextResponse.json({
      unmatched: unmatched.length,
      matched,
      records: unmatched,
    });
  });
}

async function handlePost(req: NextRequest, user: AuthUser) {
  const clinicId = user.clinicId;
  if (!clinicId) {
    return NextResponse.json({ error: 'No clinic context' }, { status: 400 });
  }

  return runWithClinicContext(clinicId, async () => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    const unmatched = await prisma.patientShippingUpdate.findMany({
      where: {
        clinicId,
        matchedAt: null,
      },
    });

    if (unmatched.length === 0) {
      return NextResponse.json({ message: 'No unmatched records to process', matched: 0, failed: 0 });
    }

    let matchedCount = 0;
    let failedCount = 0;
    const results: Array<{ id: number; trackingNumber: string; status: string; patientId?: number; orderId?: number }> = [];

    for (const record of unmatched) {
      try {
        // Extract patient identifiers from raw payload if available
        let patientEmail: string | undefined;
        let patientId: string | undefined;

        if (record.rawPayload) {
          const payload = Array.isArray(record.rawPayload) ? record.rawPayload[0] : record.rawPayload;
          if (payload && typeof payload === 'object') {
            const p = payload as Record<string, any>;
            patientEmail = p.patientEmail?.trim() || undefined;
            patientId = p.patientId || undefined;
          }
        }

        const result = await findPatientForShipping(
          clinicId,
          record.lifefileOrderId || '',
          'REMATCH',
          patientEmail,
          patientId
        );

        if (result) {
          await prisma.patientShippingUpdate.update({
            where: { id: record.id },
            data: {
              patientId: result.patient.id,
              orderId: result.order?.id || null,
              matchedAt: new Date(),
            },
          });

          // Update the order with tracking info if we have one
          if (result.order) {
            await prisma.order.update({
              where: { id: result.order.id },
              data: {
                trackingNumber: record.trackingNumber,
                shippingStatus: 'shipped',
                lastWebhookAt: new Date(),
              },
            }).catch(() => {});
          }

          // Send tracking SMS (fire-and-forget) since this was previously missed
          sendTrackingNotificationSMS({
            patientId: result.patient.id,
            patientPhone: result.patient.phone,
            patientFirstName: result.patient.firstName,
            patientLastName: result.patient.lastName,
            clinicId,
            clinicName: clinic.name,
            trackingNumber: record.trackingNumber,
            carrier: record.carrier,
            orderId: result.order?.id,
          }).catch((err) => {
            logger.warn('[REMATCH] SMS failed', {
              error: err instanceof Error ? err.message : String(err),
              shippingUpdateId: record.id,
            });
          });

          matchedCount++;
          results.push({
            id: record.id,
            trackingNumber: record.trackingNumber,
            status: 'matched',
            patientId: result.patient.id,
            orderId: result.order?.id,
          });

          logger.info(`[REMATCH] Matched record ${record.id} → patient ${result.patient.id}, order ${result.order?.id}`);
        } else {
          failedCount++;
          results.push({
            id: record.id,
            trackingNumber: record.trackingNumber,
            status: 'still_unmatched',
          });
        }
      } catch (err) {
        failedCount++;
        logger.error('[REMATCH] Error processing record', {
          id: record.id,
          error: err instanceof Error ? err.message : String(err),
        });
        results.push({
          id: record.id,
          trackingNumber: record.trackingNumber,
          status: 'error',
        });
      }
    }

    return NextResponse.json({
      message: `Re-matched ${matchedCount} of ${unmatched.length} records`,
      matched: matchedCount,
      failed: failedCount,
      total: unmatched.length,
      results,
    });
  });
}

export const GET = (req: NextRequest) =>
  withAdminAuth(handleGet as (req: NextRequest, user: AuthUser) => Promise<Response>)(req);

export const POST = (req: NextRequest) =>
  withAdminAuth(handlePost as (req: NextRequest, user: AuthUser) => Promise<Response>)(req);
