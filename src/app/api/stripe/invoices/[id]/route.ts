/**
 * INDIVIDUAL INVOICE API
 * 
 * GET - Fetch invoice details
 * POST - Perform actions (send, void, mark paid)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id, 10);
    
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }
    
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      invoice,
    });
    
  } catch (error: any) {
    logger.error('[API] Error fetching invoice:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch invoice' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id, 10);
    
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    const { action } = body;
    
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { patient: true },
    });
    
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }
    
    switch (action) {
      case 'send': {
        // Send invoice via Stripe or email
        if (invoice.stripeInvoiceId && process.env.STRIPE_SECRET_KEY) {
          try {
            const stripe = (await import('@/lib/stripe')).default;
            await stripe.invoices.sendInvoice(invoice.stripeInvoiceId);
            
            await prisma.invoice.update({
              where: { id },
              data: { status: 'OPEN' },
            });
            
            return NextResponse.json({
              success: true,
              message: 'Invoice sent via Stripe',
            });
          } catch (stripeError: any) {
            logger.error('[API] Stripe send invoice error:', stripeError);
            return NextResponse.json(
              { error: stripeError.message || 'Failed to send invoice' },
              { status: 500 }
            );
          }
        }
        
        // Fallback: Update status and send via email
        await prisma.invoice.update({
          where: { id },
          data: { status: 'OPEN' },
        });
        
        // TODO: Send email notification
        return NextResponse.json({
          success: true,
          message: 'Invoice marked as sent',
        });
      }
      
      case 'void': {
        if (invoice.status === 'PAID') {
          return NextResponse.json(
            { error: 'Cannot void a paid invoice. Process a refund instead.' },
            { status: 400 }
          );
        }
        
        if (invoice.stripeInvoiceId && process.env.STRIPE_SECRET_KEY) {
          try {
            const stripe = (await import('@/lib/stripe')).default;
            await stripe.invoices.voidInvoice(invoice.stripeInvoiceId);
          } catch (stripeError: any) {
            logger.warn('[API] Stripe void invoice error:', stripeError);
          }
        }
        
        await prisma.invoice.update({
          where: { id },
          data: { status: 'VOID' },
        });
        
        return NextResponse.json({
          success: true,
          message: 'Invoice voided',
        });
      }
      
      case 'mark_paid': {
        await prisma.invoice.update({
          where: { id },
          data: {
            status: 'PAID',
            amountPaid: invoice.amountDue,
            paidAt: new Date(),
          },
        });
        
        return NextResponse.json({
          success: true,
          message: 'Invoice marked as paid',
        });
      }
      
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
    
  } catch (error: any) {
    logger.error('[API] Error processing invoice action:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to process invoice action' },
      { status: 500 }
    );
  }
}
