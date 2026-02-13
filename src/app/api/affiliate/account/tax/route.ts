/**
 * Affiliate Tax Information API
 *
 * POST - Submit W-9 form
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
    const {
      legalName,
      businessName,
      taxClassification,
      taxId,
      taxIdType,
      address,
      city,
      state,
      zipCode,
      certify,
    } = body;

    // Validate required fields
    if (!legalName || !taxId || !address || !city || !state || !zipCode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!certify) {
      return NextResponse.json(
        { error: 'You must certify the information is correct' },
        { status: 400 }
      );
    }

    if (taxId.length !== 9) {
      return NextResponse.json({ error: 'Invalid tax ID number' }, { status: 400 });
    }

    // Create tax document record
    const taxDocument = await prisma.affiliateTaxDocument.create({
      data: {
        affiliateId,
        documentType: 'W9',
        taxYear: new Date().getFullYear(),
        status: 'PENDING', // Will be reviewed by admin
        submittedAt: new Date(),
        taxIdLast4: taxId.slice(-4),
        taxIdType: taxIdType === 'ein' ? 'EIN' : 'SSN',
        legalName,
        businessName: businessName || null,
        taxClassification: taxClassification || 'Individual',
        address: `${address}, ${city}, ${state} ${zipCode}`,
      },
    });

    logger.info('[Affiliate Tax] W-9 submitted', {
      affiliateId,
      documentId: taxDocument.id,
    });

    return NextResponse.json({
      success: true,
      documentId: taxDocument.id,
    });
  } catch (error) {
    logger.error('[Affiliate Tax] POST error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to submit W-9' }, { status: 500 });
  }
}

export const POST = withAffiliateAuth(handlePost);
