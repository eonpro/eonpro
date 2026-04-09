/**
 * Auto-creates a PAID invoice when a payment is processed via the admin
 * "Process Payment" form. This ensures every charge has a corresponding
 * invoice visible in the Invoices tab so staff can see what the patient
 * paid for.
 */

import { prisma } from '@/lib/db';
import { InvoiceStatus } from '@prisma/client';
import { logger } from '@/lib/logger';

interface LineItemInput {
  description: string;
  amount: number;
  planId?: string;
}

interface CreateInvoiceForPaymentInput {
  paymentId: number;
  patientId: number;
  clinicId: number;
  amount: number;
  description: string;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  planId?: string | null;
  planName?: string | null;
  lineItems?: LineItemInput[];
}

/**
 * Creates a PAID invoice linked to an already-succeeded payment.
 * Runs inside a transaction to atomically create the Invoice, InvoiceItem,
 * and link them back to the Payment record.
 *
 * Idempotent: if the payment already has an invoiceId, returns early.
 */
export async function createInvoiceForProcessedPayment(
  input: CreateInvoiceForPaymentInput,
): Promise<{ invoiceId: number } | null> {
  const {
    paymentId,
    patientId,
    clinicId,
    amount,
    description,
    stripePaymentIntentId,
    stripeChargeId,
    planId,
    planName,
    lineItems,
  } = input;

  try {
    const existingPayment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { invoiceId: true },
    });

    if (existingPayment?.invoiceId) {
      logger.debug('[CreateInvoiceForPayment] Payment already has invoice', {
        paymentId,
        invoiceId: existingPayment.invoiceId,
      });
      return { invoiceId: existingPayment.invoiceId };
    }

    const hasMultipleLines = lineItems && lineItems.length > 0;
    const invoiceLineItems = hasMultipleLines
      ? lineItems.map((li) => ({ description: li.description, amount: li.amount, quantity: 1 }))
      : [{ description, amount, quantity: 1 }];

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          patientId,
          clinicId,
          description,
          amount,
          amountDue: 0,
          amountPaid: amount,
          currency: 'usd',
          status: 'PAID' as InvoiceStatus,
          paidAt: new Date(),
          lineItems: invoiceLineItems,
          metadata: {
            source: 'process_payment',
            paymentIntentId: stripePaymentIntentId || undefined,
            chargeId: stripeChargeId || undefined,
            ...(planId ? { planId } : {}),
            ...(planName ? { planName } : {}),
          },
        },
      });

      if (hasMultipleLines) {
        for (const li of lineItems) {
          await tx.invoiceItem.create({
            data: {
              invoiceId: invoice.id,
              description: li.description,
              quantity: 1,
              unitPrice: li.amount,
              amount: li.amount,
            },
          });
        }
      } else {
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            description,
            quantity: 1,
            unitPrice: amount,
            amount,
          },
        });
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: { invoiceId: invoice.id },
      });

      return invoice;
    }, { timeout: 15000 });

    logger.info('[CreateInvoiceForPayment] Invoice created for processed payment', {
      invoiceId: result.id,
      paymentId,
      patientId,
      amount,
    });

    return { invoiceId: result.id };
  } catch (error) {
    logger.error('[CreateInvoiceForPayment] Failed to create invoice (non-blocking)', {
      paymentId,
      patientId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
