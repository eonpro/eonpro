/**
 * Cancel Subscription API
 * POST /api/patient-portal/subscription/cancel
 *
 * Cancels the patient's subscription. Supports immediate cancellation
 * or cancellation at the end of the current billing period.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';
import { cancelSubscription } from '@/services/subscription/subscriptionLifecycleService';
import { prisma } from '@/lib/db';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';

const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
  cancelAtPeriodEnd: z.boolean().default(true),
});

async function handler(req: NextRequest, user: AuthUser) {
  try {
    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { reason, cancelAtPeriodEnd } = parsed.data;

    // Find the patient's active or paused subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        patientId: user.patientId,
        status: { in: ['ACTIVE', 'PAUSED', 'PAST_DUE'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'No active subscription found to cancel' },
        { status: 404 }
      );
    }

    const result = await cancelSubscription({
      subscriptionId: subscription.id,
      reason,
      canceledBy: user.id,
      cancelAtPeriodEnd,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to cancel subscription' },
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
        action: 'portal_subscription_cancel',
        outcome: 'SUCCESS',
        details: { reason, cancelAtPeriodEnd },
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to create HIPAA audit log for subscription cancel', {
        patientId: user.patientId,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({
      success: true,
      subscription: result.subscription,
      cancelAtPeriodEnd,
      message: cancelAtPeriodEnd
        ? 'Your subscription will be canceled at the end of the current billing period.'
        : 'Your subscription has been canceled immediately.',
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'POST /api/patient-portal/subscription/cancel',
      context: { userId: user?.id, patientId: user?.patientId },
    });
  }
}

export const POST = withAuth(handler, { roles: ['patient'] });
