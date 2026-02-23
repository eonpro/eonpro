/**
 * Manual Subscription Enrollment API
 *
 * POST /api/patients/[id]/subscriptions/manual
 *
 * Creates a local-only subscription (no Stripe) for EMR transition patients.
 * Optionally queues a refill entry for admin review.
 *
 * @security Admin, Super Admin, or Provider
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { ensureTenantResource, tenantNotFoundResponse } from '@/lib/tenant-response';
import { getPlanById } from '@/config/billingPlans';
import {
  triggerRefillForSubscriptionPayment,
  createManualRefillsForSubscription,
  REFILL_FREQUENCY_MONTHS,
  getRefillDefaultsForPlanDuration,
} from '@/services/refill/refillQueueService';

type Params = {
  params: Promise<{ id: string }>;
};

const manualEnrollHandler = withAuthParams(
  async (request: NextRequest, user, { params }: Params) => {
    try {
      const resolvedParams = await params;
      const patientId = parseInt(resolvedParams.id);

      if (isNaN(patientId)) {
        return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
      }

      const body = await request.json();
      const {
        planId,
        startDate,
        notes,
        queueRefill = true,
        refillCount: rawRefillCount,
        refillFrequency,
      } = body;

      if (!planId || typeof planId !== 'string') {
        return NextResponse.json({ error: 'planId is required' }, { status: 400 });
      }

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true, clinic: { select: { subdomain: true } } },
      });

      if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }

      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId ?? undefined;
      if (ensureTenantResource(patient, clinicId)) return tenantNotFoundResponse();

      const plan = getPlanById(planId, (patient as any).clinic?.subdomain);
      if (!plan) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }

      const now = new Date();
      const start = startDate ? new Date(startDate) : now;
      const months = plan.months || 1;
      const periodEnd = new Date(start);
      periodEnd.setMonth(periodEnd.getMonth() + months);

      const subscription = await prisma.$transaction(async (tx) => {
        const sub = await tx.subscription.create({
          data: {
            patientId,
            clinicId: patient.clinicId,
            planId: plan.id,
            planName: plan.name,
            planDescription: plan.description,
            status: 'ACTIVE',
            amount: plan.price,
            currency: 'usd',
            interval: 'month',
            intervalCount: months,
            startDate: start,
            currentPeriodStart: start,
            currentPeriodEnd: periodEnd,
            nextBillingDate: null,
            stripeSubscriptionId: null,
            vialCount: months <= 1 ? 1 : months <= 3 ? 3 : months <= 6 ? 6 : 12,
            metadata: { source: 'manual_enrollment', enrolledBy: user.id, notes: notes || null },
          },
        });

        await tx.subscriptionAction.create({
          data: {
            subscriptionId: sub.id,
            actionType: 'CREATED',
            reason: notes
              ? `Manual enrollment: ${notes}`
              : 'Manual enrollment (EMR transition)',
            performedBy: `${user.role}:${user.id}`,
          },
        });

        return sub;
      });

      // Smart defaults from plan duration when refill params omitted (6mo → 1 refill quarterly, 12mo → 3 refills quarterly, etc.)
      const planMonths = plan.months ?? 1;
      const defaults = getRefillDefaultsForPlanDuration(planMonths);
      const resolvedRefillCount = Math.min(
        24,
        Math.max(
          1,
          typeof rawRefillCount === 'number' ? Math.floor(rawRefillCount) : defaults.refillCount
        )
      );
      const resolvedRefillFrequency =
        typeof refillFrequency === 'string' && refillFrequency in REFILL_FREQUENCY_MONTHS
          ? refillFrequency
          : defaults.refillFrequency;
      const intervalMonths =
        REFILL_FREQUENCY_MONTHS[resolvedRefillFrequency as keyof typeof REFILL_FREQUENCY_MONTHS];
      let refills: { id: number; status: string }[] = [];
      if (queueRefill) {
        if (resolvedRefillCount > 1) {
          const created = await createManualRefillsForSubscription(
            subscription.id,
            resolvedRefillCount,
            start,
            intervalMonths
          );
          refills = created.map((r) => ({ id: r.id, status: r.status }));
        } else {
          const refill = await triggerRefillForSubscriptionPayment(
            subscription.id,
            undefined,
            undefined,
            'MANUAL_VERIFIED'
          );
          if (refill) refills = [{ id: refill.id, status: refill.status }];
        }
      }

      logger.info('[ManualEnrollment] Subscription created', {
        subscriptionId: subscription.id,
        patientId,
        planId: plan.id,
        queueRefill,
        refillCount: refills.length,
        userId: user.id,
      });

      return NextResponse.json({
        success: true,
        subscription: {
          id: subscription.id,
          planName: subscription.planName,
          status: subscription.status,
          startDate: subscription.startDate,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
        refills,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[ManualEnrollment] Error creating subscription', {
        error: errorMessage,
      });
      return NextResponse.json(
        { error: 'Failed to create subscription', detail: errorMessage },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin', 'provider'] }
);

export const POST = manualEnrollHandler;
