/**
 * Shipment Advance Reminders Cron Job
 * =====================================
 *
 * Sends advance reminders to admins for shipments due in the next 7 days.
 * Uses the existing getShipmentsNeedingReminder() + markReminderSent()
 * from shipmentScheduleService.
 *
 * Vercel Cron: 0 10 * * * (daily at 10 AM UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { handleApiError } from '@/domains/shared/errors';
import {
  getShipmentsNeedingReminder,
  markReminderSent,
} from '@/lib/shipment-schedule/shipmentScheduleService';
import { notificationEvents } from '@/services/notification/notificationEvents';
import type { Patient } from '@prisma/client';

export async function GET(req: NextRequest) {
  return runShipmentReminders(req);
}

export async function POST(req: NextRequest) {
  return runShipmentReminders(req);
}

async function runShipmentReminders(req: NextRequest) {
  const startTime = Date.now();

  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  logger.info('[CRON shipment-reminders] Starting shipment advance reminder check');

  try {
    const shipments = await getShipmentsNeedingReminder();
    let sent = 0;
    let errors = 0;

    for (const shipment of shipments) {
      try {
        const patientName = safePatientName(shipment.patient ?? null);
        const medName = shipment.medicationName || shipment.planName || 'Medication';
        const shipmentLabel =
          shipment.totalShipments && shipment.totalShipments > 1
            ? ` (shipment ${shipment.shipmentNumber}/${shipment.totalShipments})`
            : '';

        await notificationEvents.refillDue({
          clinicId: shipment.clinicId,
          patientId: shipment.patientId,
          patientName,
          medicationName: `${medName}${shipmentLabel}`,
          daysUntilDue: shipment.daysUntilDue,
          shipmentNumber: shipment.shipmentNumber ?? undefined,
          totalShipments: shipment.totalShipments ?? undefined,
        });

        await markReminderSent(shipment.id);
        sent++;

        logger.info('[CRON shipment-reminders] Reminder sent', {
          refillId: shipment.id,
          patientId: shipment.patientId,
          daysUntilDue: shipment.daysUntilDue,
        });
      } catch (err) {
        errors++;
        logger.error('[CRON shipment-reminders] Failed to send reminder', {
          refillId: shipment.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    const duration = Date.now() - startTime;

    const result = {
      success: true,
      duration,
      shipmentsChecked: shipments.length,
      remindersSent: sent,
      errors,
    };

    logger.info('[CRON shipment-reminders] Completed', result);

    return NextResponse.json(result);
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';

    logger.error('[CRON shipment-reminders] Fatal error', {
      error: message,
      duration,
    });

    return handleApiError(error, { route: 'GET /api/cron/shipment-reminders' });
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
