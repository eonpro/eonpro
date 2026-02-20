/**
 * Start Subscription API
 * POST /api/patient-portal/subscription/start
 *
 * Creates a new subscription for the patient with Stripe integration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';
import { createSubscription } from '@/services/subscription/subscriptionLifecycleService';
import { getPlanById } from '@/config/billingPlans';
import { prisma } from '@/lib/db';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';
import { vialCountFromPlanCategory } from '@/services/refill/refillQueueService';

const startSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  paymentMethodId: z.number().positive().optional(),
  stripePaymentMethodId: z.string().optional(),
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
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { planId, paymentMethodId, stripePaymentMethodId } = parsed.data;

    // Get patient's clinic for plan lookup
    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: { id: true, clinicId: true, clinic: { select: { subdomain: true } } },
    });

    if (!patient?.clinicId) {
      return NextResponse.json(
        { error: 'Patient clinic not found' },
        { status: 400 }
      );
    }

    // Check no active subscription exists
    const existing = await prisma.subscription.findFirst({
      where: {
        patientId: user.patientId,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'You already have an active subscription. Please cancel it first.' },
        { status: 409 }
      );
    }

    // Look up the plan
    const plan = getPlanById(planId, patient.clinic?.subdomain);
    if (!plan) {
      return NextResponse.json(
        { error: 'Plan not found', code: 'PLAN_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!plan.isRecurring) {
      return NextResponse.json(
        { error: 'This plan is not a recurring subscription' },
        { status: 400 }
      );
    }

    // Map plan months to interval
    let interval: 'month' | 'quarter' | 'semiannual' | 'year' = 'month';
    let intervalCount = 1;
    if (plan.months === 3) {
      interval = 'quarter';
      intervalCount = 3;
    } else if (plan.months === 6) {
      interval = 'semiannual';
      intervalCount = 6;
    } else if (plan.months === 12) {
      interval = 'year';
      intervalCount = 12;
    }

    const vialCount = vialCountFromPlanCategory(plan.category);

    const result = await createSubscription({
      patientId: user.patientId,
      clinicId: patient.clinicId,
      planId: plan.id,
      planName: plan.name,
      planDescription: plan.description,
      amount: plan.price,
      interval,
      intervalCount,
      vialCount,
      paymentMethodId,
      stripePaymentMethodId,
      metadata: {
        source: 'patient_portal',
        category: plan.category,
        dose: plan.dose || '',
      },
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to create subscription' },
        { status: 500 }
      );
    }

    try {
      await auditLog(req, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId ?? undefined,
        eventType: AuditEventType.CREATE,
        resourceType: 'Subscription',
        resourceId: String(result.subscription?.id),
        patientId: user.patientId,
        action: 'portal_subscription_start',
        outcome: 'SUCCESS',
        details: { planId: plan.id, planName: plan.name },
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to create HIPAA audit log for subscription start', {
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
      route: 'POST /api/patient-portal/subscription/start',
      context: { userId: user?.id, patientId: user?.patientId },
    });
  }
}

export const POST = withAuth(handler, { roles: ['patient'] });
