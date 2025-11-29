import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PaymentStatus } from '@prisma/client';
import { encryptCardData } from '@/lib/encryption';
import crypto from 'crypto';
import { processCommission } from '@/services/influencerService';
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
    const { 
      patientId, 
      amount, 
      description, 
      paymentDetails,
      subscription,
      notes 
    } = await request.json();

    if (!patientId || !amount || !description || !paymentDetails) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { 
      cardNumber, 
      cardholderName, 
      expiryMonth, 
      expiryYear, 
      cvv, 
      billingZip, 
      cardBrand,
      saveCard 
    } = paymentDetails as PaymentDetails;

    // Get or update patient
    const patient = await prisma.patient.findUnique({
      where: { id: parseInt(patientId) },
      include: { paymentMethods: true }
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    let paymentMethodId: number | null = null;
    const cardLast4 = cardNumber.slice(-4);
    const encryptionKeyId = crypto.randomBytes(16).toString('hex');

    // Save card if requested or if it's a subscription
    if (saveCard || subscription) {
      // Encrypt sensitive data
      const encryptedCardNumber = encryptCardData(cardNumber);
      const encryptedCvv = encryptCardData(cvv);
      
      // Create payment method
      const paymentMethod = await prisma.paymentMethod.create({
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
          lastUsedAt: new Date()
        }
      });
      
      paymentMethodId = paymentMethod.id;
    }

    // Create subscription if it's a recurring payment
    let subscriptionId: number | null = null;
    if (subscription) {
      const subscriptionInfo = subscription as SubscriptionInfo;
      const now = new Date();
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      
      const createdSubscription = await prisma.subscription.create({
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
          currentPeriodEnd: nextMonth,
          nextBillingDate: nextMonth,
          paymentMethodId: paymentMethodId!,
        }
      });
      
      subscriptionId = createdSubscription.id;

      // Add subscription hashtag to patient profile
      const currentTags = (patient.tags as string[]) || [];
      const subscriptionTag = `subscription-${subscriptionInfo.planName.toLowerCase().replace(/\s+/g, '-')}`;
      
      if (!currentTags.includes(subscriptionTag)) {
        await prisma.patient.update({
          where: { id: patient.id },
          data: {
            tags: [...currentTags, subscriptionTag, 'active-subscription']
          }
        });
      }
    }

    // Create payment record
    const payment = await prisma.payment.create({
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
        } as any
      }
    });

    // Update payment method last used date
    if (paymentMethodId) {
      await prisma.paymentMethod.update({
        where: { id: paymentMethodId },
        data: { lastUsedAt: new Date() }
      });
    }

    // TODO: Process commission for influencer referrals if there's an associated invoice
    // This should be handled when creating invoices through the proper flow
    let commissionProcessed = false;

    return NextResponse.json({ 
      success: true, 
      payment,
      paymentMethodSaved: saveCard || !!subscription,
      subscriptionCreated: !!subscription,
      commissionProcessed
    });
    
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error processing payment:', error);
    return NextResponse.json({ error: errorMessage || 'Failed to process payment' }, { status: 500 });
  }
}