/**
 * Lead-to-Patient Transition Service
 *
 * Handles the transition from LEAD -> ACTIVE profile status when a patient
 * completes their intake form. This is the bridge between the intake engine
 * and the dual portal experience.
 *
 * @module domains/intake/services/lead-transition
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { NotFoundError, ForbiddenError } from '@/domains/shared/errors/AppError';
import { domainEvents, DOMAIN_EVENTS } from '@/lib/events/domain-event-bus';

interface TransitionResult {
  success: boolean;
  previousStatus: string;
  newStatus: string;
  patientId: number;
}

/**
 * Transition a patient from LEAD to ACTIVE after intake completion.
 * Uses a Serializable transaction to prevent race conditions.
 */
export async function transitionLeadToActive(
  patientId: number,
  clinicId: number,
): Promise<TransitionResult> {
  const result = await prisma.$transaction(async (tx) => {
    const patient = await tx.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true, profileStatus: true },
    });

    if (!patient) {
      throw new NotFoundError(`Patient ${patientId} not found`);
    }

    if (patient.clinicId !== clinicId) {
      throw new ForbiddenError('Clinic ID mismatch — cannot transition patient across clinics');
    }

    const previousStatus = patient.profileStatus;

    if (previousStatus === 'ACTIVE') {
      return {
        success: true,
        previousStatus,
        newStatus: 'ACTIVE',
        patientId,
      };
    }

    if (previousStatus !== 'LEAD' && previousStatus !== 'PENDING_COMPLETION') {
      logger.warn('Unexpected profile status during lead transition', {
        patientId,
        currentStatus: previousStatus,
      });
    }

    await tx.patient.update({
      where: { id: patientId },
      data: { profileStatus: 'ACTIVE' },
    });

    logger.info('Patient transitioned from LEAD to ACTIVE', {
      patientId,
      previousStatus,
      clinicId,
    });

    return {
      success: true,
      previousStatus,
      newStatus: 'ACTIVE',
      patientId,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result.success && result.previousStatus !== 'ACTIVE') {
    domainEvents.publish({
      type: DOMAIN_EVENTS.INTAKE_COMPLETED,
      payload: { patientId, clinicId, previousStatus: result.previousStatus },
      metadata: {
        userId: String(patientId),
        clinicId: String(clinicId),
        timestamp: new Date(),
        correlationId: `lead-transition-${patientId}-${Date.now()}`,
      },
    }).catch((err: unknown) => {
      logger.warn('Failed to publish INTAKE_COMPLETED event', {
        patientId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    });
  }

  return result;
}

/**
 * Check if a patient should be shown the lead portal.
 * Returns true if the patient has LEAD or PENDING_COMPLETION status
 * and has not completed any intake forms.
 */
export async function shouldShowLeadPortal(
  patientId: number,
  clinicId?: number,
): Promise<boolean> {
  const where: { id: number; clinicId?: number } = { id: patientId };
  if (clinicId) where.clinicId = clinicId;

  const patient = await prisma.patient.findFirst({
    where,
    select: {
      profileStatus: true,
      _count: {
        select: {
          intakeSubmissions: { where: { status: 'completed' } },
        },
      },
    },
  });

  if (!patient) return false;

  const isLeadStatus =
    patient.profileStatus === 'LEAD' ||
    patient.profileStatus === 'PENDING_COMPLETION';

  return isLeadStatus && patient._count.intakeSubmissions === 0;
}
