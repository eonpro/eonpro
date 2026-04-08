/**
 * Process Scheduled Payments Cron Job
 * ====================================
 *
 * Processes PENDING scheduled payments that are due:
 * - AUTO_CHARGE: Charges the patient's saved card via the existing payment flow
 * - REMINDER: Marks as PROCESSED and logs (notification system integration TBD)
 *
 * Vercel Cron: 0 8,12,16 * * * (3x daily at 08:00, 12:00, 16:00 UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  let processedCount = 0;
  let reminderCount = 0;
  let failedCount = 0;

  try {
    const duePayments = await prisma.scheduledPayment.findMany({
      where: {
        status: 'PENDING',
        scheduledDate: { lte: now },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            clinicId: true,
            stripeCustomerId: true,
            paymentMethods: {
              where: { isActive: true },
              orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }],
              take: 1,
              select: {
                id: true,
                stripePaymentMethodId: true,
                cardLast4: true,
              },
            },
          },
        },
      },
      orderBy: { scheduledDate: 'asc' },
      take: 50,
    });

    if (duePayments.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No scheduled payments due',
        processed: 0,
        reminders: 0,
        failed: 0,
      });
    }

    logger.info('[CronScheduledPayments] Processing due payments', {
      count: duePayments.length,
    });

    for (const sp of duePayments) {
      try {
        if (sp.type === 'REMINDER') {
          await prisma.scheduledPayment.update({
            where: { id: sp.id },
            data: {
              status: 'PROCESSED',
              processedAt: now,
              metadata: {
                ...(sp.metadata as object || {}),
                processedByCron: true,
                processedAt: now.toISOString(),
              },
            },
          });
          reminderCount++;

          logger.info('[CronScheduledPayments] Reminder processed', {
            scheduledPaymentId: sp.id,
            patientId: sp.patientId,
          });
          continue;
        }

        // AUTO_CHARGE: attempt to charge the patient's saved card
        const defaultCard = sp.patient.paymentMethods[0];
        if (!defaultCard?.stripePaymentMethodId) {
          await prisma.scheduledPayment.update({
            where: { id: sp.id },
            data: {
              status: 'FAILED',
              processedAt: now,
              metadata: {
                ...(sp.metadata as object || {}),
                failureReason: 'No saved payment method with Stripe link',
                processedByCron: true,
              },
            },
          });
          failedCount++;
          logger.warn('[CronScheduledPayments] No saved card for auto-charge', {
            scheduledPaymentId: sp.id,
            patientId: sp.patientId,
          });
          continue;
        }

        // Use internal fetch to the payment processing route
        const paymentRes = await fetch(
          `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/stripe/payments/process`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-cron-secret': process.env.CRON_SECRET || '',
            },
            body: JSON.stringify({
              patientId: sp.patientId,
              amount: sp.amount,
              description: sp.description || sp.planName || 'Scheduled Payment',
              paymentMethodId: defaultCard.id,
              notes: `Auto-charged from scheduled payment #${sp.id}`,
            }),
          }
        );

        if (paymentRes.ok) {
          const paymentData = await paymentRes.json();
          await prisma.scheduledPayment.update({
            where: { id: sp.id },
            data: {
              status: 'PROCESSED',
              processedAt: now,
              paymentId: paymentData.payment?.id || null,
              metadata: {
                ...(sp.metadata as object || {}),
                processedByCron: true,
                paymentResponse: { success: true, paymentId: paymentData.payment?.id },
              },
            },
          });
          processedCount++;

          logger.info('[CronScheduledPayments] Auto-charge succeeded', {
            scheduledPaymentId: sp.id,
            patientId: sp.patientId,
            paymentId: paymentData.payment?.id,
          });
        } else {
          const errData = await paymentRes.json().catch(() => ({ error: 'Unknown error' }));
          await prisma.scheduledPayment.update({
            where: { id: sp.id },
            data: {
              status: 'FAILED',
              processedAt: now,
              metadata: {
                ...(sp.metadata as object || {}),
                processedByCron: true,
                failureReason: errData.error || `HTTP ${paymentRes.status}`,
              },
            },
          });
          failedCount++;

          logger.error('[CronScheduledPayments] Auto-charge failed', {
            scheduledPaymentId: sp.id,
            patientId: sp.patientId,
            error: errData.error,
          });
        }
      } catch (spErr) {
        failedCount++;
        logger.error('[CronScheduledPayments] Error processing scheduled payment', {
          scheduledPaymentId: sp.id,
          error: spErr instanceof Error ? spErr.message : String(spErr),
        });

        await prisma.scheduledPayment.update({
          where: { id: sp.id },
          data: {
            status: 'FAILED',
            processedAt: now,
            metadata: {
              ...(sp.metadata as object || {}),
              processedByCron: true,
              failureReason: spErr instanceof Error ? spErr.message : 'Processing error',
            },
          },
        }).catch(() => {});
      }
    }

    logger.info('[CronScheduledPayments] Batch complete', {
      processedCount,
      reminderCount,
      failedCount,
      total: duePayments.length,
    });

    return NextResponse.json({
      success: true,
      processed: processedCount,
      reminders: reminderCount,
      failed: failedCount,
      total: duePayments.length,
    });
  } catch (error) {
    logger.error('[CronScheduledPayments] Fatal cron error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Cron job failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
