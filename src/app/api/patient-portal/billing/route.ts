/**
 * Patient Billing API
 * Fetches payment history, invoices, and subscription info
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is not configured');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-01-28.clover',
});

/**
 * GET /api/patient-portal/billing
 * Get patient's billing information
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json(
        { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
        { status: 400 }
      );
    }

    // Get patient with Stripe customer ID
    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: {
        stripeCustomerId: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        paymentMethods: {
          where: { isActive: true },
        },
      },
    });

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found', code: 'PATIENT_NOT_FOUND' },
        { status: 404 }
      );
    }

    let subscription = null;
    let paymentMethods: Array<{
      id: string;
      brand: string;
      last4: string;
      expMonth: number;
      expYear: number;
      isDefault: boolean;
    }> = [];
    let upcomingInvoice = null;

    // If patient has Stripe customer ID, fetch from Stripe
    if (patient.stripeCustomerId) {
      try {
        // Get subscriptions from Stripe
        const stripeSubscriptions = await stripe.subscriptions.list({
          customer: patient.stripeCustomerId,
          status: 'active',
          limit: 1,
        });

        if (stripeSubscriptions.data.length > 0) {
          const sub = stripeSubscriptions.data[0];
          const price = sub.items.data[0].price;

          subscription = {
            id: sub.id,
            planName: price.nickname || 'Subscription',
            amount: price.unit_amount || 0,
            interval: price.recurring?.interval || 'month',
            status: sub.status,
            currentPeriodEnd: new Date((sub as any).current_period_end * 1000).toISOString(),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          };

          // Get upcoming invoice
          try {
            const upcoming = await (stripe.invoices as any).retrieveUpcoming({
              customer: patient.stripeCustomerId,
            });
            upcomingInvoice = {
              amount: upcoming.amount_due,
              date: new Date(upcoming.next_payment_attempt! * 1000).toISOString(),
            };
          } catch (error: unknown) {
            // No upcoming invoice
            logger.warn('[Patient Billing] Failed to fetch upcoming invoice', {
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        // Get payment methods from Stripe
        const stripePaymentMethods = await stripe.paymentMethods.list({
          customer: patient.stripeCustomerId,
          type: 'card',
        });

        const customer = await stripe.customers.retrieve(patient.stripeCustomerId);
        const defaultPaymentMethod =
          typeof customer !== 'string' && !customer.deleted
            ? customer.invoice_settings?.default_payment_method
            : null;

        paymentMethods = stripePaymentMethods.data.map((pm) => ({
          id: pm.id,
          brand: pm.card?.brand || 'card',
          last4: pm.card?.last4 || '****',
          expMonth: pm.card?.exp_month || 0,
          expYear: pm.card?.exp_year || 0,
          isDefault: pm.id === defaultPaymentMethod,
        }));
      } catch (stripeError) {
        logger.error('Stripe API error:', stripeError);
      }
    }

    // Fall back to local subscription data if no Stripe data
    if (!subscription && patient.subscriptions.length > 0) {
      const localSub = patient.subscriptions[0];
      subscription = {
        id: localSub.id.toString(),
        planName: localSub.planName || 'Subscription',
        amount: (localSub as any).price ? (localSub as any).price * 100 : (localSub.amount ?? 0),
        interval: (localSub as any).interval || 'month',
        status: localSub.status,
        currentPeriodEnd: (localSub as any).currentPeriodEnd?.toISOString() || '',
        cancelAtPeriodEnd: (localSub as any).cancelAtPeriodEnd || false,
      };
    }

    // Use local payment methods if no Stripe data
    if (paymentMethods.length === 0 && patient.paymentMethods.length > 0) {
      paymentMethods = patient.paymentMethods.map((pm: any) => ({
        id: pm.id.toString(),
        brand: pm.brand || 'card',
        last4: pm.last4 || '****',
        expMonth: pm.expiryMonth || 0,
        expYear: pm.expiryYear || 0,
        isDefault: pm.isDefault || false,
      }));
    }

    // Format invoices from local data
    const invoices = patient.invoices.map((inv: any) => ({
      id: inv.id.toString(),
      number: inv.invoiceNumber || `INV-${inv.id}`,
      amount: inv.amount ? inv.amount * 100 : 0,
      status: mapInvoiceStatus(inv.status),
      date: inv.createdAt.toISOString(),
      dueDate: inv.dueDate?.toISOString() || inv.createdAt.toISOString(),
      description: inv.description || 'Subscription',
      pdfUrl: inv.pdfUrl,
    }));

    try {
      await auditLog(req, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId ?? undefined,
        eventType: AuditEventType.PHI_VIEW,
        resourceType: 'Patient',
        resourceId: String(user.patientId),
        patientId: user.patientId,
        action: 'portal_billing',
        outcome: 'SUCCESS',
      });
    } catch (auditErr: unknown) {
      logger.warn('Failed to create HIPAA audit log for portal billing', {
        patientId: user.patientId,
        userId: user.id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    }

    return NextResponse.json({
      subscription,
      paymentMethods,
      invoices,
      upcomingInvoice,
    });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/patient-portal/billing',
      context: { userId: user?.id, patientId: user?.patientId },
    });
  }
}, { roles: ['patient'] });

function mapInvoiceStatus(status: string): 'paid' | 'pending' | 'failed' | 'refunded' {
  switch (status.toUpperCase()) {
    case 'PAID':
    case 'COMPLETE':
      return 'paid';
    case 'PENDING':
    case 'OPEN':
    case 'DRAFT':
      return 'pending';
    case 'FAILED':
    case 'UNCOLLECTIBLE':
      return 'failed';
    case 'REFUNDED':
      return 'refunded';
    default:
      return 'pending';
  }
}
