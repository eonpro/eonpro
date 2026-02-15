/**
 * Affiliate Payout Method API
 *
 * GET - Get current payout method
 * POST - Add or update payout method
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { encryptPHI } from '@/lib/security/phi-encryption';
import { standardRateLimiter } from '@/lib/security/rate-limiter-redis';

const bankMethodSchema = z.object({
  type: z.literal('bank'),
  accountHolderName: z.string().min(1, 'Account holder name is required').max(200),
  routingNumber: z.string().length(9, 'Routing number must be 9 digits').regex(/^\d+$/, 'Routing number must be numeric'),
  accountNumber: z.string().min(4, 'Account number is required').max(17).regex(/^\d+$/, 'Account number must be numeric'),
  accountType: z.enum(['checking', 'savings']).optional(),
});

const paypalMethodSchema = z.object({
  type: z.literal('paypal'),
  email: z.string().email('Valid PayPal email is required'),
});

const payoutMethodSchema = z.discriminatedUnion('type', [bankMethodSchema, paypalMethodSchema]);

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
    const isBankTransfer =
      payoutMethod.methodType === 'BANK_WIRE' || payoutMethod.methodType === 'STRIPE_CONNECT';
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
    return NextResponse.json({ error: 'Failed to retrieve payout method' }, { status: 500 });
  }
}

async function handlePost(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    const rawBody = await request.json();
    const parsed = payoutMethodSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid payout method data' },
        { status: 400 }
      );
    }

    const { type } = parsed.data;
    const accountHolderName = type === 'bank' ? parsed.data.accountHolderName : undefined;
    const routingNumber = type === 'bank' ? parsed.data.routingNumber : undefined;
    const accountNumber = type === 'bank' ? parsed.data.accountNumber : undefined;
    const accountType = type === 'bank' ? parsed.data.accountType : undefined;
    const email = type === 'paypal' ? parsed.data.email : undefined;

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
      // Encrypt sensitive financial details at rest using PHI encryption utilities
      const encryptedBankDetails = JSON.stringify({
        accountHolderName: encryptPHI(accountHolderName!),
        routingNumber: encryptPHI(routingNumber!),
        accountNumber: encryptPHI(accountNumber!),
        accountType: accountType || 'checking',
      });

      await prisma.affiliatePayoutMethod.create({
        data: {
          affiliateId,
          methodType: 'BANK_WIRE',
          isDefault: true,
          isVerified: false,
          bankName: accountHolderName!.split(' ')[0] + ' Bank', // Placeholder
          bankAccountLast4: accountNumber!.slice(-4),
          bankRoutingLast4: routingNumber!.slice(-4),
          bankCountry: 'US',
          encryptedDetails: encryptedBankDetails,
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
    return NextResponse.json({ error: 'Failed to save payout method' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(handleGet);
export const POST = standardRateLimiter(withAffiliateAuth(handlePost));
