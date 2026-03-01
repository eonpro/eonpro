/**
 * Refill Escalation Cron Job
 * ===========================
 *
 * Escalates stale refills that haven't been acted on in time:
 *
 * 1. PENDING_ADMIN > 4 hours  → HIGH priority alert to admins
 * 2. PENDING_ADMIN > 24 hours → URGENT alert to admins + providers
 * 3. APPROVED > 8 hours       → HIGH priority alert to providers (prescription not written)
 * 4. APPROVED > 48 hours      → URGENT alert to providers + admins
 *
 * Vercel Cron: 0 * /4 * * * (every 4 hours)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { handleApiError } from '@/domains/shared/errors';
import { notificationEvents } from '@/services/notification/notificationEvents';
import type { RefillQueue, Patient } from '@prisma/client';

const PENDING_ADMIN_WARN_HOURS = 4;
const PENDING_ADMIN_URGENT_HOURS = 24;
const APPROVED_WARN_HOURS = 8;
const APPROVED_URGENT_HOURS = 48;

export async function GET(req: NextRequest) {
  return runEscalation(req);
}

export async function POST(req: NextRequest) {
  return runEscalation(req);
}

async function runEscalation(req: NextRequest) {
  const startTime = Date.now();

  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('[CRON refill-escalation] Starting escalation check');

  try {
    const now = new Date();
    let escalated = 0;

    // 1. PENDING_ADMIN refills that are stale
    const stalePendingAdmin = await prisma.refillQueue.findMany({
      where: {
        status: 'PENDING_ADMIN',
        createdAt: {
          lt: new Date(now.getTime() - PENDING_ADMIN_WARN_HOURS * 60 * 60 * 1000),
        },
      },
      include: { patient: true },
    });

    for (const refill of stalePendingAdmin) {
      const hoursStale = (now.getTime() - refill.createdAt.getTime()) / (1000 * 60 * 60);
      const patientName = safePatientName(refill.patient);
      const medName = refill.medicationName || refill.planName || 'Prescription';
      const isUrgent = hoursStale >= PENDING_ADMIN_URGENT_HOURS;

      await notificationEvents.refillDue({
        clinicId: refill.clinicId,
        patientId: refill.patientId,
        patientName,
        medicationName: `${medName} — waiting ${Math.round(hoursStale)}h for admin approval`,
        daysUntilDue: 0,
      });

      if (isUrgent) {
        await notificationEvents.newRxQueue({
          clinicId: refill.clinicId,
          patientId: refill.patientId,
          patientName,
          treatmentType: medName,
          isRefill: true,
          priority: 'urgent',
        });
      }

      escalated++;
      logger.warn('[CRON refill-escalation] Stale PENDING_ADMIN refill', {
        refillId: refill.id,
        hoursStale: Math.round(hoursStale),
        isUrgent,
        patientId: refill.patientId,
      });
    }

    // 2. APPROVED refills waiting too long for provider to prescribe
    const staleApproved = await prisma.refillQueue.findMany({
      where: {
        status: { in: ['APPROVED', 'PENDING_PROVIDER'] },
        providerQueuedAt: {
          lt: new Date(now.getTime() - APPROVED_WARN_HOURS * 60 * 60 * 1000),
        },
      },
      include: { patient: true },
    });

    for (const refill of staleApproved) {
      const queuedAt = refill.providerQueuedAt || refill.adminApprovedAt || refill.createdAt;
      const hoursWaiting = (now.getTime() - queuedAt.getTime()) / (1000 * 60 * 60);
      const patientName = safePatientName(refill.patient);
      const medName = refill.medicationName || refill.planName || 'Prescription';
      const isUrgent = hoursWaiting >= APPROVED_URGENT_HOURS;

      await notificationEvents.newRxQueue({
        clinicId: refill.clinicId,
        patientId: refill.patientId,
        patientName,
        treatmentType: `${medName} — waiting ${Math.round(hoursWaiting)}h for prescription`,
        isRefill: true,
        priority: isUrgent ? 'urgent' : 'high',
      });

      if (isUrgent) {
        await notificationEvents.systemAlert({
          clinicId: refill.clinicId,
          title: 'Overdue Prescription',
          message: `${patientName}'s ${medName} refill has been approved for ${Math.round(hoursWaiting)} hours without a prescription being written.`,
          priority: 'URGENT',
          actionUrl: `/provider/prescription-queue?patientId=${refill.patientId}`,
        });
      }

      escalated++;
      logger.warn('[CRON refill-escalation] Stale APPROVED refill', {
        refillId: refill.id,
        hoursWaiting: Math.round(hoursWaiting),
        isUrgent,
        patientId: refill.patientId,
      });
    }

    const duration = Date.now() - startTime;

    const result = {
      success: true,
      duration,
      stalePendingAdmin: stalePendingAdmin.length,
      staleApproved: staleApproved.length,
      totalEscalated: escalated,
    };

    logger.info('[CRON refill-escalation] Completed', result);

    return NextResponse.json(result);
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';

    logger.error('[CRON refill-escalation] Fatal error', {
      error: message,
      duration,
    });

    return handleApiError(error, { route: 'GET /api/cron/refill-escalation' });
  }
}

function safePatientName(patient: Patient | null): string {
  if (!patient) return 'Patient';
  try {
    const { decryptPHI } = require('@/lib/security/phi-encryption');
    const first = patient.firstName ? decryptPHI(patient.firstName) || patient.firstName : '';
    const last = patient.lastName ? decryptPHI(patient.lastName) || patient.lastName : '';
    return `${first} ${last}`.trim() || 'Patient';
  } catch {
    return `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient';
  }
}
