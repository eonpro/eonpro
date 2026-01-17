import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processCommission } from "@/services/influencerService";
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/auth/middleware';

/**
 * Process commission when an invoice is paid
 * Protected endpoint - requires admin or system role
 * Can be called from Stripe webhooks (which handle their own auth) or manually by admins
 */
async function processCommissionHandler(req: NextRequest) {
  try {
    const { invoiceId, stripeInvoiceId } = await req.json();

    if (!invoiceId && !stripeInvoiceId) {
      return NextResponse.json(
        { error: "Either invoiceId or stripeInvoiceId is required" },
        { status: 400 }
      );
    }

    // Find the invoice
    const invoice: any = await prisma.invoice.findFirst({
      where: invoiceId 
        ? { id: invoiceId }
        : { stripeInvoiceId: stripeInvoiceId! },
      include: {
        patient: true
      }
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Process commission if invoice is paid
    if (invoice.status === 'PAID') {
      const commission = await processCommission(invoice.id);
      
      if (commission) {
        logger.debug(`[Commission API] Commission processed for invoice ${invoice.id}`);
        return NextResponse.json({
          success: true,
          commission: {
            id: commission.id,
            amount: commission.commissionAmount,
            influencerId: commission.influencerId,
            status: commission.status
          }
        });
      } else {
        return NextResponse.json({
          success: false,
          message: "No active referral found or commission already processed"
        });
      }
    } else {
      return NextResponse.json({
        success: false,
        message: `Invoice is not paid (status: ${invoice.status})`
      });
    }
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("[Commission API] Error processing commission:", error);
    return NextResponse.json(
      { error: errorMessage || "Failed to process commission" },
      { status: 500 }
    );
  }
}

// Protected route - requires admin or super_admin role
export const POST = withAuth(processCommissionHandler, {
  roles: ['admin', 'super_admin']
});
