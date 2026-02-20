/**
 * Resume Subscription API
 * POST /api/patient-portal/subscription/resume
 *
 * Resumes a paused subscription via Stripe + local DB.
 * Schedules the next refill.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { resumeSubscription } from '@/services/subscription/subscriptionLifecycleService';
import { prisma } from '@/lib/db';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';

async function handler(req: NextRequest, user: AuthUser) {
  try {
    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    // Find the patient's paused subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        patientId: user.patientId,
        status: 'PAUSED',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'No paused subscription found' },
        { status: 404 }
      );
    }

    const result = await resumeSubscription({
      subscriptionId: subscription.id,
      resumedBy: user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to resume subscription' },
        { status: 500 }
      );
    }

    try {
      await auditLog(req, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId ?? undefined,
        eventType: AuditEventType.UPDATE,
        resourceType: 'Subscription',
        resourceId: String(subscription.id),
        patientId: user.patientId,
        action: 'portal_subscription_resume',
        outcome: 'SUCCESS',
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to create HIPAA audit log for subscription resume', {
        patientId: user.patientId,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({
      success: true,
      subscription: result.subscription,
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'POST /api/patient-portal/subscription/resume',
      context: { userId: user?.id, patientId: user?.patientId },
    });
  }
}

export const POST = withAuth(handler, { roles: ['patient'] });
