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
    productId: z.number().optional(), // Link to product catalog
  })),
  dueInDays: z.number().min(0).optional(),
  autoSend: z.boolean().optional(),
  metadata: z.record(z.string()).optional(),
  orderId: z.number().optional(),
  createSubscription: z.boolean().optional(), // Auto-create subscription on payment
  productIds: z.array(z.number()).optional(), // Shortcut: just provide product IDs
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const validatedData = createInvoiceSchema.parse(body);
    
    const { prisma } = await import('@/lib/db');
    
    // If productIds provided, fetch products and build line items
    let lineItems = validatedData.lineItems || [];
    let hasRecurringProducts = false;
    let productRecords: any[] = [];
    
    if (validatedData.productIds && validatedData.productIds.length > 0) {
      productRecords = await prisma.product.findMany({
        where: { id: { in: validatedData.productIds }, isActive: true },
      });
      
      lineItems = productRecords.map(product => ({
        description: product.shortDescription || product.name,
        amount: product.price,
        quantity: 1,
        productId: product.id,
        metadata: { productId: product.id.toString() },
      }));
      
      hasRecurringProducts = productRecords.some(p => p.billingType === 'RECURRING');
    } else {
      // Check existing lineItems for product references
      for (const item of lineItems) {
        if (item.productId) {
          const product = await prisma.product.findUnique({ where: { id: item.productId } });
          if (product?.billingType === 'RECURRING') {
            hasRecurringProducts = true;
          }
        }
      }
    }
    
    const createSubscription = validatedData.createSubscription ?? hasRecurringProducts;
    
    // Check if Stripe is configured
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;
    
    if (!stripeConfigured) {
      // Development/Demo mode - create invoice without Stripe
      logger.warn('[API] Stripe not configured - creating demo invoice');
      
      // Calculate total (amount is the total for each line item, not per-unit)
      const total = lineItems.reduce((sum, item) => {
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
          lineItems: lineItems,
          orderId: validatedData.orderId,
          createSubscription,
        },
      });
      
      // Create invoice items records
      for (const item of lineItems) {
        await prisma.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            productId: item.productId || null,
            description: item.description,
            quantity: item.quantity || 1,
            unitPrice: item.amount,
            amount: item.amount * (item.quantity || 1),
            metadata: item.metadata || {},
          },
        });
      }
      
      return NextResponse.json({
        success: true,
        invoice,
        stripeInvoiceUrl: null,
        demoMode: true,
        willCreateSubscription: createSubscription,
        message: 'Invoice created in demo mode (Stripe not configured)',
      });
    }
    
    // Production mode - use Stripe
    try {
      const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
      
      // Create invoice with subscription flag
      const result = await StripeInvoiceService.createInvoice({
        ...validatedData,
        lineItems,
      } as any);
      
      // Update invoice with subscription flag and create invoice items
      await prisma.invoice.update({
        where: { id: result.invoice.id },
        data: { createSubscription },
      });
      
      // Create invoice items records
      for (const item of lineItems) {
        await prisma.invoiceItem.create({
          data: {
            invoiceId: result.invoice.id,
            productId: item.productId || null,
            description: item.description,
            quantity: item.quantity || 1,
            unitPrice: item.amount,
            amount: item.amount * (item.quantity || 1),
            metadata: item.metadata || {},
          },
        });
      }
      
      return NextResponse.json({
        success: true,
        invoice: result.invoice,
        stripeInvoiceUrl: result.stripeInvoice.hosted_invoice_url,
        willCreateSubscription: createSubscription,
      });
    } catch (stripeError: any) {
      logger.error('[API] Stripe service error:', { 
        message: stripeError.message, 
        code: stripeError.code,
        type: stripeError.type 
      });
      
      // If Stripe fails, try demo mode
      logger.warn('[API] Falling back to demo mode due to Stripe error');
      
      const total = lineItems.reduce((sum, item) => sum + item.amount, 0);
      
      const invoice = await prisma.invoice.create({
        data: {
          patientId: validatedData.patientId,
          amount: total,
          amountDue: total,
          status: 'DRAFT',
          dueDate: new Date(Date.now() + (validatedData.dueInDays || 30) * 24 * 60 * 60 * 1000),
          description: validatedData.description || 'Medical Services',
          metadata: validatedData.metadata || {},
          lineItems: lineItems,
          createSubscription,
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
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get('patientId');
    
    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      );
    }
    
    const parsedPatientId = parseInt(patientId, 10);
    if (isNaN(parsedPatientId)) {
      return NextResponse.json(
        { error: 'Invalid patient ID' },
        { status: 400 }
      );
    }
    
    // Query invoices directly from database (doesn't require Stripe)
    const { prisma } = await import('@/lib/db');
    
    let invoices;
    try {
      invoices = await prisma.invoice.findMany({
        where: { patientId: parsedPatientId },
        include: {
          payments: true,
          items: {
            include: {
              product: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (dbError: any) {
      logger.error('[API] Database error fetching invoices:', { 
        message: dbError.message,
        patientId: parsedPatientId 
      });
      // Fallback: try simpler query without relations
      try {
        invoices = await prisma.invoice.findMany({
          where: { patientId: parsedPatientId },
          orderBy: { createdAt: 'desc' },
        });
      } catch (fallbackError: any) {
        logger.error('[API] Fallback query also failed:', fallbackError.message);
        return NextResponse.json(
          { 
            error: 'Failed to fetch invoices',
            errorType: 'DatabaseError',
            errorMessage: dbError.message,
            fallbackError: fallbackError.message,
          },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json({
      success: true,
      invoices,
    });
  } catch (error: any) {
    logger.error('[API] Error fetching invoices:', { 
      message: error.message, 
      stack: error.stack,
      name: error.name 
    });
    
    // Include error details for debugging (safe - no sensitive data)
    return NextResponse.json(
      { 
        error: 'Failed to fetch invoices',
        errorType: error.name || 'Unknown',
        errorMessage: error.message || 'No message',
      },
      { status: 500 }
    );
  }
}
