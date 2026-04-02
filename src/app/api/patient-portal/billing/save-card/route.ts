/**
 * Patient Portal – Save Card
 * After Stripe.js confirms a SetupIntent, persists the resulting PaymentMethod
 * reference. Only stores Stripe token + display info (last4, brand). No raw card
 * data (PCI DSS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { getStripeForClinic } from '@/lib/stripe/connect';

const requestSchema = z.object({
  stripePaymentMethodId: z.string().min(1),
  setAsDefault: z.boolean().optional().default(false),
});

export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { stripePaymentMethodId, setAsDefault } = parsed.data;

    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: { id: true, clinicId: true },
    });

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found', code: 'PATIENT_NOT_FOUND' },
        { status: 404 }
      );
    }

    const stripeContext = await getStripeForClinic(patient.clinicId);
    const stripe = stripeContext.stripe;
    const connectOpts = stripeContext.stripeAccountId
      ? { stripeAccount: stripeContext.stripeAccountId }
      : undefined;

    const pm = connectOpts
      ? await stripe.paymentMethods.retrieve(stripePaymentMethodId, connectOpts)
      : await stripe.paymentMethods.retrieve(stripePaymentMethodId);

    const existing = await prisma.paymentMethod.findFirst({
      where: { stripePaymentMethodId, patientId: patient.id, isActive: true },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        card: {
          id: existing.id,
          last4: existing.cardLast4,
          brand: existing.cardBrand,
          expMonth: existing.expiryMonth,
          expYear: existing.expiryYear,
          isDefault: existing.isDefault,
        },
      });
    }

    const existingCards = await prisma.paymentMethod.count({
      where: { patientId: patient.id, isActive: true },
    });
    const shouldBeDefault = setAsDefault || existingCards === 0;

    if (shouldBeDefault) {
      await prisma.paymentMethod.updateMany({
        where: { patientId: patient.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const saved = await prisma.paymentMethod.create({
      data: {
        patientId: patient.id,
        clinicId: patient.clinicId,
        stripePaymentMethodId,
        cardLast4: pm.card?.last4 || '????',
        cardBrand: pm.card?.brand
          ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
          : 'Unknown',
        expiryMonth: pm.card?.exp_month || null,
        expiryYear: pm.card?.exp_year || null,
        cardholderName: pm.billing_details?.name || null,
        billingZip: pm.billing_details?.address?.postal_code || null,
        isDefault: shouldBeDefault,
        encryptionKeyId: 'stripe',
      },
    });

    logger.info('[Portal SaveCard] Payment method saved', {
      patientId: patient.id,
      paymentMethodId: saved.id,
    });

    try {
      await auditLog(req, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId ?? undefined,
        eventType: AuditEventType.PHI_UPDATE,
        resourceType: 'PaymentMethod',
        resourceId: String(saved.id),
        patientId: patient.id,
        action: 'portal_add_payment_method',
        outcome: 'SUCCESS',
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to create audit log for card save', {
        patientId: patient.id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({
      success: true,
      card: {
        id: saved.id,
        last4: saved.cardLast4,
        brand: saved.cardBrand,
        expMonth: saved.expiryMonth,
        expYear: saved.expiryYear,
        isDefault: saved.isDefault,
      },
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'POST /api/patient-portal/billing/save-card',
      context: { patientId: user?.patientId },
    });
  }
}, { roles: ['patient'] });
