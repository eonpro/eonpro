import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// Schema for creating an invoice
const createInvoiceSchema = z.object({
  patientId: z.number(),
  description: z.string().optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    amount: z.number().min(0),
    quantity: z.number().min(1).optional(),
    metadata: z.record(z.string()).optional(),
  })),
  dueInDays: z.number().min(0).optional(),
  autoSend: z.boolean().optional(),
  metadata: z.record(z.string()).optional(),
  orderId: z.number().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const validatedData = createInvoiceSchema.parse(body);
    
    // Check if Stripe is configured
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
    
    if (!stripeConfigured) {
      // Development/Demo mode - create invoice without Stripe
      logger.warn('[API] Stripe not configured - creating demo invoice');
      
      const { prisma } = await import('@/lib/db');
      
      // Calculate total (amount is the total for each line item, not per-unit)
      const total = validatedData.lineItems.reduce((sum, item) => {
        return sum + item.amount;
      }, 0);
      
      // Create invoice in database only (demo mode)
      const invoice = await prisma.invoice.create({
        data: {
          patientId: validatedData.patientId,
          amount: total,
          amountDue: total,
          status: 'DRAFT',
          dueDate: new Date(Date.now() + (validatedData.dueInDays || 30) * 24 * 60 * 60 * 1000),
          description: validatedData.description || 'Medical Services',
          metadata: validatedData.metadata || {},
          lineItems: validatedData.lineItems,
          orderId: validatedData.orderId,
        },
      });
      
      return NextResponse.json({
        success: true,
        invoice,
        stripeInvoiceUrl: null,
        demoMode: true,
        message: 'Invoice created in demo mode (Stripe not configured)',
      });
    }
    
    // Production mode - use Stripe
    try {
      const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
      
      // Create invoice
      const result = await StripeInvoiceService.createInvoice(validatedData as any);
      
      return NextResponse.json({
        success: true,
        invoice: result.invoice,
        stripeInvoiceUrl: result.stripeInvoice.hosted_invoice_url,
      });
    } catch (stripeError: any) {
      logger.error('[API] Stripe service error:', { 
        message: stripeError.message, 
        code: stripeError.code,
        type: stripeError.type 
      });
      
      // If Stripe fails, try demo mode
      logger.warn('[API] Falling back to demo mode due to Stripe error');
      
      const { prisma } = await import('@/lib/db');
      const total = validatedData.lineItems.reduce((sum, item) => sum + item.amount, 0);
      
      const invoice = await prisma.invoice.create({
        data: {
          patientId: validatedData.patientId,
          amount: total,
          amountDue: total,
          status: 'DRAFT',
          dueDate: new Date(Date.now() + (validatedData.dueInDays || 30) * 24 * 60 * 60 * 1000),
          description: validatedData.description || 'Medical Services',
          metadata: validatedData.metadata || {},
          lineItems: validatedData.lineItems,
          orderId: validatedData.orderId,
        },
      });
      
      return NextResponse.json({
        success: true,
        invoice,
        stripeInvoiceUrl: null,
        demoMode: true,
        stripeError: stripeError.message,
        message: 'Invoice created in database (Stripe error - using fallback)',
      });
    }
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[API] Error creating invoice:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    // More helpful error message for Stripe configuration issues
    if (error.message?.includes('Stripe is not configured')) {
      return NextResponse.json(
        { 
          error: 'Billing system not configured', 
          details: 'Stripe API key is missing. Invoices can still be created in demo mode.',
          demoMode: true 
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to create invoice',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        type: error.constructor?.name 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Dynamic import to avoid build-time errors
    const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
    
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');
    
    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      );
    }
    
    // Get patient invoices
    const invoices = await StripeInvoiceService.getPatientInvoices(
      parseInt(patientId, 10)
    );
    
    return NextResponse.json({
      success: true,
      invoices,
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[API] Error fetching invoices:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}
