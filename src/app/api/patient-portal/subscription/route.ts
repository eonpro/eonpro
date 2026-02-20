/**
 * Patient Subscription API
 * GET /api/patient-portal/subscription
 *
 * Returns the patient's current subscription with plan details,
 * next billing date, next refill date, and recent actions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { getActiveSubscriptionForPatient } from '@/services/subscription/subscriptionLifecycleService';
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

    const subscription = await getActiveSubscriptionForPatient(user.patientId);

    if (!subscription) {
      return NextResponse.json({
        subscription: null,
        hasActiveSubscription: false,
      });
    }

    const nextRefill = subscription.refillQueue?.[0] || null;

    try {
      await auditLog(req, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId ?? undefined,
        eventType: AuditEventType.PHI_VIEW,
        resourceType: 'Subscription',
        resourceId: String(subscription.id),
        patientId: user.patientId,
        action: 'portal_subscription_view',
        outcome: 'SUCCESS',
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to create HIPAA audit log for subscription view', {
        patientId: user.patientId,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        planId: subscription.planId,
        planName: subscription.planName,
        planDescription: subscription.planDescription,
        amount: subscription.amount,
        interval: subscription.interval,
        intervalCount: subscription.intervalCount,
        status: subscription.status,
        startDate: subscription.startDate.toISOString(),
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        nextBillingDate: subscription.nextBillingDate?.toISOString() || null,
        canceledAt: subscription.canceledAt?.toISOString() || null,
        pausedAt: subscription.pausedAt?.toISOString() || null,
        resumeAt: subscription.resumeAt?.toISOString() || null,
        vialCount: subscription.vialCount,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        nextRefill: nextRefill
          ? {
              id: nextRefill.id,
              status: nextRefill.status,
              nextRefillDate: nextRefill.nextRefillDate.toISOString(),
              medicationName: nextRefill.medicationName,
            }
          : null,
        recentActions: subscription.actions.map((a) => ({
          id: a.id,
          actionType: a.actionType,
          reason: a.reason,
          createdAt: a.createdAt.toISOString(),
        })),
      },
      hasActiveSubscription: true,
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/patient-portal/subscription',
      context: { userId: user?.id, patientId: user?.patientId },
    });
  }
}

export const GET = withAuth(handler, { roles: ['patient'] });
