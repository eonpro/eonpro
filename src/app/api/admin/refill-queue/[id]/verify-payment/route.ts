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
import { handleApiError, BadRequestError, NotFoundError, ForbiddenError } from '@/domains/shared/errors';
import { getRefillById, verifyPayment, autoMatchPaymentForRefill } from '@/services/refill';
import type { PaymentVerificationMethod } from '@prisma/client';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST - Verify payment for refill
export const POST = withAuthParams(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { id } = await context.params;
      const refillId = parseInt(id);

      if (isNaN(refillId)) {
        throw new BadRequestError('Invalid refill ID');
      }

      const refill = await getRefillById(refillId);

      if (!refill) {
        throw new NotFoundError('Refill not found');
      }

      // Check clinic access
      if (user.role !== 'super_admin' && refill.clinicId !== user.clinicId) {
        throw new ForbiddenError('Access denied');
      }

      // Check if already verified
      if (refill.paymentVerified) {
        throw new BadRequestError('Payment already verified');
      }

      // Check status
      if (refill.status !== 'PENDING_PAYMENT') {
        throw new BadRequestError(`Cannot verify payment for refill in status: ${refill.status}`);
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
        throw new BadRequestError(`Invalid method. Use one of: ${validMethods.join(', ')}`);
      }

      // Require reference for external payments
      if (method === 'EXTERNAL_REFERENCE' && !paymentReference) {
        throw new BadRequestError('Payment reference required for external payments');
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
      return handleApiError(error, { route: 'POST /api/admin/refill-queue/[id]/verify-payment' });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
