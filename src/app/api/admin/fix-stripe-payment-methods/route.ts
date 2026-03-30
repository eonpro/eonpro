import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { repairStripePaymentMethods } from '@/domains/patient/services/patient-merge.service';

const RepairSchema = z.object({
  patientId: z.number().positive(),
  fromStripeCustomerId: z.string().startsWith('cus_'),
});

/**
 * POST /api/admin/fix-stripe-payment-methods
 *
 * Repairs payment methods for a patient whose profile was merged before
 * the automatic Stripe PM migration was added. Moves all cards from
 * `fromStripeCustomerId` to the patient's current `stripeCustomerId`.
 */
async function postHandler(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = RepairSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { patientId, fromStripeCustomerId } = parsed.data;

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true, stripeCustomerId: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (!patient.stripeCustomerId) {
      return NextResponse.json(
        { error: 'Patient has no Stripe customer ID' },
        { status: 400 }
      );
    }

    if (patient.stripeCustomerId === fromStripeCustomerId) {
      return NextResponse.json(
        { error: 'fromStripeCustomerId is the same as the patient\'s current Stripe customer ID — nothing to migrate' },
        { status: 400 }
      );
    }

    logger.info('[ADMIN] Repairing Stripe payment methods', {
      adminUserId: user.id,
      patientId,
      fromStripeCustomerId,
      toStripeCustomerId: patient.stripeCustomerId,
    });

    const result = await repairStripePaymentMethods(
      patient.clinicId,
      patientId,
      fromStripeCustomerId,
      patient.stripeCustomerId
    );

    return NextResponse.json({
      success: true,
      patientId,
      fromStripeCustomerId,
      toStripeCustomerId: patient.stripeCustomerId,
      ...result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('[ADMIN] fix-stripe-payment-methods failed', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = withAdminAuth(postHandler);
