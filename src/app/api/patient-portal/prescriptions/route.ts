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
import { logger } from '@/lib/logger';
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
    try {
      return await fn();
    } catch (err) {
      logger.error('[Prescriptions] DB query failed', {
        error: err instanceof Error ? err.message : String(err),
        patientId,
      });
      return fallback;
    }
  };

  const [orders, subscription, invoices] = await Promise.all([
    safeQuery(
      async () =>
        prisma.order.findMany({
          where: { patientId },
          include: {
            rxs: {
              select: {
                id: true,
                medicationKey: true,
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
        }),
      []
    ),
    safeQuery(
      async () =>
        prisma.subscription.findFirst({
          where: { patientId, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
        }),
      null
    ),
    safeQuery(
      async () =>
        prisma.invoice.findMany({
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
            stripeInvoiceId: true,
            stripeInvoiceNumber: true,
          },
        }),
      []
    ),
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
      medicationKey: rx.medicationKey,
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

  // Deduplicate invoices for the patient portal.
  // Multiple Stripe webhooks (invoice.paid, subscription.created, payment_intent.succeeded)
  // each create a separate Invoice DB row for the same real-world payment.
  // Patients should see ONE entry per actual charge.
  //
  // Strategy:
  // 1. Deduplicate by stripeInvoiceId (same Stripe invoice = same payment)
  // 2. Group PAID invoices within a 72-hour window into one entry
  //    (handles timezone differences where records span UTC day boundaries)
  // 3. Keep the record with the most informative description
  const GENERIC = /subscription creation|payment received|payment successful/i;

  type Inv = (typeof invoices)[number];

  function pickBetter(existing: Inv, candidate: Inv): Inv {
    const existingIsGeneric = GENERIC.test(existing.description ?? '');
    const candidateIsGeneric = GENERIC.test(candidate.description ?? '');
    if (existingIsGeneric && !candidateIsGeneric) return candidate;
    if (!existingIsGeneric && candidateIsGeneric) return existing;
    return (candidate.description?.length ?? 0) > (existing.description?.length ?? 0)
      ? candidate
      : existing;
  }

  // Step 1: deduplicate by stripeInvoiceId
  const byStripeId = new Map<string, Inv>();
  const noStripeId: Inv[] = [];
  for (const inv of invoices) {
    if (inv.stripeInvoiceId) {
      const existing = byStripeId.get(inv.stripeInvoiceId);
      byStripeId.set(inv.stripeInvoiceId, existing ? pickBetter(existing, inv) : inv);
    } else {
      noStripeId.push(inv);
    }
  }
  const afterStripeDedup = [...byStripeId.values(), ...noStripeId];

  // Step 2: group PAID invoices within 72-hour windows
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const paidSorted = afterStripeDedup
    .filter((inv) => inv.status === 'PAID')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const nonPaid = afterStripeDedup.filter((inv) => inv.status !== 'PAID');

  const paidGroups: Inv[][] = [];
  for (const inv of paidSorted) {
    const lastGroup = paidGroups[paidGroups.length - 1];
    if (lastGroup && inv.createdAt.getTime() - lastGroup[0].createdAt.getTime() < THREE_DAYS_MS) {
      lastGroup.push(inv);
    } else {
      paidGroups.push([inv]);
    }
  }

  const dedupedPaid = paidGroups.map((group) => group.reduce((best, inv) => pickBetter(best, inv)));

  const invoiceHistory = [...dedupedPaid, ...nonPaid]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((inv) => ({
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
