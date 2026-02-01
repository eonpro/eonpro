/**
 * INVOICE ACTIONS API
 * ===================
 * Actions on a specific invoice: send, finalize, pay, refund, etc.
 * 
 * POST /api/v2/invoices/[id]/actions
 * 
 * Actions:
 * - send: Send invoice to patient (email/sms/both)
 * - finalize: Finalize a draft invoice
 * - pay: Record a payment
 * - refund: Issue a refund
 * - mark_uncollectible: Mark as uncollectible
 * - cancel: Cancel an invoice (works for any status)
 * - apply_credit: Apply a credit
 * - add_line_item: Add line item to draft
 * - remove_line_item: Remove line item from draft
 * - create_payment_plan: Set up payment plan
 * - schedule_reminders: Schedule payment reminders
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth/middleware';
import { createInvoiceManager, LineItem, PaymentPlan, InvoiceReminder } from '@/services/billing/InvoiceManager';
import { logger } from '@/lib/logger';

// Action schemas
const sendActionSchema = z.object({
  action: z.literal('send'),
  channel: z.enum(['email', 'sms', 'both']).optional(),
  customMessage: z.string().optional(),
});

const finalizeActionSchema = z.object({
  action: z.literal('finalize'),
});

const payActionSchema = z.object({
  action: z.literal('pay'),
  amount: z.number().min(1),
  paymentMethod: z.string(),
  stripePaymentIntentId: z.string().optional(),
  notes: z.string().optional(),
});

const refundActionSchema = z.object({
  action: z.literal('refund'),
  amount: z.number().optional(),
  reason: z.string().optional(),
  refundToPaymentMethod: z.boolean().optional(),
});

const markUncollectibleSchema = z.object({
  action: z.literal('mark_uncollectible'),
  reason: z.string().optional(),
});

const cancelActionSchema = z.object({
  action: z.literal('cancel'),
  reason: z.string().optional(),
});

const applyCreditSchema = z.object({
  action: z.literal('apply_credit'),
  amount: z.number().min(1),
  description: z.string().optional(),
});

const addLineItemSchema = z.object({
  action: z.literal('add_line_item'),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number().min(1).default(1),
    unitPrice: z.number().min(0),
    discount: z.object({
      type: z.enum(['percentage', 'fixed']),
      value: z.number().min(0),
    }).optional(),
    taxRate: z.number().optional(),
  })),
});

const removeLineItemSchema = z.object({
  action: z.literal('remove_line_item'),
  itemIndex: z.number().min(0),
});

const paymentPlanSchema = z.object({
  action: z.literal('create_payment_plan'),
  totalAmount: z.number().min(1),
  numberOfPayments: z.number().min(2).max(24),
  frequency: z.enum(['weekly', 'biweekly', 'monthly']),
  startDate: z.string().datetime(),
  downPayment: z.number().optional(),
});

const reminderSchema = z.object({
  action: z.literal('schedule_reminders'),
  reminders: z.array(z.object({
    type: z.enum(['before_due', 'on_due', 'after_due']),
    daysOffset: z.number().min(0).max(90),
    channel: z.enum(['email', 'sms', 'both']),
    message: z.string().optional(),
  })),
});

const actionSchema = z.discriminatedUnion('action', [
  sendActionSchema,
  finalizeActionSchema,
  payActionSchema,
  refundActionSchema,
  markUncollectibleSchema,
  cancelActionSchema,
  applyCreditSchema,
  addLineItemSchema,
  removeLineItemSchema,
  paymentPlanSchema,
  reminderSchema,
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    // Verify auth
    const authResult = await verifyAuth(req);
    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    const user = authResult.user;
    
    const { id } = await params;
    const invoiceId = parseInt(id);
    
    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }
    
    const body = await req.json();
    const validated = actionSchema.parse(body);
    
    const invoiceManager = createInvoiceManager(user.clinicId);
    
    switch (validated.action) {
      case 'send': {
        const result = await invoiceManager.sendInvoice(invoiceId, {
          channel: validated.channel,
          customMessage: validated.customMessage,
        });
        return NextResponse.json({
          success: result.success,
          delivery: result.delivery,
          message: result.success ? 'Invoice sent successfully' : 'Failed to send invoice',
        });
      }
      
      case 'finalize': {
        const invoice = await invoiceManager.finalizeInvoice(invoiceId);
        return NextResponse.json({
          success: true,
          invoice,
          message: 'Invoice finalized successfully',
        });
      }
      
      case 'pay': {
        const result = await invoiceManager.recordPayment(invoiceId, {
          amount: validated.amount,
          paymentMethod: validated.paymentMethod,
          stripePaymentIntentId: validated.stripePaymentIntentId,
          notes: validated.notes,
        });
        return NextResponse.json({
          success: true,
          invoice: result.invoice,
          payment: result.payment,
          isPaid: result.isPaid,
          remainingBalance: result.remainingBalance,
          message: result.isPaid ? 'Invoice paid in full' : 'Partial payment recorded',
        });
      }
      
      case 'refund': {
        const invoice = await invoiceManager.issueRefund(invoiceId, {
          amount: validated.amount,
          reason: validated.reason,
          refundToPaymentMethod: validated.refundToPaymentMethod,
        });
        return NextResponse.json({
          success: true,
          invoice,
          message: 'Refund issued successfully',
        });
      }
      
      case 'mark_uncollectible': {
        const invoice = await invoiceManager.markUncollectible(invoiceId, validated.reason);
        return NextResponse.json({
          success: true,
          invoice,
          message: 'Invoice marked as uncollectible',
        });
      }
      
      case 'cancel': {
        const invoice = await invoiceManager.cancelInvoice(invoiceId, validated.reason);
        return NextResponse.json({
          success: true,
          invoice,
          message: 'Invoice cancelled successfully',
        });
      }

      case 'apply_credit': {
        const invoice = await invoiceManager.applyCredit(invoiceId, validated.amount, validated.description);
        return NextResponse.json({
          success: true,
          invoice,
          message: 'Credit applied successfully',
        });
      }
      
      case 'add_line_item': {
        const items: LineItem[] = validated.items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          taxRate: item.taxRate,
        }));
        const invoice = await invoiceManager.addLineItems(invoiceId, items);
        return NextResponse.json({
          success: true,
          invoice,
          message: 'Line items added successfully',
        });
      }
      
      case 'remove_line_item': {
        const invoice = await invoiceManager.removeLineItem(invoiceId, validated.itemIndex);
        return NextResponse.json({
          success: true,
          invoice,
          message: 'Line item removed successfully',
        });
      }
      
      case 'create_payment_plan': {
        const plan: PaymentPlan = {
          totalAmount: validated.totalAmount,
          numberOfPayments: validated.numberOfPayments,
          frequency: validated.frequency,
          startDate: new Date(validated.startDate),
          downPayment: validated.downPayment,
        };
        const invoice = await invoiceManager.createPaymentPlan(invoiceId, plan);
        return NextResponse.json({
          success: true,
          invoice,
          paymentPlan: (invoice.metadata as any)?.paymentPlan,
          message: 'Payment plan created successfully',
        });
      }
      
      case 'schedule_reminders': {
        const reminders: InvoiceReminder[] = validated.reminders;
        const invoice = await invoiceManager.scheduleReminders(invoiceId, reminders);
        return NextResponse.json({
          success: true,
          invoice,
          reminders,
          message: 'Reminders scheduled successfully',
        });
      }
      
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }
    
    logger.error('Invoice action failed', error);
    return NextResponse.json(
      { error: error.message || 'Action failed' },
      { status: 500 }
    );
  }
}
