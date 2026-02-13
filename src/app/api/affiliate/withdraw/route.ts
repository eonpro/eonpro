/**
 * Affiliate Withdraw API
 *
 * GET - Get withdraw eligibility and payout method
 * POST - Request a withdrawal
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { AGGREGATION_TAKE } from '@/lib/pagination';

const MIN_WITHDRAWAL_CENTS = 5000; // $50 minimum

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    // Get available balance and payout method
    const [availableCommissions, payoutMethod, pendingPayout] = await Promise.all([
      prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId,
          status: 'APPROVED',
          payoutId: null,
        },
        _sum: { commissionAmountCents: true },
      }),
      prisma.affiliatePayoutMethod.findFirst({
        where: {
          affiliateId,
          isDefault: true,
          isVerified: true,
        },
        select: {
          id: true,
          methodType: true,
          bankAccountLast4: true,
          bankName: true,
          paypalEmail: true,
        },
      }),
      prisma.affiliatePayout.findFirst({
        where: {
          affiliateId,
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        select: {
          id: true,
          netAmountCents: true,
          createdAt: true,
          status: true,
        },
      }),
    ]);

    const availableBalance = availableCommissions._sum.commissionAmountCents || 0;

    return NextResponse.json({
      availableBalance,
      minWithdrawal: MIN_WITHDRAWAL_CENTS,
      payoutMethod: payoutMethod
        ? {
            type: payoutMethod.methodType === 'PAYPAL' ? 'paypal' : 'bank',
            last4: payoutMethod.bankAccountLast4,
            bankName: payoutMethod.bankName,
            email: payoutMethod.paypalEmail,
          }
        : null,
      pendingPayout: pendingPayout
        ? {
            amount: pendingPayout.netAmountCents,
            createdAt: pendingPayout.createdAt.toISOString(),
            status: pendingPayout.status,
          }
        : null,
    });
  } catch (error) {
    logger.error('[Affiliate Withdraw] GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to get withdraw data' }, { status: 500 });
  }
}

async function handlePost(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    const { amountCents } = await request.json();

    if (!amountCents || typeof amountCents !== 'number' || amountCents < MIN_WITHDRAWAL_CENTS) {
      return NextResponse.json(
        { error: `Minimum withdrawal is $${MIN_WITHDRAWAL_CENTS / 100}` },
        { status: 400 }
      );
    }

    // Get affiliate with clinic
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: {
        id: true,
        clinicId: true,
        displayName: true,
      },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Check for pending payout
    const pendingPayout = await prisma.affiliatePayout.findFirst({
      where: {
        affiliateId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    if (pendingPayout) {
      return NextResponse.json(
        { error: 'You already have a pending payout. Please wait for it to complete.' },
        { status: 400 }
      );
    }

    // Get payout method
    const payoutMethod = await prisma.affiliatePayoutMethod.findFirst({
      where: {
        affiliateId,
        isDefault: true,
        isVerified: true,
      },
    });

    if (!payoutMethod) {
      return NextResponse.json(
        { error: 'Please add a verified payout method first' },
        { status: 400 }
      );
    }

    // Get available commissions
    const availableCommissions = await prisma.affiliateCommissionEvent.findMany({
      where: {
        affiliateId,
        status: 'APPROVED',
        payoutId: null,
      },
      orderBy: { createdAt: 'asc' },
      take: AGGREGATION_TAKE,
      select: {
        id: true,
        commissionAmountCents: true,
      },
    });

    const totalAvailable = availableCommissions.reduce(
      (sum: number, c: { commissionAmountCents: number }) => sum + c.commissionAmountCents,
      0
    );

    if (amountCents > totalAvailable) {
      return NextResponse.json(
        { error: `Requested amount exceeds available balance of $${totalAvailable / 100}` },
        { status: 400 }
      );
    }

    // Create payout and assign commissions in a transaction
    const payout = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create payout record
      const newPayout = await tx.affiliatePayout.create({
        data: {
          clinicId: affiliate.clinicId,
          affiliateId,
          amountCents,
          feeCents: 0, // No fees
          netAmountCents: amountCents,
          currency: 'USD',
          methodType: payoutMethod.methodType,
          status: 'PENDING',
          notes: `Withdrawal requested by ${affiliate.displayName}`,
        },
      });

      // Assign commissions to this payout (up to the requested amount)
      let remainingAmount = amountCents;
      const commissionIds: number[] = [];

      for (const commission of availableCommissions) {
        if (remainingAmount <= 0) break;
        commissionIds.push(commission.id);
        remainingAmount -= commission.commissionAmountCents;
      }

      if (commissionIds.length > 0) {
        await tx.affiliateCommissionEvent.updateMany({
          where: { id: { in: commissionIds } },
          data: { payoutId: newPayout.id },
        });
      }

      return newPayout;
    });

    logger.info('[Affiliate Withdraw] Payout requested', {
      affiliateId,
      payoutId: payout.id,
      amountCents,
    });

    return NextResponse.json({
      success: true,
      payout: {
        id: payout.id,
        amount: payout.netAmountCents,
        status: payout.status,
      },
    });
  } catch (error) {
    logger.error('[Affiliate Withdraw] POST error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Withdrawal failed. Please try again.' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(handleGet);
export const POST = withAffiliateAuth(handlePost);
