/**
 * PATIENT BILLING API
 * ====================
 * Get patient billing information, balance, and history
 * 
 * GET /api/v2/patients/[id]/billing - Get billing summary
 * POST /api/v2/patients/[id]/billing - Add credit or adjustment
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { createInvoiceManager } from '@/services/billing/InvoiceManager';
import { logger } from '@/lib/logger';

// GET - Get patient billing summary
export async function GET(
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
    const patientId = parseInt(id);
    
    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }
    
    // Get patient
    const patient = await basePrisma.patient.findUnique({
      where: { id: patientId },
      include: {
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { payments: true },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        subscriptions: {
          where: { status: 'ACTIVE' },
        },
        paymentMethods: true,
      },
    });
    
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }
    
    // Calculate balance
    const invoiceManager = createInvoiceManager(user.clinicId);
    const invoiceSummary = await invoiceManager.getPatientInvoiceSummary(patientId);
    
    // Get payment methods from Stripe if available
    let stripePaymentMethods: any[] = [];
    if (patient.stripeCustomerId) {
      try {
        const { getStripe } = await import('@/lib/stripe');
        const stripe = getStripe();
        const methods = await stripe.paymentMethods.list({
          customer: patient.stripeCustomerId,
          type: 'card',
        });
        stripePaymentMethods = methods.data.map(m => ({
          id: m.id,
          type: m.type,
          card: m.card ? {
            brand: m.card.brand,
            last4: m.card.last4,
            expMonth: m.card.exp_month,
            expYear: m.card.exp_year,
          } : null,
          isDefault: m.id === (patient as any).defaultPaymentMethodId,
        }));
      } catch (stripeError) {
        logger.warn('Failed to fetch Stripe payment methods', { error: stripeError });
      }
    }
    
    // Calculate credit balance (from metadata)
    const creditBalance = ((patient as any).metadata?.creditBalance || 0);
    
    // Build payment history
    const paymentHistory = patient.payments.map(p => ({
      id: p.id,
      date: p.createdAt,
      amount: p.amount,
      status: p.status,
      method: p.paymentMethod,
      invoiceId: p.invoiceId,
    }));
    
    // Active subscriptions
    const activeSubscriptions = patient.subscriptions.map(s => ({
      id: s.id,
      planName: s.planName,
      amount: s.amount,
      interval: s.interval,
      nextBillingDate: s.nextBillingDate,
      status: s.status,
    }));
    
    // Recurring revenue from this patient
    const monthlyRecurring = patient.subscriptions
      .filter(s => s.status === 'ACTIVE')
      .reduce((sum, s) => {
        if (s.interval === 'month') return sum + s.amount;
        if (s.interval === 'year') return sum + (s.amount / 12);
        if (s.interval === 'week') return sum + (s.amount * 4);
        return sum;
      }, 0);
    
    return NextResponse.json({
      patient: {
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        email: patient.email,
        phone: patient.phone,
        stripeCustomerId: patient.stripeCustomerId,
      },
      balance: {
        totalInvoiced: invoiceSummary.totalInvoiced,
        totalPaid: invoiceSummary.totalPaid,
        outstanding: invoiceSummary.totalOutstanding,
        overdue: invoiceSummary.overdueAmount,
        credits: creditBalance,
        netBalance: invoiceSummary.totalOutstanding - creditBalance,
      },
      invoiceCounts: {
        total: invoiceSummary.invoiceCount,
        paid: invoiceSummary.paidCount,
        open: invoiceSummary.openCount,
        overdue: invoiceSummary.overdueCount,
      },
      subscriptions: {
        active: activeSubscriptions,
        monthlyRecurring,
      },
      paymentMethods: stripePaymentMethods,
      recentInvoices: patient.invoices.slice(0, 10).map(inv => ({
        id: inv.id,
        date: inv.createdAt,
        amount: inv.amount,
        amountDue: inv.amountDue,
        status: inv.status,
        dueDate: inv.dueDate,
        description: inv.description,
      })),
      recentPayments: paymentHistory.slice(0, 10),
    });
    
  } catch (error: any) {
    logger.error('Failed to get patient billing', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get billing info' },
      { status: 500 }
    );
  }
}

// POST - Add credit or adjustment
const addCreditSchema = z.object({
  type: z.enum(['credit', 'debit', 'adjustment']),
  amount: z.number().min(1),
  description: z.string(),
  applyToInvoice: z.number().optional(),
});

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
    const patientId = parseInt(id);
    
    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }
    
    const body = await req.json();
    const validated = addCreditSchema.parse(body);
    
    // Get patient
    const patient = await basePrisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }
    
    const currentMetadata = (patient as any).metadata || {};
    const currentBalance = currentMetadata.creditBalance || 0;
    
    let newBalance: number;
    let balanceChange: number;
    
    switch (validated.type) {
      case 'credit':
        balanceChange = validated.amount;
        newBalance = currentBalance + validated.amount;
        break;
      case 'debit':
        balanceChange = -validated.amount;
        newBalance = Math.max(0, currentBalance - validated.amount);
        break;
      case 'adjustment':
        balanceChange = validated.amount - currentBalance;
        newBalance = validated.amount;
        break;
    }
    
    // Update patient metadata with credit balance
    await basePrisma.patient.update({
      where: { id: patientId },
      data: {
        metadata: {
          ...currentMetadata,
          creditBalance: newBalance,
          creditHistory: [
            ...(currentMetadata.creditHistory || []),
            {
              type: validated.type,
              amount: validated.amount,
              description: validated.description,
              previousBalance: currentBalance,
              newBalance,
              date: new Date().toISOString(),
              createdBy: user.email,
            },
          ],
        },
      },
    });
    
    // If apply to invoice is specified, apply the credit
    if (validated.applyToInvoice && validated.type === 'credit') {
      const invoiceManager = createInvoiceManager(user.clinicId);
      await invoiceManager.applyCredit(validated.applyToInvoice, validated.amount, validated.description);
    }
    
    logger.info('Patient credit updated', {
      patientId,
      type: validated.type,
      amount: validated.amount,
      previousBalance: currentBalance,
      newBalance,
    });
    
    return NextResponse.json({
      success: true,
      previousBalance: currentBalance,
      newBalance,
      change: balanceChange,
      message: `${validated.type === 'credit' ? 'Credit added' : validated.type === 'debit' ? 'Debit applied' : 'Balance adjusted'} successfully`,
    });
    
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }
    
    logger.error('Failed to add patient credit', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add credit' },
      { status: 500 }
    );
  }
}
