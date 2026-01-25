/**
 * Affiliate Payout Method API
 * 
 * POST - Add or update payout method
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

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
    if (type === 'bank') {
      await prisma.affiliatePayoutMethod.create({
        data: {
          affiliateId,
          methodType: 'ACH',
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

export const POST = withAffiliateAuth(handlePost);
