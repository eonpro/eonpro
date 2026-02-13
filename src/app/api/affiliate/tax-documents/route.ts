/**
 * Affiliate Tax Documents API
 *
 * Handles W-9/W-8BEN tax document submission and verification.
 * Required for affiliates earning > $600/year.
 *
 * GET  - List affiliate's tax documents
 * POST - Submit new tax document
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    if (!user.affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    const documents = await prisma.affiliateTaxDocument.findMany({
      where: { affiliateId: user.affiliateId },
      orderBy: [{ taxYear: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        documentType: true,
        taxYear: true,
        status: true,
        submittedAt: true,
        verifiedAt: true,
        rejectedAt: true,
        rejectionReason: true,
        expiresAt: true,
        taxIdLast4: true,
        legalName: true,
        businessName: true,
        taxClassification: true,
      },
    });

    // Check if tax doc is required
    const currentYear = new Date().getFullYear();
    const ytdPayouts = await prisma.affiliatePayout.aggregate({
      where: {
        affiliateId: user.affiliateId,
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(currentYear, 0, 1),
        },
      },
      _sum: { netAmountCents: true },
    });

    const pendingCommissions = await prisma.affiliateCommissionEvent.aggregate({
      where: {
        affiliateId: user.affiliateId,
        status: { in: ['PENDING', 'APPROVED'] },
      },
      _sum: { commissionAmountCents: true },
    });

    const ytdEarnings =
      (ytdPayouts._sum.netAmountCents || 0) + (pendingCommissions._sum.commissionAmountCents || 0);

    const taxDocRequired = ytdEarnings >= 60000; // $600

    const hasValidDoc = documents.some(
      (doc: (typeof documents)[number]) => doc.taxYear === currentYear && doc.status === 'VERIFIED'
    );

    return NextResponse.json({
      documents,
      requirements: {
        taxDocRequired,
        hasValidDoc,
        ytdEarningsCents: ytdEarnings,
        thresholdCents: 60000,
        currentYear,
      },
    });
  } catch (error) {
    logger.error('[TaxDocs] Error listing documents', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to list tax documents' }, { status: 500 });
  }
}

async function handlePost(request: NextRequest, user: AuthUser) {
  try {
    if (!user.affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    const body = await request.json();
    const {
      documentType,
      taxYear,
      legalName,
      businessName,
      taxIdLast4,
      taxIdType,
      taxClassification,
      address,
      certificationAccepted,
    } = body;

    // Validate required fields
    if (!documentType || !taxYear || !legalName || !taxIdLast4 || !certificationAccepted) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate document type
    if (!['W9', 'W8BEN', 'W8BENE'].includes(documentType)) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
    }

    // Validate tax ID format (last 4 digits)
    if (!/^\d{4}$/.test(taxIdLast4)) {
      return NextResponse.json({ error: 'Tax ID last 4 must be 4 digits' }, { status: 400 });
    }

    // Check for existing document for this year
    const existing = await prisma.affiliateTaxDocument.findFirst({
      where: {
        affiliateId: user.affiliateId,
        documentType,
        taxYear,
        status: { in: ['SUBMITTED', 'VERIFIED'] },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A valid tax document already exists for this year' },
        { status: 409 }
      );
    }

    // Calculate expiry (tax docs valid for 3 years for W-8, 1 year for recertification)
    const expiresAt = new Date();
    if (documentType.startsWith('W8')) {
      expiresAt.setFullYear(expiresAt.getFullYear() + 3);
    } else {
      // W-9 doesn't technically expire but we'll set 5 years
      expiresAt.setFullYear(expiresAt.getFullYear() + 5);
    }

    // Create document record
    const document = await prisma.affiliateTaxDocument.create({
      data: {
        affiliateId: user.affiliateId,
        documentType,
        taxYear,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        expiresAt,
        legalName,
        businessName,
        taxIdLast4,
        taxIdType,
        taxClassification,
        address,
      },
    });

    logger.info('[TaxDocs] Tax document submitted', {
      documentId: document.id,
      affiliateId: user.affiliateId,
      documentType,
      taxYear,
    });

    // In a real implementation, you might:
    // 1. Store the actual document (encrypted) in S3
    // 2. Trigger TIN verification with IRS
    // 3. Send notification to admin for review

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        documentType: document.documentType,
        taxYear: document.taxYear,
        status: document.status,
        submittedAt: document.submittedAt,
        expiresAt: document.expiresAt,
      },
    });
  } catch (error) {
    logger.error('[TaxDocs] Error submitting document', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to submit tax document' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(handleGet);

export const POST = withAffiliateAuth(handlePost);
