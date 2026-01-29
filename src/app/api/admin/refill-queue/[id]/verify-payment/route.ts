/**
 * Admin Refill Payment Verification API
 * 
 * POST /api/admin/refill-queue/[id]/verify-payment - Verify payment for refill
 * 
 * @security Admin or Super Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { logger } from '@/lib/logger';
import {
  getRefillById,
  verifyPayment,
  autoMatchPaymentForRefill,
} from '@/services/refill';
import type { PaymentVerificationMethod } from '@prisma/client';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST - Verify payment for refill
export const POST = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  context: RouteContext
) => {
  try {
    const { id } = await context.params;
    const refillId = parseInt(id);

    if (isNaN(refillId)) {
      return NextResponse.json({ error: 'Invalid refill ID' }, { status: 400 });
    }

    const refill = await getRefillById(refillId);

    if (!refill) {
      return NextResponse.json({ error: 'Refill not found' }, { status: 404 });
    }

    // Check clinic access
    if (user.role !== 'super_admin' && refill.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if already verified
    if (refill.paymentVerified) {
      return NextResponse.json(
        { error: 'Payment already verified' },
        { status: 400 }
      );
    }

    // Check status
    if (refill.status !== 'PENDING_PAYMENT') {
      return NextResponse.json(
        { error: `Cannot verify payment for refill in status: ${refill.status}` },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { method, paymentReference, stripePaymentId, invoiceId, autoMatch } = body;

    // If autoMatch is requested, try to auto-match payment
    if (autoMatch) {
      const matched = await autoMatchPaymentForRefill(refillId);
      if (matched) {
        const updatedRefill = await getRefillById(refillId);
        return NextResponse.json({
          success: true,
          autoMatched: true,
          refill: updatedRefill,
        });
      }
      return NextResponse.json(
        { success: false, autoMatched: false, error: 'No matching payment found' },
        { status: 200 }
      );
    }

    // Validate method
    const validMethods: PaymentVerificationMethod[] = [
      'STRIPE_AUTO',
      'MANUAL_VERIFIED',
      'EXTERNAL_REFERENCE',
      'PAYMENT_SKIPPED',
    ];

    if (!method || !validMethods.includes(method)) {
      return NextResponse.json(
        { error: `Invalid method. Use one of: ${validMethods.join(', ')}` },
        { status: 400 }
      );
    }

    // Require reference for external payments
    if (method === 'EXTERNAL_REFERENCE' && !paymentReference) {
      return NextResponse.json(
        { error: 'Payment reference required for external payments' },
        { status: 400 }
      );
    }

    const updatedRefill = await verifyPayment({
      refillId,
      method,
      verifiedBy: user.id,
      paymentReference,
      stripePaymentId,
      invoiceId,
    });

    logger.info('[Admin RefillQueue] Payment verified', {
      refillId,
      method,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      refill: updatedRefill,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Admin RefillQueue] Error verifying payment', { error: message });
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}, { roles: ['super_admin', 'admin'] });
