/**
 * Affiliate Payout Service
 * 
 * Handles affiliate payouts via multiple methods:
 * - Stripe Connect (automated transfers)
 * - PayPal Payouts API
 * - Manual/bank wire (admin-processed)
 * 
 * Features:
 * - Minimum payout thresholds
 * - Tax document verification
 * - Batch processing
 * - Payout scheduling
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';

export interface PayoutRequest {
  clinicId: number;
  affiliateId: number;
  amountCents: number;
  methodType: 'STRIPE_CONNECT' | 'PAYPAL' | 'BANK_WIRE' | 'CHECK' | 'MANUAL';
  notes?: string;
  processedBy?: number;
}

export interface PayoutResult {
  success: boolean;
  payoutId?: number;
  externalId?: string;
  error?: string;
  status?: string;
}

export interface PayoutEligibility {
  eligible: boolean;
  reason?: string;
  availableAmountCents: number;
  minimumPayoutCents: number;
  hasTaxDocs: boolean;
  hasPayoutMethod: boolean;
}

// Get Stripe client
function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  return new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover',
    typescript: true,
  });
}

/**
 * Check if an affiliate is eligible for payout
 */
export async function checkPayoutEligibility(
  affiliateId: number,
  clinicId: number
): Promise<PayoutEligibility> {
  // Get affiliate's approved commission balance
  const approvedBalance = await prisma.affiliateCommissionEvent.aggregate({
    where: {
      affiliateId,
      clinicId,
      status: 'APPROVED',
      payoutId: null, // Not yet assigned to a payout
    },
    _sum: { commissionAmountCents: true },
    _count: true,
  });

  const availableAmountCents = approvedBalance._sum.commissionAmountCents || 0;

  // Get clinic's affiliate program settings for minimum payout
  const program = await prisma.affiliateProgram.findUnique({
    where: { clinicId },
    select: { minimumPayout: true },
  });

  const minimumPayoutCents = program?.minimumPayout || 5000; // Default $50

  // Check for valid tax documents (required for payouts > $600/year)
  const currentYear = new Date().getFullYear();
  const taxDoc = await prisma.affiliateTaxDocument.findFirst({
    where: {
      affiliateId,
      taxYear: currentYear,
      status: 'VERIFIED',
    },
  });

  // Calculate YTD payouts to determine if tax doc is required
  const ytdPayouts = await prisma.affiliatePayout.aggregate({
    where: {
      affiliateId,
      status: 'COMPLETED',
      completedAt: {
        gte: new Date(currentYear, 0, 1),
      },
    },
    _sum: { netAmountCents: true },
  });

  const ytdPaidCents = ytdPayouts._sum.netAmountCents || 0;
  const requiresTaxDoc = (ytdPaidCents + availableAmountCents) >= 60000; // $600

  const hasTaxDocs = !!taxDoc || !requiresTaxDoc;

  // Check for verified payout method
  const payoutMethod = await prisma.affiliatePayoutMethod.findFirst({
    where: {
      affiliateId,
      isVerified: true,
    },
  });

  const hasPayoutMethod = !!payoutMethod;

  // Determine eligibility
  let eligible = true;
  let reason: string | undefined;

  if (availableAmountCents < minimumPayoutCents) {
    eligible = false;
    reason = `Balance ($${(availableAmountCents/100).toFixed(2)}) below minimum payout ($${(minimumPayoutCents/100).toFixed(2)})`;
  } else if (!hasPayoutMethod) {
    eligible = false;
    reason = 'No verified payout method on file';
  } else if (!hasTaxDocs) {
    eligible = false;
    reason = 'Tax documents required but not verified';
  }

  return {
    eligible,
    reason,
    availableAmountCents,
    minimumPayoutCents,
    hasTaxDocs,
    hasPayoutMethod,
  };
}

/**
 * Create a payout via Stripe Connect
 */
async function processStripeConnectPayout(
  affiliate: {
    id: number;
    displayName: string;
  },
  payoutMethod: {
    stripeAccountId: string;
  },
  amountCents: number,
  clinicId: number
): Promise<PayoutResult> {
  const stripe = getStripeClient();

  try {
    // Create transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: payoutMethod.stripeAccountId,
      description: `Affiliate commission payout - ${affiliate.displayName}`,
      metadata: {
        affiliateId: affiliate.id.toString(),
        clinicId: clinicId.toString(),
        type: 'affiliate_payout',
      },
    });

    return {
      success: true,
      externalId: transfer.id,
      status: 'PROCESSING',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PayoutService] Stripe transfer failed', {
      affiliateId: affiliate.id,
      error: message,
    });
    return {
      success: false,
      error: message,
      status: 'FAILED',
    };
  }
}

/**
 * Create a payout via PayPal
 * Note: Requires PayPal Payouts API setup
 */
async function processPayPalPayout(
  affiliate: {
    id: number;
    displayName: string;
  },
  payoutMethod: {
    paypalEmail: string;
  },
  amountCents: number,
  clinicId: number
): Promise<PayoutResult> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const apiBase = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';

  if (!clientId || !clientSecret) {
    return {
      success: false,
      error: 'PayPal credentials not configured',
      status: 'FAILED',
    };
  }

  try {
    // Get access token
    const authResponse = await fetch(`${apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!authResponse.ok) {
      throw new Error('Failed to get PayPal access token');
    }

    const { access_token } = await authResponse.json();

    // Create payout
    const payoutResponse = await fetch(`${apiBase}/v1/payments/payouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: `aff_${affiliate.id}_${Date.now()}`,
          email_subject: 'You have received a commission payout',
          email_message: 'Thank you for being an affiliate partner!',
        },
        items: [
          {
            recipient_type: 'EMAIL',
            amount: {
              value: (amountCents / 100).toFixed(2),
              currency: 'USD',
            },
            note: `Commission payout for affiliate ${affiliate.displayName}`,
            sender_item_id: `payout_${affiliate.id}_${Date.now()}`,
            receiver: payoutMethod.paypalEmail,
          },
        ],
      }),
    });

    if (!payoutResponse.ok) {
      const errorData = await payoutResponse.json();
      throw new Error(errorData.message || 'PayPal payout failed');
    }

    const result = await payoutResponse.json();

    return {
      success: true,
      externalId: result.batch_header.payout_batch_id,
      status: 'PROCESSING',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[PayoutService] PayPal payout failed', {
      affiliateId: affiliate.id,
      error: message,
    });
    return {
      success: false,
      error: message,
      status: 'FAILED',
    };
  }
}

/**
 * Process a payout request
 */
export async function processPayout(request: PayoutRequest): Promise<PayoutResult> {
  const { clinicId, affiliateId, amountCents, methodType, notes, processedBy } = request;

  try {
    // Get affiliate
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: {
        id: true,
        displayName: true,
        status: true,
      },
    });

    if (!affiliate) {
      return { success: false, error: 'Affiliate not found' };
    }

    if (affiliate.status !== 'ACTIVE') {
      return { success: false, error: 'Affiliate is not active' };
    }

    // Get payout method
    const payoutMethod = await prisma.affiliatePayoutMethod.findFirst({
      where: {
        affiliateId,
        methodType,
        isVerified: true,
      },
    });

    if (!payoutMethod) {
      return { success: false, error: `No verified ${methodType} payout method found` };
    }

    // Get approved commissions to include in this payout
    const commissionEvents = await prisma.affiliateCommissionEvent.findMany({
      where: {
        affiliateId,
        clinicId,
        status: 'APPROVED',
        payoutId: null,
      },
      select: {
        id: true,
        commissionAmountCents: true,
      },
    });

    const totalAvailable = commissionEvents.reduce((sum: number, e: typeof commissionEvents[number]) => sum + e.commissionAmountCents, 0);

    if (totalAvailable < amountCents) {
      return {
        success: false,
        error: `Requested amount ($${amountCents/100}) exceeds available balance ($${totalAvailable/100})`,
      };
    }

    // Calculate processing fee (if any)
    const feeCents = methodType === 'BANK_WIRE' ? 2500 : 0; // $25 wire fee
    const netAmountCents = amountCents - feeCents;

    // Create payout record
    const payout = await prisma.affiliatePayout.create({
      data: {
        clinicId,
        affiliateId,
        amountCents,
        feeCents,
        netAmountCents,
        currency: 'USD',
        methodType,
        status: 'PROCESSING',
        processedAt: new Date(),
        processedBy,
        notes,
        periodStart: commissionEvents.length > 0 
          ? await prisma.affiliateCommissionEvent.findFirst({
              where: { id: { in: commissionEvents.map((e: typeof commissionEvents[number]) => e.id) } },
              orderBy: { occurredAt: 'asc' },
              select: { occurredAt: true },
            }).then((e: { occurredAt: Date } | null) => e?.occurredAt)
          : undefined,
        periodEnd: new Date(),
      },
    });

    // Assign commission events to this payout
    const eventIds = commissionEvents.map((e: typeof commissionEvents[number]) => e.id);
    let remainingAmount = amountCents;
    const assignedEventIds: number[] = [];

    for (const event of commissionEvents) {
      if (remainingAmount <= 0) break;
      assignedEventIds.push(event.id);
      remainingAmount -= event.commissionAmountCents;
    }

    await prisma.affiliateCommissionEvent.updateMany({
      where: { id: { in: assignedEventIds } },
      data: { payoutId: payout.id },
    });

    // Process based on method type
    let result: PayoutResult;

    switch (methodType) {
      case 'STRIPE_CONNECT':
        if (!payoutMethod.stripeAccountId) {
          result = { success: false, error: 'Stripe account not linked' };
        } else {
          result = await processStripeConnectPayout(
            affiliate,
            { stripeAccountId: payoutMethod.stripeAccountId },
            netAmountCents,
            clinicId
          );
        }
        break;

      case 'PAYPAL':
        if (!payoutMethod.paypalEmail) {
          result = { success: false, error: 'PayPal email not set' };
        } else {
          result = await processPayPalPayout(
            affiliate,
            { paypalEmail: payoutMethod.paypalEmail },
            netAmountCents,
            clinicId
          );
        }
        break;

      case 'BANK_WIRE':
      case 'CHECK':
      case 'MANUAL':
        // These require manual processing
        result = {
          success: true,
          status: 'AWAITING_APPROVAL',
        };
        break;

      default:
        result = { success: false, error: 'Unknown payout method' };
    }

    // Update payout with result - status is PayoutStatus enum
    const payoutStatus = result.success 
      ? (result.status as 'PROCESSING' | 'COMPLETED') 
      : 'FAILED';
    await prisma.affiliatePayout.update({
      where: { id: payout.id },
      data: {
        status: payoutStatus,
        stripeTransferId: methodType === 'STRIPE_CONNECT' ? result.externalId : undefined,
        paypalBatchId: methodType === 'PAYPAL' ? result.externalId : undefined,
        failedAt: result.success ? undefined : new Date(),
        failureReason: result.error,
      },
    });

    if (!result.success) {
      // Unassign commission events on failure
      await prisma.affiliateCommissionEvent.updateMany({
        where: { id: { in: assignedEventIds } },
        data: { payoutId: null },
      });
    }

    logger.info('[PayoutService] Payout processed', {
      payoutId: payout.id,
      affiliateId,
      amountCents,
      methodType,
      success: result.success,
    });

    return {
      ...result,
      payoutId: payout.id,
    };
  } catch (error) {
    logger.error('[PayoutService] Payout failed', {
      affiliateId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get payout history for an affiliate
 */
export async function getPayoutHistory(
  affiliateId: number,
  clinicId: number,
  options: { page?: number; limit?: number } = {}
) {
  const { page = 1, limit = 20 } = options;

  const [payouts, total] = await Promise.all([
    prisma.affiliatePayout.findMany({
      where: { affiliateId, clinicId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: {
          select: { commissionEvents: true },
        },
      },
    }),
    prisma.affiliatePayout.count({
      where: { affiliateId, clinicId },
    }),
  ]);

  return {
    payouts: payouts.map((p: typeof payouts[number]) => ({
      id: p.id,
      createdAt: p.createdAt,
      amountCents: p.amountCents,
      feeCents: p.feeCents,
      netAmountCents: p.netAmountCents,
      currency: p.currency,
      methodType: p.methodType,
      status: p.status,
      completedAt: p.completedAt,
      failureReason: p.failureReason,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      commissionCount: p._count.commissionEvents,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Mark a manual payout as completed
 */
export async function completeManualPayout(
  payoutId: number,
  reference: string,
  approvedBy: number
): Promise<boolean> {
  try {
    const payout = await prisma.affiliatePayout.findUnique({
      where: { id: payoutId },
      select: { status: true, methodType: true },
    });

    if (!payout || !['AWAITING_APPROVAL', 'PENDING'].includes(payout.status)) {
      return false;
    }

    await prisma.affiliatePayout.update({
      where: { id: payoutId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        approvedBy,
        wireReference: payout.methodType === 'BANK_WIRE' ? reference : undefined,
        checkNumber: payout.methodType === 'CHECK' ? reference : undefined,
      },
    });

    // Mark associated commission events as paid
    await prisma.affiliateCommissionEvent.updateMany({
      where: { payoutId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    logger.info('[PayoutService] Manual payout completed', {
      payoutId,
      reference,
      approvedBy,
    });

    return true;
  } catch (error) {
    logger.error('[PayoutService] Failed to complete manual payout', {
      payoutId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}
