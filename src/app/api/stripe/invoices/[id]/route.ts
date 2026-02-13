/**
 * COMPREHENSIVE INVOICE MANAGEMENT API
 *
 * GET    - Fetch invoice details
 * POST   - Perform actions (send, void, mark paid, finalize, add items, add credit, duplicate)
 * PATCH  - Edit invoice (description, due date, line items, memo)
 * DELETE - Delete unpaid invoice
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureTenantResource, tenantNotFoundResponse } from '@/lib/tenant-response';
import { getAuthUser } from '@/lib/auth';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import { auditPhiAccess, buildAuditPhiOptions } from '@/lib/audit/hipaa-audit';
import { z } from 'zod';
import { isStripeConfigured } from '@/lib/stripe/config';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

// Schema for updating an invoice
const updateInvoiceSchema = z
  .object({
    description: z.string().optional(),
    dueDate: z.string().datetime().optional(),
    dueInDays: z.number().min(0).optional(),
    memo: z.string().optional(),
    footer: z.string().optional(),
    lineItems: z
      .array(
        z.object({
          id: z.string().optional(), // Stripe line item ID for updates
          description: z.string(),
          amount: z.number().min(0),
          quantity: z.number().min(1).optional(),
        })
      )
      .optional(),
    // For adding single items
    addLineItem: z
      .object({
        description: z.string(),
        amount: z.number().min(0),
        quantity: z.number().min(1).optional(),
      })
      .optional(),
    // For removing items
    removeLineItemId: z.string().optional(),
    metadata: z.record(z.string()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    requirePermission(toPermissionContext(user), 'invoice:view');

    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id, 10);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    let invoice;
    try {
      invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              stripeCustomerId: true,
            },
          },
          clinic: {
            select: {
              id: true,
              name: true,
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
    } catch (includeError: any) {
      // Fallback: InvoiceItem table might not exist
      logger.warn('[API] Invoice items table not available, using simple query');
      invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              stripeCustomerId: true,
            },
          },
          clinic: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    }

    if (ensureTenantResource(invoice, user.clinicId ?? undefined)) return tenantNotFoundResponse();

    await auditPhiAccess(request, buildAuditPhiOptions(request, user, 'invoice:view', {
      patientId: invoice.patientId ?? undefined,
      route: 'GET /api/stripe/invoices/[id]',
    }));

    if (invoice.patient) {
      try {
        invoice.patient = decryptPatientPHI(invoice.patient as Record<string, unknown>, [
          'firstName',
          'lastName',
          'email',
          'phone',
        ]) as typeof invoice.patient;
      } catch (decryptErr) {
        logger.warn('[API] Failed to decrypt invoice patient PHI', {
          patientId: invoice.patient?.id,
          error: decryptErr instanceof Error ? decryptErr.message : String(decryptErr),
        });
      }
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
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id, 10);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const body = await request.json();
    const { action } = body;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { patient: true },
    });

    if (ensureTenantResource(invoice, user.clinicId ?? undefined)) return tenantNotFoundResponse();

    switch (action) {
      case 'send': {
        // Send invoice via Stripe or email
        if (invoice.stripeInvoiceId && process.env.STRIPE_SECRET_KEY) {
          try {
            const { getStripe } = await import('@/lib/stripe');
            const stripe = getStripe();
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
            const { getStripe } = await import('@/lib/stripe');
            const stripe = getStripe();
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
        // Support for marking as paid externally with additional details
        const { paymentMethod, paymentNotes, paymentDate, amount: customAmount } = body;

        const paidAmount = customAmount || invoice.amountDue || invoice.amount;
        const paidDate = paymentDate ? new Date(paymentDate) : new Date();
        const existingMetadata = (invoice.metadata as any) || {};

        // Update invoice
        await prisma.invoice.update({
          where: { id },
          data: {
            status: 'PAID',
            amountPaid: paidAmount,
            amountDue: 0,
            paidAt: paidDate,
            metadata: {
              ...existingMetadata,
              externalPayment: {
                method: paymentMethod || 'other',
                notes: paymentNotes || '',
                date: paidDate.toISOString(),
                markedAt: new Date().toISOString(),
              },
            },
          },
        });

        // Create a payment record to track the external payment
        try {
          await prisma.payment.create({
            data: {
              patientId: invoice.patientId,
              clinicId: invoice.clinicId,
              invoiceId: invoice.id,
              amount: paidAmount,
              status: 'SUCCEEDED',
              paymentMethod: paymentMethod || 'external',
              metadata: {
                isExternalPayment: true,
                externalPaymentMethod: paymentMethod,
                externalPaymentNotes: paymentNotes,
                externalPaymentDate: paidDate.toISOString(),
              },
            },
          });
        } catch (paymentError: any) {
          logger.warn('[API] Could not create Payment record:', paymentError.message);
        }

        logger.info('[API] Invoice marked as paid externally', {
          invoiceId: id,
          paymentMethod,
          amount: paidAmount,
        });

        return NextResponse.json({
          success: true,
          message: 'Invoice marked as paid',
          paymentMethod: paymentMethod || 'external',
        });
      }

      case 'finalize': {
        // Finalize a draft invoice (locks it for payment)
        if (invoice.status !== 'DRAFT') {
          return NextResponse.json(
            { error: 'Only draft invoices can be finalized' },
            { status: 400 }
          );
        }

        if (invoice.stripeInvoiceId && process.env.STRIPE_SECRET_KEY) {
          try {
            const { getStripe } = await import('@/lib/stripe');
            const stripe = getStripe();
            const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.stripeInvoiceId);

            await prisma.invoice.update({
              where: { id },
              data: {
                status: 'OPEN',
                stripeInvoiceUrl: finalizedInvoice.hosted_invoice_url,
                stripePdfUrl: finalizedInvoice.invoice_pdf,
              },
            });

            return NextResponse.json({
              success: true,
              message: 'Invoice finalized',
              stripeInvoiceUrl: finalizedInvoice.hosted_invoice_url,
              stripePdfUrl: finalizedInvoice.invoice_pdf,
            });
          } catch (stripeError: any) {
            logger.error('[API] Stripe finalize invoice error:', stripeError);
            return NextResponse.json(
              { error: stripeError.message || 'Failed to finalize invoice' },
              { status: 500 }
            );
          }
        }

        await prisma.invoice.update({
          where: { id },
          data: { status: 'OPEN' },
        });

        return NextResponse.json({
          success: true,
          message: 'Invoice finalized (local)',
        });
      }

      case 'add_credit': {
        // Add a credit/discount to the invoice
        const { amount, description: creditDescription } = body;

        if (!amount || amount <= 0) {
          return NextResponse.json({ error: 'Credit amount must be positive' }, { status: 400 });
        }

        if (invoice.status === 'PAID' || invoice.status === 'VOID') {
          return NextResponse.json(
            { error: 'Cannot add credit to a paid or voided invoice' },
            { status: 400 }
          );
        }

        if (invoice.stripeInvoiceId && process.env.STRIPE_SECRET_KEY) {
          try {
            const { getStripe } = await import('@/lib/stripe');
            const stripe = getStripe();

            // Add a negative line item (credit)
            await stripe.invoiceItems.create({
              customer: invoice.patient.stripeCustomerId!,
              invoice: invoice.stripeInvoiceId,
              amount: -amount, // Negative for credit
              currency: 'usd',
              description: creditDescription || 'Credit/Discount',
            });

            // Refresh invoice to get updated total
            const updatedStripeInvoice = await stripe.invoices.retrieve(invoice.stripeInvoiceId);

            await prisma.invoice.update({
              where: { id },
              data: {
                amountDue: updatedStripeInvoice.amount_due,
              },
            });

            return NextResponse.json({
              success: true,
              message: 'Credit added',
              newAmountDue: updatedStripeInvoice.amount_due,
            });
          } catch (stripeError: any) {
            logger.error('[API] Stripe add credit error:', stripeError);
            return NextResponse.json(
              { error: stripeError.message || 'Failed to add credit' },
              { status: 500 }
            );
          }
        }

        // Local mode - update amount
        const currentLineItems = (invoice.lineItems as any[]) || [];
        currentLineItems.push({
          description: creditDescription || 'Credit/Discount',
          amount: -amount,
        });

        const newTotal = currentLineItems.reduce((sum: number, item: any) => sum + item.amount, 0);

        await prisma.invoice.update({
          where: { id },
          data: {
            amountDue: Math.max(0, newTotal),
            lineItems: currentLineItems,
          },
        });

        return NextResponse.json({
          success: true,
          message: 'Credit added (local)',
          newAmountDue: Math.max(0, newTotal),
        });
      }

      case 'duplicate': {
        // Create a copy of this invoice
        const newInvoice = await prisma.invoice.create({
          data: {
            patientId: invoice.patientId,
            clinicId: invoice.clinicId,
            description: invoice.description
              ? `Copy of: ${invoice.description}`
              : 'Copy of invoice',
            amount: invoice.amount,
            amountDue: invoice.amountDue,
            status: 'DRAFT',
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            lineItems: invoice.lineItems,
            metadata: {
              ...((invoice.metadata as any) || {}),
              duplicatedFrom: invoice.id,
            },
            createSubscription: invoice.createSubscription,
          },
        });

        return NextResponse.json({
          success: true,
          message: 'Invoice duplicated',
          newInvoice,
        });
      }

      case 'mark_uncollectible': {
        if (invoice.status === 'PAID') {
          return NextResponse.json(
            { error: 'Cannot mark a paid invoice as uncollectible' },
            { status: 400 }
          );
        }

        if (invoice.stripeInvoiceId && process.env.STRIPE_SECRET_KEY) {
          try {
            const { getStripe } = await import('@/lib/stripe');
            const stripe = getStripe();
            await stripe.invoices.markUncollectible(invoice.stripeInvoiceId);
          } catch (stripeError: any) {
            logger.warn('[API] Stripe mark uncollectible error:', stripeError);
          }
        }

        await prisma.invoice.update({
          where: { id },
          data: { status: 'UNCOLLECTIBLE' },
        });

        return NextResponse.json({
          success: true,
          message: 'Invoice marked as uncollectible',
        });
      }

      case 'resend': {
        // Resend invoice email
        if (invoice.stripeInvoiceId && process.env.STRIPE_SECRET_KEY) {
          try {
            const { getStripe } = await import('@/lib/stripe');
            const stripe = getStripe();
            await stripe.invoices.sendInvoice(invoice.stripeInvoiceId);

            return NextResponse.json({
              success: true,
              message: 'Invoice resent via Stripe',
            });
          } catch (stripeError: any) {
            logger.error('[API] Stripe resend invoice error:', stripeError);
            return NextResponse.json(
              { error: stripeError.message || 'Failed to resend invoice' },
              { status: 500 }
            );
          }
        }

        return NextResponse.json({
          success: true,
          message: 'Invoice resend queued (email service)',
        });
      }

      default:
        return NextResponse.json(
          {
            error: `Unknown action: ${action}. Available actions: send, void, mark_paid, finalize, add_credit, duplicate, mark_uncollectible, resend`,
          },
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

/**
 * PATCH - Edit invoice before payment
 *
 * Can edit: description, due date, memo, line items (for DRAFT invoices)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id, 10);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const body = await request.json();
    const validatedData = updateInvoiceSchema.parse(body);

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { patient: true },
    });

    if (ensureTenantResource(invoice, user.clinicId ?? undefined)) return tenantNotFoundResponse();

    // Check if invoice can be edited
    if (invoice.status === 'PAID') {
      return NextResponse.json({ error: 'Cannot edit a paid invoice' }, { status: 400 });
    }

    if (invoice.status === 'VOID') {
      return NextResponse.json({ error: 'Cannot edit a voided invoice' }, { status: 400 });
    }

    // Prepare update data
    const updateData: any = {};

    if (validatedData.description !== undefined) {
      updateData.description = validatedData.description;
    }

    if (validatedData.dueDate) {
      updateData.dueDate = new Date(validatedData.dueDate);
    } else if (validatedData.dueInDays !== undefined) {
      updateData.dueDate = new Date(Date.now() + validatedData.dueInDays * 24 * 60 * 60 * 1000);
    }

    if (validatedData.metadata) {
      updateData.metadata = {
        ...((invoice.metadata as any) || {}),
        ...validatedData.metadata,
      };
    }

    // Handle line items update (only for DRAFT invoices)
    if (invoice.status === 'DRAFT') {
      let currentLineItems = (invoice.lineItems as any[]) || [];

      // Full line items replacement
      if (validatedData.lineItems) {
        currentLineItems = validatedData.lineItems;
        updateData.lineItems = currentLineItems;
        updateData.amountDue = currentLineItems.reduce(
          (sum: number, item: any) => sum + item.amount,
          0
        );
      }

      // Add single line item
      if (validatedData.addLineItem) {
        currentLineItems.push(validatedData.addLineItem);
        updateData.lineItems = currentLineItems;
        updateData.amountDue = currentLineItems.reduce(
          (sum: number, item: any) => sum + item.amount,
          0
        );
      }

      // Remove line item by index
      if (validatedData.removeLineItemId !== undefined) {
        const indexToRemove = parseInt(validatedData.removeLineItemId, 10);
        if (
          !isNaN(indexToRemove) &&
          indexToRemove >= 0 &&
          indexToRemove < currentLineItems.length
        ) {
          currentLineItems.splice(indexToRemove, 1);
          updateData.lineItems = currentLineItems;
          updateData.amountDue = currentLineItems.reduce(
            (sum: number, item: any) => sum + item.amount,
            0
          );
        }
      }
    } else if (
      validatedData.lineItems ||
      validatedData.addLineItem ||
      validatedData.removeLineItemId
    ) {
      return NextResponse.json(
        {
          error:
            'Line items can only be edited on DRAFT invoices. Void this invoice and create a new one.',
        },
        { status: 400 }
      );
    }

    // Update Stripe invoice if applicable
    if (invoice.stripeInvoiceId && isStripeConfigured() && invoice.status === 'DRAFT') {
      try {
        const { getStripe } = await import('@/lib/stripe');
        const stripe = getStripe();

        const stripeUpdateData: any = {};

        if (validatedData.description) {
          stripeUpdateData.description = validatedData.description;
        }

        if (updateData.dueDate) {
          stripeUpdateData.due_date = Math.floor(updateData.dueDate.getTime() / 1000);
        }

        if (validatedData.memo) {
          stripeUpdateData.custom_fields = [{ name: 'Memo', value: validatedData.memo }];
        }

        if (validatedData.footer) {
          stripeUpdateData.footer = validatedData.footer;
        }

        if (Object.keys(stripeUpdateData).length > 0) {
          await stripe.invoices.update(invoice.stripeInvoiceId, stripeUpdateData);
        }

        // Handle line item changes in Stripe
        if (validatedData.addLineItem) {
          await stripe.invoiceItems.create({
            customer: invoice.patient.stripeCustomerId!,
            invoice: invoice.stripeInvoiceId,
            description: validatedData.addLineItem.description,
            amount: validatedData.addLineItem.amount,
            currency: 'usd',
          });
        }

        logger.info('[API] Updated Stripe invoice', { invoiceId: invoice.stripeInvoiceId });
      } catch (stripeError: any) {
        logger.error('[API] Stripe update error:', stripeError);
        // Continue with local update even if Stripe fails
      }
    }

    // Update local database
    if (Object.keys(updateData).length > 0) {
      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: updateData,
      });

      logger.info('[API] Invoice updated', { invoiceId: id, updates: Object.keys(updateData) });

      return NextResponse.json({
        success: true,
        invoice: updatedInvoice,
        message: 'Invoice updated successfully',
      });
    }

    return NextResponse.json({
      success: true,
      invoice,
      message: 'No changes applied',
    });
  } catch (error: any) {
    logger.error('[API] Error updating invoice:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to update invoice' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete an unpaid invoice
 *
 * Can only delete DRAFT or OPEN invoices that haven't been paid
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id, 10);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { payments: true },
    });

    if (ensureTenantResource(invoice, user.clinicId ?? undefined)) return tenantNotFoundResponse();

    // Check if invoice can be deleted
    if (invoice.status === 'PAID') {
      return NextResponse.json(
        { error: 'Cannot delete a paid invoice. Use refund instead.' },
        { status: 400 }
      );
    }

    if (invoice.payments && invoice.payments.length > 0) {
      const paidPayments = invoice.payments.filter((p: any) => p.status === 'COMPLETED');
      if (paidPayments.length > 0) {
        return NextResponse.json(
          { error: 'Cannot delete an invoice with completed payments. Void or refund instead.' },
          { status: 400 }
        );
      }
    }

    // Delete/void in Stripe if applicable
    if (invoice.stripeInvoiceId && isStripeConfigured()) {
      try {
        const { getStripe } = await import('@/lib/stripe');
        const stripe = getStripe();

        // Try to delete if draft, otherwise void
        if (invoice.status === 'DRAFT') {
          await stripe.invoices.del(invoice.stripeInvoiceId);
          logger.info('[API] Deleted Stripe invoice', { stripeInvoiceId: invoice.stripeInvoiceId });
        } else {
          await stripe.invoices.voidInvoice(invoice.stripeInvoiceId);
          logger.info('[API] Voided Stripe invoice', { stripeInvoiceId: invoice.stripeInvoiceId });
        }
      } catch (stripeError: any) {
        logger.warn('[API] Could not delete/void Stripe invoice:', stripeError.message);
        // Continue with local deletion
      }
    }

    // Wrap deletion of invoice items and invoice in a transaction for atomicity
    await prisma.$transaction(async (tx: typeof prisma) => {
      // Delete related invoice items first (if table exists)
      try {
        await tx.invoiceItem.deleteMany({
          where: { invoiceId: id },
        });
      } catch (error: unknown) {
        // Table might not exist - continue with invoice deletion
        logger.warn('[API] InvoiceItem table may not exist', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Delete the invoice from database
      await tx.invoice.delete({
        where: { id },
      });
    });

    logger.info('[API] Invoice deleted', { invoiceId: id });

    return NextResponse.json({
      success: true,
      message: 'Invoice deleted successfully',
      deletedId: id,
    });
  } catch (error: any) {
    logger.error('[API] Error deleting invoice:', error);

    return NextResponse.json(
      { error: error.message || 'Failed to delete invoice' },
      { status: 500 }
    );
  }
}
