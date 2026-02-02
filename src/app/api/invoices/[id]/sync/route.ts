/**
 * Invoice Sync API
 * =================
 *
 * POST /api/invoices/[id]/sync
 *
 * Syncs an invoice with Stripe to get the latest status.
 * Updates invoice status, payment status, and patient info if available.
 *
 * Use cases:
 * - Invoice shows PAID but was refunded in Stripe
 * - Patient info is incomplete but Stripe has better data
 * - Manual reconciliation after webhook failures
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { syncInvoiceFromStripe } from '@/services/stripe/paymentMatchingService';
import { prisma } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handlePost(
  req: NextRequest,
  user: AuthUser,
  context?: RouteContext
): Promise<Response> {
  if (!context?.params) {
    return NextResponse.json(
      { error: 'Missing route parameters' },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  const invoiceId = parseInt(id, 10);

  if (isNaN(invoiceId)) {
    return NextResponse.json(
      { error: 'Invalid invoice ID' },
      { status: 400 }
    );
  }

  try {
    // Verify user has access to this invoice
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        ...(user.role !== 'super_admin' && user.clinicId
          ? { clinicId: user.clinicId }
          : {}),
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found or access denied' },
        { status: 404 }
      );
    }

    // Sync from Stripe
    const result = await syncInvoiceFromStripe(invoiceId);

    if (!result.success) {
      logger.warn('[Invoice Sync] Sync failed', {
        invoiceId,
        error: result.error,
        userId: user.id,
      });
      return NextResponse.json(
        { error: result.error || 'Sync failed' },
        { status: 400 }
      );
    }

    // Get updated invoice
    const updatedInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profileStatus: true,
          },
        },
        payments: {
          select: {
            id: true,
            status: true,
            amount: true,
          },
        },
      },
    });

    logger.info('[Invoice Sync] Sync completed', {
      invoiceId,
      updated: result.updated,
      changes: result.changes,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      updated: result.updated,
      changes: result.changes,
      invoice: updatedInvoice,
      message: result.updated
        ? 'Invoice synced successfully'
        : 'Invoice is already up to date',
    });
  } catch (error) {
    logger.error('[Invoice Sync] Error', {
      invoiceId,
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to sync invoice' },
      { status: 500 }
    );
  }
}

export const POST = withAuth<RouteContext>(handlePost, { roles: ['super_admin', 'admin', 'staff'] });
