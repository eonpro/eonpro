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
import {
  processDueRefills,
  autoMatchPaymentForRefill,
} from '@/services/refill';
import {
  getShipmentsNeedingReminder,
  markReminderSent,
  markPatientNotified,
  ADVANCE_REMINDER_DAYS,
} from '@/lib/shipment-schedule';
import { notificationService } from '@/services/notification';
import { sendShipmentReminderSMS } from '@/lib/prescription-tracking/shipment-notifications';

// Environment variable for cron authentication
const CRON_SECRET = process.env.CRON_SECRET;

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

async function processRefillScheduler(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret (if configured)
    if (CRON_SECRET) {
      const authHeader = req.headers.get('authorization');
      const cronHeader = req.headers.get('x-cron-secret');
      
      const providedSecret = authHeader?.replace('Bearer ', '') || cronHeader;
      
      if (providedSecret !== CRON_SECRET) {
        logger.warn('[Refill Scheduler] Unauthorized cron request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    logger.info('[Refill Scheduler] Starting scheduled job');

    // Step 1: Process due refills (SCHEDULED → PENDING_PAYMENT)
    const dueResult = await processDueRefills();

    logger.info('[Refill Scheduler] Processed due refills', {
      processed: dueResult.processed,
      errors: dueResult.errors.length,
    });

    // Step 2: Auto-match payments for Stripe-enabled clinics
    // Find refills in PENDING_PAYMENT status for Stripe clinics
    const pendingRefills = await prisma.refillQueue.findMany({
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
    });

    let autoMatchedCount = 0;
    const autoMatchErrors: string[] = [];

    for (const refill of pendingRefills) {
      // Only auto-match for Stripe-enabled clinics
      if (!refill.clinic?.stripeAccountId && !refill.clinic?.stripePlatformAccount) {
        continue;
      }

      try {
        const matched = await autoMatchPaymentForRefill(refill.id);
        if (matched) {
          autoMatchedCount++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        autoMatchErrors.push(`Refill ${refill.id}: ${message}`);
        logger.error('[Refill Scheduler] Auto-match error', {
          refillId: refill.id,
          error: message,
        });
      }
    }

    const stripeEnabledRefills = pendingRefills.filter((r: typeof pendingRefills[number]) => 
      r.clinic?.stripeAccountId || r.clinic?.stripePlatformAccount
    );

    logger.info('[Refill Scheduler] Auto-matched payments', {
      attempted: stripeEnabledRefills.length,
      matched: autoMatchedCount,
      errors: autoMatchErrors.length,
    });

    // Step 3: Send advance reminders for upcoming shipments (7 days before)
    const reminderResult = await processShipmentReminders();

    logger.info('[Refill Scheduler] Processed shipment reminders', {
      staffReminders: reminderResult.staffReminders,
      patientReminders: reminderResult.patientReminders,
      errors: reminderResult.errors.length,
    });

    // Step 4: Get summary stats
    const stats = await prisma.refillQueue.groupBy({
      by: ['status'],
      _count: true,
      where: {
        status: {
          in: ['SCHEDULED', 'PENDING_PAYMENT', 'PENDING_ADMIN', 'APPROVED', 'PENDING_PROVIDER'],
        },
      },
    });

    const statusCounts = stats.reduce((acc: Record<string, number>, item: typeof stats[number]) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<string, number>);

    const duration = Date.now() - startTime;

    logger.info('[Refill Scheduler] Job completed', {
      duration,
      dueProcessed: dueResult.processed,
      autoMatched: autoMatchedCount,
      currentQueue: statusCounts,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration,
      results: {
        dueRefillsProcessed: dueResult.processed,
        dueRefillsErrors: dueResult.errors.length,
        autoMatchAttempted: stripeEnabledRefills.length,
        autoMatchSucceeded: autoMatchedCount,
        autoMatchErrors: autoMatchErrors.length,
        staffRemindersSent: reminderResult.staffReminders,
        patientRemindersSent: reminderResult.patientReminders,
        reminderErrors: reminderResult.errors.length,
      },
      queueStatus: statusCounts,
      errors: [...dueResult.errors, ...autoMatchErrors, ...reminderResult.errors],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    logger.error('[Refill Scheduler] Job failed', {
      error: message,
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        duration,
        error: message,
      },
      { status: 500 }
    );
  }
}

/**
 * Process shipment reminders for upcoming scheduled shipments
 * Sends notifications to staff and SMS to patients
 */
async function processShipmentReminders(): Promise<{
  staffReminders: number;
  patientReminders: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let staffReminders = 0;
  let patientReminders = 0;

  try {
    // Get shipments needing reminders (due within 7 days, reminder not yet sent)
    const shipmentsNeedingReminder = await getShipmentsNeedingReminder(undefined, ADVANCE_REMINDER_DAYS);

    for (const shipment of shipmentsNeedingReminder) {
      try {
        // Send staff notification (in-app)
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

          // Mark reminder as sent
          await markReminderSent(shipment.id);
          staffReminders++;

          logger.info('[Refill Scheduler] Sent staff reminder', {
            refillId: shipment.id,
            patientId: shipment.patientId,
            daysUntilDue: shipment.daysUntilDue,
          });
        }

        // Send patient SMS notification (if not already sent)
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

            // Mark patient as notified
            await markPatientNotified(shipment.id);
            patientReminders++;

            logger.info('[Refill Scheduler] Sent patient SMS reminder', {
              refillId: shipment.id,
              patientId: shipment.patientId,
            });
          } catch (smsError) {
            const message = smsError instanceof Error ? smsError.message : 'Unknown error';
            errors.push(`Patient SMS for refill ${shipment.id}: ${message}`);
            logger.error('[Refill Scheduler] Failed to send patient SMS', {
              refillId: shipment.id,
              error: message,
            });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Reminder for refill ${shipment.id}: ${message}`);
        logger.error('[Refill Scheduler] Error processing reminder', {
          refillId: shipment.id,
          error: message,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Reminder processing: ${message}`);
    logger.error('[Refill Scheduler] Failed to get shipments needing reminder', {
      error: message,
    });
  }

  return { staffReminders, patientReminders, errors };
}

/**
 * Health check for the cron job
 */
export async function OPTIONS(req: NextRequest) {
  return NextResponse.json({
    name: 'refill-scheduler',
    description: 'Processes due prescription refills, auto-matches payments, and sends shipment reminders',
    schedule: 'Daily at 8 AM UTC',
    endpoint: '/api/cron/refill-scheduler',
    methods: ['GET', 'POST'],
    authentication: CRON_SECRET ? 'Required (CRON_SECRET)' : 'None',
  });
}
