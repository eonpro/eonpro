/**
 * Pause Subscription API
 * POST /api/patient-portal/subscription/pause
 *
 * Pauses the patient's active subscription via Stripe + local DB.
 * Holds all active refills until resumed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';
import { pauseSubscription } from '@/services/subscription/subscriptionLifecycleService';
import { prisma } from '@/lib/db';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';

const pauseSchema = z.object({
  reason: z.string().max(500).optional(),
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
    const parsed = pauseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { reason } = parsed.data;

    // Find the patient's active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        patientId: user.patientId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 404 }
      );
    }

    const result = await pauseSubscription({
      subscriptionId: subscription.id,
      reason,
      pausedBy: user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to pause subscription' },
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
        action: 'portal_subscription_pause',
        outcome: 'SUCCESS',
        details: { reason },
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to create HIPAA audit log for subscription pause', {
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
      route: 'POST /api/patient-portal/subscription/pause',
      context: { userId: user?.id, patientId: user?.patientId },
    });
  }
}

export const POST = withAuth(handler, { roles: ['patient'] });
