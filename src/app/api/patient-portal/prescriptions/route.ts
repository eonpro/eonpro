/**
 * Patient Prescriptions API
 * =========================
 * Returns the patient's prescription orders, active subscription plan,
 * and invoice history so the portal can display medications on file,
 * the billing cadence (monthly / quarterly / 6-month / annual), and
 * a lightweight payment timeline.
 *
 * GET /api/patient-portal/prescriptions
 */

import { type NextRequest, NextResponse } from 'next/server';

import { handleApiError } from '@/domains/shared/errors';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';
import { type AuthUser, withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';

function derivePlanLabel(sub: {
  planName: string;
  interval: string;
  intervalCount: number;
  vialCount: number;
}): string {
  if (sub.intervalCount === 12 || (sub.interval === 'year' && sub.intervalCount === 1)) {
    return 'Annual Plan (12 Months)';
  }
  if (sub.vialCount === 6 || sub.intervalCount === 6) {
    return '6-Month Plan';
  }
  if (sub.vialCount === 3 || sub.intervalCount === 3) {
    return 'Quarterly Plan (3 Months)';
  }
  if (sub.vialCount === 1 && sub.intervalCount === 1) {
    return 'Monthly Plan';
  }
  return sub.planName || 'Subscription Plan';
}

function derivePlanInterval(sub: {
  interval: string;
  intervalCount: number;
  vialCount: number;
}): string {
  if (sub.intervalCount === 12 || (sub.interval === 'year' && sub.intervalCount === 1)) {
    return 'annual';
  }
  if (sub.vialCount === 6 || sub.intervalCount === 6) return '6-month';
  if (sub.vialCount === 3 || sub.intervalCount === 3) return 'quarterly';
  return 'monthly';
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function fetchPatientPrescriptions(req: NextRequest, user: AuthUser, patientId: number) {

  const safeQuery = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };

  const [orders, subscription, invoices] = await Promise.all([
    safeQuery(async () => prisma.order.findMany({
      where: { patientId },
      include: {
        rxs: {
          select: {
            id: true,
            medName: true,
            strength: true,
            form: true,
            quantity: true,
            sig: true,
            daysSupply: true,
          },
        },
        provider: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }), []),
    safeQuery(async () => prisma.subscription.findFirst({
      where: { patientId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    }), null),
    safeQuery(async () => prisma.invoice.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        amount: true,
        amountPaid: true,
        status: true,
        description: true,
        stripeInvoiceNumber: true,
      },
    }), []),
  ]);

  await logPHIAccess(req, user, 'Prescription', String(patientId), patientId);

  const prescriptions = orders.map((order) => ({
    id: order.id,
    status: order.status ?? 'unknown',
    prescribedDate: order.createdAt.toISOString(),
    provider: {
      name: `${order.provider.firstName} ${order.provider.lastName}`.trim(),
    },
    medications: order.rxs.map((rx) => ({
      id: rx.id,
      name: rx.medName,
      strength: rx.strength,
      form: rx.form,
      quantity: rx.quantity,
      directions: rx.sig,
      daysSupply: rx.daysSupply,
    })),
    shipping: {
      status: order.shippingStatus ?? order.status ?? 'pending',
      trackingNumber: order.trackingNumber ?? null,
    },
  }));

  let plan = null;
  if (subscription) {
    plan = {
      id: subscription.id,
      name: derivePlanLabel(subscription),
      status: subscription.status,
      interval: derivePlanInterval(subscription),
      amount: subscription.amount,
      currency: subscription.currency,
      nextBillingDate: subscription.nextBillingDate?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      startDate: subscription.startDate.toISOString(),
      vialCount: subscription.vialCount,
    };
  }

  const invoiceHistory = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.stripeInvoiceNumber ?? `INV-${inv.id}`,
    date: inv.createdAt.toISOString(),
    amount: inv.amount,
    amountPaid: inv.amountPaid,
    status: inv.status,
    description: inv.description ?? '',
  }));

  return { prescriptions, plan, invoiceHistory };
}

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      if (!user.patientId) {
        return NextResponse.json(
          { error: 'Patient ID required', code: 'PATIENT_ID_REQUIRED' },
          { status: 400 }
        );
      }

      const data = await fetchPatientPrescriptions(req, user, user.patientId);
      return NextResponse.json(data);
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'GET /api/patient-portal/prescriptions' },
      });
    }
  },
  { roles: ['patient'] }
);
