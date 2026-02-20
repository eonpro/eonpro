import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PaymentStatus } from '@prisma/client';
import { encryptCardData } from '@/lib/encryption';
import crypto from 'crypto';
import { processPaymentForCommission } from '@/services/affiliate/affiliateCommissionService';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

interface PaymentDetails {
  cardNumber: string;
  cardholderName: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  billingZip: string;
  cardBrand: string;
  saveCard: boolean;
}

interface SubscriptionInfo {
  planId: string;
  planName: string;
  interval: string;
  intervalCount: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { patientId, amount, description, paymentDetails, paymentMethodId: savedPaymentMethodId, subscription, notes } = body;

    if (!patientId || !amount || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!paymentDetails && !savedPaymentMethodId) {
      return NextResponse.json(
        { error: 'Either paymentDetails or paymentMethodId is required' },
        { status: 400 }
      );
    }

    const patient = await prisma.patient.findUnique({
      where: { id: parseInt(patientId) },
      include: { paymentMethods: true },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // --- Saved card path ---
    if (savedPaymentMethodId) {
      const existingMethod = await prisma.paymentMethod.findFirst({
        where: {
          id: typeof savedPaymentMethodId === 'string' ? parseInt(savedPaymentMethodId) : savedPaymentMethodId,
          patientId: patient.id,
          isActive: true,
        },
      });

      if (!existingMethod) {
        return NextResponse.json({ error: 'Payment method not found or inactive' }, { status: 404 });
      }

      const result = await prisma.$transaction(async (tx) => {
        let subscriptionId: number | null = null;

        if (subscription) {
          const subscriptionInfo = subscription as SubscriptionInfo;
          const now = new Date();
          const periodEnd = new Date(now);
          const totalMonths = subscriptionInfo.intervalCount *
            (subscriptionInfo.interval === 'year' ? 12 : subscriptionInfo.interval === 'month' ? 1 : 1);
          periodEnd.setMonth(periodEnd.getMonth() + (totalMonths || 1));

          const createdSubscription = await tx.subscription.create({
            data: {
              patientId: patient.id,
              planId: subscriptionInfo.planId,
              planName: subscriptionInfo.planName,
              planDescription: description,
              amount,
              interval: subscriptionInfo.interval,
              intervalCount: subscriptionInfo.intervalCount,
              startDate: now,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              nextBillingDate: periodEnd,
              paymentMethodId: existingMethod.id,
            },
          });

          subscriptionId = createdSubscription.id;

          const currentTags = (patient.tags as string[]) || [];
          const subscriptionTag = `subscription-${subscriptionInfo.planName.toLowerCase().replace(/\s+/g, '-')}`;

          if (!currentTags.includes(subscriptionTag)) {
            await tx.patient.update({
              where: { id: patient.id },
              data: {
                tags: [...currentTags, subscriptionTag, 'active-subscription'],
              },
            });
          }
        }

        const payment = await tx.payment.create({
          data: {
            patientId: patient.id,
            amount,
            status: PaymentStatus.SUCCEEDED,
            paymentMethod: `Card ending ${existingMethod.cardLast4}`,
            description,
            notes,
            subscriptionId,
            metadata: {
              cardBrand: existingMethod.cardBrand,
              paymentMethodId: existingMethod.id,
              subscriptionId,
              planId: subscription?.planId,
              usedSavedCard: true,
            } as any,
          },
        });

        await tx.paymentMethod.update({
          where: { id: existingMethod.id },
          data: { lastUsedAt: new Date() },
        });

        return { payment, paymentMethodId: existingMethod.id, subscriptionId };
      }, { timeout: 15000 });

      const { payment } = result;

      let commissionProcessed = false;
      try {
        const priorPaymentCount = await prisma.payment.count({
          where: {
            patientId: patient.id,
            status: PaymentStatus.SUCCEEDED,
            id: { not: payment.id },
          },
        });
        const isFirstPayment = priorPaymentCount === 0;

        const commissionResult = await processPaymentForCommission({
          clinicId: patient.clinicId,
          patientId: patient.id,
          stripeEventId: `payment-${payment.id}`,
          stripeObjectId: payment.id.toString(),
          stripeEventType: 'payment.succeeded',
          amountCents: Math.round(amount * 100),
          occurredAt: new Date(),
          isFirstPayment,
          isRecurring: !!subscription,
          recurringMonth: undefined,
          productSku: subscription?.planId,
          productCategory: subscription?.planName,
        });

        commissionProcessed = commissionResult.success && !commissionResult.skipped;
        if (commissionProcessed) {
          logger.info('[PaymentProcess] Affiliate commission created', {
            paymentId: payment.id,
            patientId: patient.id,
            commissionEventId: commissionResult.commissionEventId,
          });
        }
      } catch (commissionError) {
        logger.warn('[PaymentProcess] Affiliate commission processing failed (non-blocking)', {
          paymentId: payment.id,
          patientId: patient.id,
          error: commissionError instanceof Error ? commissionError.message : 'Unknown',
        });
      }

      return NextResponse.json({
        success: true,
        payment,
        paymentMethodSaved: false,
        subscriptionCreated: !!result.subscriptionId,
        commissionProcessed,
      });
    }

    // --- New card path (original flow) ---
    const {
      cardNumber,
      cardholderName,
      expiryMonth,
      expiryYear,
      cvv,
      billingZip,
      cardBrand,
      saveCard,
    } = paymentDetails as PaymentDetails;

    const cardLast4 = cardNumber.slice(-4);
    const encryptionKeyId = crypto.randomBytes(16).toString('hex');

    const result = await prisma.$transaction(async (tx) => {
      let paymentMethodId: number | null = null;
      let subscriptionId: number | null = null;

      if (saveCard || subscription) {
        const encryptedCardNumber = encryptCardData(cardNumber);
        const encryptedCvv = encryptCardData(cvv);

        const paymentMethod = await tx.paymentMethod.create({
          data: {
            patientId: patient.id,
            encryptedCardNumber,
            cardLast4,
            cardBrand: cardBrand || 'Unknown',
            expiryMonth,
            expiryYear,
            cardholderName,
            encryptedCvv,
            billingZip,
            isDefault: patient.paymentMethods.length === 0,
            isActive: true,
            encryptionKeyId,
            fingerprint: crypto.createHash('sha256').update(cardNumber).digest('hex'),
            lastUsedAt: new Date(),
          },
        });

        paymentMethodId = paymentMethod.id;
      }

      if (subscription) {
        const subscriptionInfo = subscription as SubscriptionInfo;
        const now = new Date();
        const periodEnd = new Date(now);
        const totalMonths = subscriptionInfo.intervalCount *
          (subscriptionInfo.interval === 'year' ? 12 : subscriptionInfo.interval === 'month' ? 1 : 1);
        periodEnd.setMonth(periodEnd.getMonth() + (totalMonths || 1));

        const createdSubscription = await tx.subscription.create({
          data: {
            patientId: patient.id,
            planId: subscriptionInfo.planId,
            planName: subscriptionInfo.planName,
            planDescription: description,
            amount,
            interval: subscriptionInfo.interval,
            intervalCount: subscriptionInfo.intervalCount,
            startDate: now,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            nextBillingDate: periodEnd,
            paymentMethodId: paymentMethodId!,
          },
        });

        subscriptionId = createdSubscription.id;

        const currentTags = (patient.tags as string[]) || [];
        const subscriptionTag = `subscription-${subscriptionInfo.planName.toLowerCase().replace(/\s+/g, '-')}`;

        if (!currentTags.includes(subscriptionTag)) {
          await tx.patient.update({
            where: { id: patient.id },
            data: {
              tags: [...currentTags, subscriptionTag, 'active-subscription'],
            },
          });
        }
      }

      const payment = await tx.payment.create({
        data: {
          patientId: patient.id,
          amount,
          status: PaymentStatus.SUCCEEDED,
          paymentMethod: `Card ending ${cardLast4}`,
          description,
          notes,
          subscriptionId,
          metadata: {
            cardBrand,
            paymentMethodId,
            subscriptionId,
            planId: subscription?.planId,
          } as any,
        },
      });

      if (paymentMethodId) {
        await tx.paymentMethod.update({
          where: { id: paymentMethodId },
          data: { lastUsedAt: new Date() },
        });
      }

      return { payment, paymentMethodId, subscriptionId };
    }, { timeout: 15000 });

    const { payment, paymentMethodId, subscriptionId } = result;

    // Process affiliate commission if this patient was referred by an affiliate
    let commissionProcessed = false;
    try {
      // Determine if this is the patient's first succeeded payment
      const priorPaymentCount = await prisma.payment.count({
        where: {
          patientId: patient.id,
          status: PaymentStatus.SUCCEEDED,
          id: { not: payment.id }, // Exclude the payment we just created
        },
      });
      const isFirstPayment = priorPaymentCount === 0;

      const commissionResult = await processPaymentForCommission({
        clinicId: patient.clinicId,
        patientId: patient.id,
        stripeEventId: `payment-${payment.id}`, // Idempotency key
        stripeObjectId: payment.id.toString(),
        stripeEventType: 'payment.succeeded',
        amountCents: Math.round(amount * 100), // Convert dollars to cents if needed
        occurredAt: new Date(),
        isFirstPayment,
        isRecurring: !!subscription,
        recurringMonth: isFirstPayment ? undefined : undefined,
        productSku: subscription?.planId,
        productCategory: subscription?.planName,
      });

      commissionProcessed = commissionResult.success && !commissionResult.skipped;
      if (commissionProcessed) {
        logger.info('[PaymentProcess] Affiliate commission created', {
          paymentId: payment.id,
          patientId: patient.id,
          commissionEventId: commissionResult.commissionEventId,
        });
      }
    } catch (commissionError) {
      // Commission failure should never block the payment response
      logger.warn('[PaymentProcess] Affiliate commission processing failed (non-blocking)', {
        paymentId: payment.id,
        patientId: patient.id,
        error: commissionError instanceof Error ? commissionError.message : 'Unknown',
      });
    }

    return NextResponse.json({
      success: true,
      payment,
      paymentMethodSaved: saveCard || !!subscription,
      subscriptionCreated: !!subscriptionId,
      commissionProcessed,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      'Error processing payment:',
      error instanceof Error ? error : new Error(errorMessage)
    );
    return NextResponse.json(
      { error: errorMessage || 'Failed to process payment' },
      { status: 500 }
    );
  }
}
