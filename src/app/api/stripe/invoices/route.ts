import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { isStripeConfigured, validateStripeConfig } from '@/lib/stripe/config';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

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
  // Duplicate prevention
  idempotencyKey: z.string().optional(), // Unique key to prevent duplicates
  allowDuplicate: z.boolean().optional(), // Explicitly allow duplicate if needed
  // Mark as paid externally (for payments received outside EonPro)
  markAsPaidExternally: z.boolean().optional(),
  externalPaymentMethod: z.string().optional(), // cash, check, bank_transfer, external_stripe, etc.
  externalPaymentNotes: z.string().optional(), // Reference number, check #, etc.
  externalPaymentDate: z.string().optional(), // ISO date string
});

async function createInvoiceHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins and providers can create invoices
    if (!['admin', 'super_admin', 'provider'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();

    // Validate request body
    const validatedData = createInvoiceSchema.parse(body);

    const { prisma } = await import('@/lib/db');

    // ============================================
    // DUPLICATE PREVENTION
    // ============================================
    if (!validatedData.allowDuplicate) {
      // Check 1: Idempotency key (strongest check)
      if (validatedData.idempotencyKey) {
        const existingByKey = await prisma.invoice.findFirst({
          where: {
            metadata: {
              path: ['idempotencyKey'],
              equals: validatedData.idempotencyKey,
            },
          },
        });

        if (existingByKey) {
          logger.info('[API] Duplicate invoice prevented by idempotency key', {
            idempotencyKey: validatedData.idempotencyKey,
            existingInvoiceId: existingByKey.id,
          });

          return NextResponse.json({
            success: true,
            invoice: existingByKey,
            stripeInvoiceUrl: existingByKey.stripeInvoiceUrl,
            duplicate: true,
            message: 'Invoice already exists (idempotency key match)',
          });
        }
      }

      // Check 2: Same patient + order within last 5 minutes (prevents accidental double-clicks)
      if (validatedData.orderId) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const existingByOrder = await prisma.invoice.findFirst({
          where: {
            patientId: validatedData.patientId,
            orderId: validatedData.orderId,
            createdAt: { gte: fiveMinutesAgo },
          },
        });

        if (existingByOrder) {
          logger.info('[API] Duplicate invoice prevented - same order within 5 minutes', {
            patientId: validatedData.patientId,
            orderId: validatedData.orderId,
            existingInvoiceId: existingByOrder.id,
          });

          return NextResponse.json({
            success: true,
            invoice: existingByOrder,
            stripeInvoiceUrl: existingByOrder.stripeInvoiceUrl,
            duplicate: true,
            message: 'Invoice already exists for this order',
          });
        }
      }

      // Check 3: Same patient + same amount within last 2 minutes (prevents double-clicks on same form)
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const totalAmount = validatedData.lineItems?.reduce((sum, item) => sum + item.amount, 0) || 0;

      if (totalAmount > 0) {
        const existingByAmount = await prisma.invoice.findFirst({
          where: {
            patientId: validatedData.patientId,
            amountDue: totalAmount,
            createdAt: { gte: twoMinutesAgo },
            status: { in: ['DRAFT', 'OPEN'] },
          },
        });

        if (existingByAmount) {
          logger.info('[API] Duplicate invoice prevented - same amount within 2 minutes', {
            patientId: validatedData.patientId,
            amount: totalAmount,
            existingInvoiceId: existingByAmount.id,
          });

          return NextResponse.json({
            success: true,
            invoice: existingByAmount,
            stripeInvoiceUrl: existingByAmount.stripeInvoiceUrl,
            duplicate: true,
            message: 'Recent invoice with same amount exists - returning existing invoice',
          });
        }
      }
    }

    // ============================================
    // END DUPLICATE PREVENTION
    // ============================================

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

    // Check if Stripe is configured using the config service
    const stripeConfigured = isStripeConfigured();

    // Detailed logging for debugging
    const configStatus = {
      stripeConfigured,
      hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
      secretKeyPrefix: process.env.STRIPE_SECRET_KEY?.substring(0, 7) || 'N/A',
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    };

    logger.info('[API] Invoice creation - Stripe configuration', configStatus);

    if (!stripeConfigured) {
      // Development/Demo mode - create invoice without Stripe
      logger.warn('[API] Stripe not configured - creating demo invoice', {
        reason: 'STRIPE_SECRET_KEY environment variable is not set',
        hint: 'Check Vercel Environment Variables',
        ...configStatus,
      });

      // Calculate total (amount is the total for each line item, not per-unit)
      const total = lineItems.reduce((sum, item) => {
        return sum + item.amount;
      }, 0);

      // Create invoice in database only (demo mode)
      const isMarkedAsPaid = validatedData.markAsPaidExternally === true;
      const paymentDate = validatedData.externalPaymentDate
        ? new Date(validatedData.externalPaymentDate)
        : new Date();

      const invoiceMetadata = {
        ...(validatedData.metadata || {}),
        ...(validatedData.idempotencyKey ? { idempotencyKey: validatedData.idempotencyKey } : {}),
        ...(isMarkedAsPaid && {
          externalPayment: {
            method: validatedData.externalPaymentMethod || 'other',
            notes: validatedData.externalPaymentNotes || '',
            date: paymentDate.toISOString(),
            markedAt: new Date().toISOString(),
          },
        }),
      };

      // Wrap invoice and invoice items creation in a transaction for atomicity
      const invoice = await prisma.$transaction(async (tx: typeof prisma) => {
        const newInvoice = await tx.invoice.create({
          data: {
            patientId: validatedData.patientId,
            amount: total,
            amountDue: isMarkedAsPaid ? 0 : total,
            amountPaid: isMarkedAsPaid ? total : 0,
            status: isMarkedAsPaid ? 'PAID' : 'DRAFT',
            paidAt: isMarkedAsPaid ? paymentDate : null,
            dueDate: new Date(Date.now() + (validatedData.dueInDays || 30) * 24 * 60 * 60 * 1000),
            description: validatedData.description || 'Medical Services',
            metadata: invoiceMetadata,
            lineItems: lineItems,
            orderId: validatedData.orderId,
            createSubscription,
          },
        });

        // Try to create invoice items records (optional - table might not exist)
        try {
          for (const item of lineItems) {
            await tx.invoiceItem.create({
              data: {
                invoiceId: newInvoice.id,
                productId: item.productId || null,
                description: item.description,
                quantity: item.quantity || 1,
                unitPrice: item.amount,
                amount: item.amount * (item.quantity || 1),
                metadata: item.metadata || {},
              },
            });
          }
        } catch (itemError: any) {
          logger.warn('[API] Could not create InvoiceItem records (demo mode):', itemError.message);
        }

        // Create payment record if marked as paid externally
        if (isMarkedAsPaid) {
          try {
            await tx.payment.create({
              data: {
                patientId: validatedData.patientId,
                invoiceId: newInvoice.id,
                amount: total,
                status: 'SUCCEEDED',
                paymentMethod: validatedData.externalPaymentMethod || 'external',
                metadata: {
                  isExternalPayment: true,
                  externalPaymentMethod: validatedData.externalPaymentMethod,
                  externalPaymentNotes: validatedData.externalPaymentNotes,
                  externalPaymentDate: paymentDate.toISOString(),
                },
              },
            });
          } catch (paymentError: any) {
            logger.warn('[API] Could not create Payment record (demo mode):', paymentError.message);
          }
        }

        return newInvoice;
      });

      return NextResponse.json({
        success: true,
        invoice,
        stripeInvoiceUrl: null,
        demoMode: true,
        willCreateSubscription: createSubscription,
        markedAsPaidExternally: isMarkedAsPaid,
        message: isMarkedAsPaid
          ? 'Invoice created and marked as paid externally (demo mode)'
          : 'Invoice created in demo mode (Stripe not configured)',
      });
    }

    // Production mode - use Stripe
    // If marking as paid externally, skip Stripe invoice creation and create local record
    if (validatedData.markAsPaidExternally) {
      const total = lineItems.reduce((sum, item) => sum + item.amount, 0);
      const paymentDate = validatedData.externalPaymentDate
        ? new Date(validatedData.externalPaymentDate)
        : new Date();

      const invoiceMetadata = {
        ...(validatedData.metadata || {}),
        ...(validatedData.idempotencyKey ? { idempotencyKey: validatedData.idempotencyKey } : {}),
        externalPayment: {
          method: validatedData.externalPaymentMethod || 'other',
          notes: validatedData.externalPaymentNotes || '',
          date: paymentDate.toISOString(),
          markedAt: new Date().toISOString(),
        },
      };

      const invoice = await prisma.$transaction(async (tx: typeof prisma) => {
        const newInvoice = await tx.invoice.create({
          data: {
            patientId: validatedData.patientId,
            amount: total,
            amountDue: 0,
            amountPaid: total,
            status: 'PAID',
            paidAt: paymentDate,
            dueDate: new Date(Date.now() + (validatedData.dueInDays || 30) * 24 * 60 * 60 * 1000),
            description: validatedData.description || 'Medical Services',
            metadata: invoiceMetadata,
            lineItems: lineItems,
            orderId: validatedData.orderId,
            createSubscription,
          },
        });

        // Create invoice items records
        try {
          for (const item of lineItems) {
            await tx.invoiceItem.create({
              data: {
                invoiceId: newInvoice.id,
                productId: item.productId || null,
                description: item.description,
                quantity: item.quantity || 1,
                unitPrice: item.amount,
                amount: item.amount * (item.quantity || 1),
                metadata: item.metadata || {},
              },
            });
          }
        } catch (itemError: any) {
          logger.warn('[API] Could not create InvoiceItem records:', itemError.message);
        }

        // Create payment record
        try {
          await tx.payment.create({
            data: {
              patientId: validatedData.patientId,
              invoiceId: newInvoice.id,
              amount: total,
              status: 'SUCCEEDED',
              paymentMethod: validatedData.externalPaymentMethod || 'external',
              metadata: {
                isExternalPayment: true,
                externalPaymentMethod: validatedData.externalPaymentMethod,
                externalPaymentNotes: validatedData.externalPaymentNotes,
                externalPaymentDate: paymentDate.toISOString(),
              },
            },
          });
        } catch (paymentError: any) {
          logger.warn('[API] Could not create Payment record:', paymentError.message);
        }

        return newInvoice;
      });

      logger.info('[API] Invoice created and marked as paid externally', {
        invoiceId: invoice.id,
        patientId: validatedData.patientId,
        amount: total,
        paymentMethod: validatedData.externalPaymentMethod,
      });

      return NextResponse.json({
        success: true,
        invoice,
        stripeInvoiceUrl: null,
        markedAsPaidExternally: true,
        willCreateSubscription: createSubscription,
        message: 'Invoice created and marked as paid externally',
      });
    }

    try {
      const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');

      // Create invoice with subscription flag
      const result = await StripeInvoiceService.createInvoice({
        ...validatedData,
        lineItems,
      } as any);

      // Wrap invoice update and invoice items creation in a transaction for atomicity
      await prisma.$transaction(async (tx: typeof prisma) => {
        // Update invoice with subscription flag
        await tx.invoice.update({
          where: { id: result.invoice.id },
          data: { createSubscription },
        });

        // Try to create invoice items records (optional - table might not exist yet)
        try {
          for (const item of lineItems) {
            await tx.invoiceItem.create({
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
        } catch (itemError: any) {
          // InvoiceItem table might not exist - not critical for invoice creation
          logger.warn('[API] Could not create InvoiceItem records:', itemError.message);
        }
      });

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
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('[API] Error creating invoice:', err);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    // More helpful error message for Stripe configuration issues
    if (err.message?.includes('Stripe is not configured')) {
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
        error: err.message || 'Failed to create invoice',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        type: err.constructor?.name
      },
      { status: 500 }
    );
  }
}

async function getInvoicesHandler(request: NextRequest, user: AuthUser) {
  // Allow admins, providers, and staff to view invoices
  if (!['admin', 'super_admin', 'provider', 'staff'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

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

  try {
    const { prisma } = await import('@/lib/db');
    const { safeInvoiceQuery } = await import('@/lib/database/safe-query');

    // Use safe query wrapper for critical billing data
    const result = await safeInvoiceQuery(
      () => prisma.invoice.findMany({
        where: { patientId: parsedPatientId },
        include: {
          payments: true,
          items: {
            include: { product: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      `Fetch invoices for patient ${parsedPatientId}`
    );

    if (!result.success) {
      // Safe query failed - try simpler query without relations
      logger.warn('[API] Safe query failed, trying simple query', {
        error: result.error?.message,
        patientId: parsedPatientId
      });

      const simpleResult = await safeInvoiceQuery(
        () => prisma.invoice.findMany({
          where: { patientId: parsedPatientId },
          orderBy: { createdAt: 'desc' },
        }),
        `Fetch invoices (simple) for patient ${parsedPatientId}`
      );

      if (!simpleResult.success) {
        // Both queries failed - this is a critical error
        logger.error('[API] CRITICAL: Both invoice queries failed', {
          error: simpleResult.error,
          patientId: parsedPatientId,
        });

        return NextResponse.json({
          error: 'Failed to fetch invoices',
          errorType: simpleResult.error?.type || 'UNKNOWN',
          errorMessage: simpleResult.error?.message || 'Database query failed',
          critical: true,
          timestamp: new Date().toISOString(),
        }, { status: 503 });
      }

      // Simple query succeeded
      const simpleData = simpleResult.data as unknown[];
      return NextResponse.json({
        success: true,
        invoices: simpleData || [],
        count: simpleData?.length || 0,
        timestamp: new Date().toISOString(),
        warning: 'Relations could not be loaded',
      });
    }

    // Full query succeeded
    const fullData = result.data as unknown[];
    return NextResponse.json({
      success: true,
      invoices: fullData || [],
      count: fullData?.length || 0,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    // Log and return detailed error
    const errorInfo = {
      error: 'Failed to fetch invoices',
      errorType: error?.name || error?.constructor?.name || 'UnknownError',
      errorMessage: error?.message || 'No error message',
      errorCode: error?.code || null,
      timestamp: new Date().toISOString(),
    };

    logger.error('[API] Invoice fetch error:', errorInfo);

    return NextResponse.json(errorInfo, { status: 500 });
  }
}

export const POST = withAuth(createInvoiceHandler);
export const GET = withAuth(getInvoicesHandler);
