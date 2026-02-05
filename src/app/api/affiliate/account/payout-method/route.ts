/**
 * Affiliate Payout Method API
 * 
 * GET - Get current payout method
 * POST - Add or update payout method
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

/**
 * GET - Retrieve the affiliate's current payout method
 */
async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    // Get the default (active) payout method
    const payoutMethod = await prisma.affiliatePayoutMethod.findFirst({
      where: {
        affiliateId,
        isDefault: true,
      },
      select: {
        id: true,
        methodType: true,
        isVerified: true,
        bankName: true,
        bankAccountLast4: true,
        bankRoutingLast4: true,
        bankCountry: true,
        paypalEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!payoutMethod) {
      return NextResponse.json({
        success: true,
        payoutMethod: null,
        message: 'No payout method configured',
      });
    }

    // Format response based on method type
    // BANK_WIRE is used for ACH/bank transfers in the PayoutMethodType enum
    const isBankTransfer = payoutMethod.methodType === 'BANK_WIRE' || payoutMethod.methodType === 'STRIPE_CONNECT';
    const response = {
      success: true,
      payoutMethod: {
        id: payoutMethod.id,
        type: isBankTransfer ? 'bank' : 'paypal',
        isVerified: payoutMethod.isVerified,
        createdAt: payoutMethod.createdAt,
        updatedAt: payoutMethod.updatedAt,
        ...(isBankTransfer
          ? {
              bankName: payoutMethod.bankName,
              accountLast4: payoutMethod.bankAccountLast4,
              routingLast4: payoutMethod.bankRoutingLast4,
              country: payoutMethod.bankCountry,
            }
          : {
              email: payoutMethod.paypalEmail,
            }),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('[Affiliate PayoutMethod] GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to retrieve payout method' },
      { status: 500 }
    );
  }
}

async function handlePost(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    const body = await request.json();
    const { type, accountHolderName, routingNumber, accountNumber, accountType, email } = body;

    // Validate required fields
    if (type === 'bank') {
      if (!accountHolderName || !routingNumber || !accountNumber) {
        return NextResponse.json(
          { error: 'Missing required bank account fields' },
          { status: 400 }
        );
      }
      if (routingNumber.length !== 9) {
        return NextResponse.json(
          { error: 'Invalid routing number' },
          { status: 400 }
        );
      }
    } else if (type === 'paypal') {
      if (!email) {
        return NextResponse.json(
          { error: 'PayPal email is required' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid payout method type' },
        { status: 400 }
      );
    }

    // Deactivate existing default payout methods
    await prisma.affiliatePayoutMethod.updateMany({
      where: {
        affiliateId,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });

    // Create new payout method
    // BANK_WIRE is the enum value for ACH/bank transfers
    if (type === 'bank') {
      await prisma.affiliatePayoutMethod.create({
        data: {
          affiliateId,
          methodType: 'BANK_WIRE',
          isDefault: true,
          isVerified: false,
          bankName: accountHolderName.split(' ')[0] + ' Bank', // Placeholder, would be looked up from routing number
          bankAccountLast4: accountNumber.slice(-4),
          bankRoutingLast4: routingNumber.slice(-4),
          bankCountry: 'US',
          // In production, encrypt full details
          encryptedDetails: JSON.stringify({
            accountHolderName,
            accountType,
          }),
        },
      });
    } else {
      await prisma.affiliatePayoutMethod.create({
        data: {
          affiliateId,
          methodType: 'PAYPAL',
          isDefault: true,
          isVerified: false,
          paypalEmail: email,
        },
      });
    }

    logger.info('[Affiliate PayoutMethod] Created', { affiliateId, type });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Affiliate PayoutMethod] POST error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to save payout method' },
      { status: 500 }
    );
  }
}

export const GET = withAffiliateAuth(handleGet);
export const POST = withAffiliateAuth(handlePost);
