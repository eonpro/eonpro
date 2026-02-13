/**
 * Refill Scheduler Cron Job
 * =========================
 *
 * This endpoint processes prescription refills that are due.
 * It should be called daily by an external cron service (e.g., Vercel Cron, AWS EventBridge).
 *
 * Actions performed:
 * 1. Move SCHEDULED refills that are due → PENDING_PAYMENT
 * 2. Auto-match payments for Stripe-enabled clinics
 * 3. Send advance reminders (7 days before) to staff via in-app notifications
 * 4. Send advance reminders (7 days before) to patients via SMS
 *
 * Security:
 * - Protected by CRON_SECRET header
 * - Rate limited to prevent abuse
 *
 * Vercel Cron Configuration (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/refill-scheduler",
 *     "schedule": "0 8 * * *"  // Daily at 8 AM UTC
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { processDueRefills, autoMatchPaymentForRefill } from '@/services/refill';
import {
  getShipmentsNeedingReminder,
  markReminderSent,
  markPatientNotified,
  ADVANCE_REMINDER_DAYS,
} from '@/lib/shipment-schedule';
import { notificationService } from '@/services/notification';
import { sendShipmentReminderSMS } from '@/lib/prescription-tracking/shipment-notifications';
import {
  verifyCronAuth,
  runCronPerTenant,
  takeBatch,
} from '@/lib/cron/tenant-isolation';

const BATCH_LIMIT_REFILLS = 500;
const BATCH_LIMIT_REMINDERS = 200;

/**
 * GET /api/cron/refill-scheduler
 * Process due refills (for Vercel Cron which uses GET)
 */
export async function GET(req: NextRequest) {
  return processRefillScheduler(req);
}

/**
 * POST /api/cron/refill-scheduler
 * Process due refills (for other cron services that prefer POST)
 */
export async function POST(req: NextRequest) {
  return processRefillScheduler(req);
}

type PerClinicResult = {
  dueProcessed: number;
  dueErrors: string[];
  autoMatchAttempted: number;
  autoMatchSucceeded: number;
  autoMatchErrors: string[];
  staffReminders: number;
  patientReminders: number;
  reminderErrors: string[];
  queueStatus: Record<string, number>;
};

async function processRefillScheduler(req: NextRequest) {
  const startTime = Date.now();

  if (!verifyCronAuth(req)) {
    logger.warn('[Refill Scheduler] Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { results, totalDurationMs } = await runCronPerTenant<PerClinicResult>({
      jobName: 'refill-scheduler',
      perClinic: async (clinicId) => {
        const dueResult = await processDueRefills(clinicId);

        const pendingRefills = takeBatch(
          await prisma.refillQueue.findMany({
            where: {
              status: 'PENDING_PAYMENT',
              paymentVerified: false,
            },
            include: {
              clinic: {
                select: {
                  id: true,
                  stripeAccountId: true,
                  stripePlatformAccount: true,
                },
              },
            },
          }),
          BATCH_LIMIT_REFILLS
        );

        let autoMatchedCount = 0;
        const autoMatchErrors: string[] = [];

        for (const refill of pendingRefills) {
          if (!refill.clinic?.stripeAccountId && !refill.clinic?.stripePlatformAccount) continue;
          try {
            if (await autoMatchPaymentForRefill(refill.id)) autoMatchedCount++;
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            autoMatchErrors.push(`Refill ${refill.id}: ${msg}`);
          }
        }

        const reminderResult = await processShipmentRemindersForClinic(clinicId);

        const stats = await prisma.refillQueue.groupBy({
          by: ['status'],
          _count: true,
          where: {
            status: {
              in: ['SCHEDULED', 'PENDING_PAYMENT', 'PENDING_ADMIN', 'APPROVED', 'PENDING_PROVIDER'],
            },
          },
        });
        const queueStatus = stats.reduce(
          (acc: Record<string, number>, item: (typeof stats)[number]) => {
            acc[item.status] = item._count;
            return acc;
          },
          {} as Record<string, number>
        );

        return {
          dueProcessed: dueResult.processed,
          dueErrors: dueResult.errors,
          autoMatchAttempted: pendingRefills.filter(
            (r) => r.clinic?.stripeAccountId || r.clinic?.stripePlatformAccount
          ).length,
          autoMatchSucceeded: autoMatchedCount,
          autoMatchErrors,
          staffReminders: reminderResult.staffReminders,
          patientReminders: reminderResult.patientReminders,
          reminderErrors: reminderResult.errors,
          queueStatus,
        };
      },
      batchLimitPerClinic: BATCH_LIMIT_REFILLS,
    });

    const aggregated = results.reduce(
      (acc, r) => {
        if (!r.success || !r.data) return acc;
        const d = r.data;
        acc.dueProcessed += d.dueProcessed;
        acc.dueErrors.push(...d.dueErrors);
        acc.autoMatchAttempted += d.autoMatchAttempted;
        acc.autoMatchSucceeded += d.autoMatchSucceeded;
        acc.autoMatchErrors.push(...d.autoMatchErrors);
        acc.staffReminders += d.staffReminders;
        acc.patientReminders += d.patientReminders;
        acc.reminderErrors.push(...d.reminderErrors);
        for (const [status, count] of Object.entries(d.queueStatus)) {
          acc.queueStatus[status] = (acc.queueStatus[status] || 0) + count;
        }
        return acc;
      },
      {
        dueProcessed: 0,
        dueErrors: [] as string[],
        autoMatchAttempted: 0,
        autoMatchSucceeded: 0,
        autoMatchErrors: [] as string[],
        staffReminders: 0,
        patientReminders: 0,
        reminderErrors: [] as string[],
        queueStatus: {} as Record<string, number>,
      }
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: totalDurationMs,
      results: {
        dueRefillsProcessed: aggregated.dueProcessed,
        dueRefillsErrors: aggregated.dueErrors.length,
        autoMatchAttempted: aggregated.autoMatchAttempted,
        autoMatchSucceeded: aggregated.autoMatchSucceeded,
        autoMatchErrors: aggregated.autoMatchErrors.length,
        staffRemindersSent: aggregated.staffReminders,
        patientRemindersSent: aggregated.patientReminders,
        reminderErrors: aggregated.reminderErrors.length,
      },
      queueStatus: aggregated.queueStatus,
      errors: [
        ...aggregated.dueErrors,
        ...aggregated.autoMatchErrors,
        ...aggregated.reminderErrors,
      ],
      perClinic: results.map((r) =>
        r.success
          ? { clinicId: r.clinicId, success: true, ...r.data }
          : { clinicId: r.clinicId, success: false, error: r.error }
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Refill Scheduler] Job failed', { error: message, duration: Date.now() - startTime });
    return NextResponse.json(
      { success: false, timestamp: new Date().toISOString(), duration: Date.now() - startTime, error: message },
      { status: 500 }
    );
  }
}

async function processShipmentRemindersForClinic(clinicId: number): Promise<{
  staffReminders: number;
  patientReminders: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let staffReminders = 0;
  let patientReminders = 0;
  const shipments = takeBatch(
    await getShipmentsNeedingReminder(clinicId, ADVANCE_REMINDER_DAYS),
    BATCH_LIMIT_REMINDERS
  );

  for (const shipment of shipments) {
    try {
      if (shipment.clinic && shipment.reminderSentAt === null) {
        await notificationService.notifyAdmins({
          clinicId: shipment.clinicId,
          category: 'SHIPMENT',
          priority: 'NORMAL',
          title: `Upcoming Shipment Due (${shipment.daysUntilDue} days)`,
          message: `Patient ${shipment.patient?.firstName || 'Unknown'} ${shipment.patient?.lastName || ''} has shipment ${shipment.shipmentNumber}/${shipment.totalShipments} due on ${shipment.nextRefillDate.toLocaleDateString()}. Plan: ${shipment.planName || 'N/A'}`,
          actionUrl: `/admin/patients/${shipment.patientId}`,
          sourceType: 'shipment_reminder',
          sourceId: `refill_${shipment.id}`,
        });
        await markReminderSent(shipment.id);
        staffReminders++;
      }
      if (shipment.patient?.phone && shipment.patientNotifiedAt === null) {
        try {
          await sendShipmentReminderSMS({
            patientId: shipment.patientId,
            phone: shipment.patient.phone,
            patientFirstName: shipment.patient.firstName || 'Patient',
            shipmentNumber: shipment.shipmentNumber || 1,
            totalShipments: shipment.totalShipments || 1,
            dueDate: shipment.nextRefillDate,
            daysUntilDue: shipment.daysUntilDue,
            medicationName: shipment.medicationName || shipment.planName || 'your medication',
          });
          await markPatientNotified(shipment.id);
          patientReminders++;
        } catch (smsError) {
          const msg = smsError instanceof Error ? smsError.message : 'Unknown error';
          errors.push(`Patient SMS refill ${shipment.id}: ${msg}`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Reminder refill ${shipment.id}: ${msg}`);
    }
  }
  return { staffReminders, patientReminders, errors };
}

/**
 * Health check for the cron job
 */
export async function OPTIONS() {
  return NextResponse.json({
    name: 'refill-scheduler',
    description:
      'Processes due prescription refills (per-tenant), auto-matches payments, and sends shipment reminders',
    schedule: 'Daily at 8 AM UTC',
    endpoint: '/api/cron/refill-scheduler',
    methods: ['GET', 'POST'],
    authentication: process.env.CRON_SECRET ? 'Required (CRON_SECRET)' : 'None',
    tenantIsolation: 'Per-clinic via runWithClinicContext',
  });
}
