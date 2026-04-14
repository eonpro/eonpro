import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { logger } from '@/lib/logger';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

const querySchema = z.object({
  clinicId: z.string().transform((v) => parseInt(v)),
  startDate: z.string().transform((v) => new Date(v)),
  endDate: z.string().transform((v) => new Date(v)),
});

/**
 * GET /api/super-admin/clinic-statements
 * Returns a statement of account for a clinic within a date range.
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, _user: AuthUser) => {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'clinicId, startDate, and endDate are required', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { clinicId, startDate, endDate } = parsed.data;

    const result = await withoutClinicFilter(async () => {
      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true, adminEmail: true },
      });

      if (!clinic) {
        return { notFound: true as const };
      }

      const openingInvoices = await prisma.clinicPlatformInvoice.findMany({
        where: {
          clinicId,
          createdAt: { lt: startDate },
          status: { notIn: ['CANCELLED'] },
        },
        select: { totalAmountCents: true, paidAmountCents: true },
      });

      const openingBalance = openingInvoices.reduce(
        (sum, inv) => sum + inv.totalAmountCents - (inv.paidAmountCents ?? 0),
        0
      );

      // All invoices in the date range
      const invoices = await prisma.clinicPlatformInvoice.findMany({
        where: {
          clinicId,
          createdAt: { gte: startDate, lte: endDate },
          status: { notIn: ['CANCELLED'] },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          invoiceNumber: true,
          createdAt: true,
          dueDate: true,
          totalAmountCents: true,
          paidAmountCents: true,
          status: true,
          periodType: true,
          prescriptionFeeTotal: true,
          transmissionFeeTotal: true,
          adminFeeTotal: true,
          paymentHistory: true,
        },
      });

      // Build statement line items with running balance
      let runningBalance = openingBalance;
      const lineItems: {
        date: string;
        type: 'invoice' | 'payment' | 'credit';
        reference: string;
        description: string;
        debit: number;
        credit: number;
        balance: number;
      }[] = [];

      for (const inv of invoices) {
        // Invoice issued = debit
        runningBalance += inv.totalAmountCents;
        lineItems.push({
          date: new Date(inv.createdAt).toISOString(),
          type: 'invoice',
          reference: inv.invoiceNumber,
          description: `Invoice ${inv.invoiceNumber} (${inv.periodType})`,
          debit: inv.totalAmountCents,
          credit: 0,
          balance: runningBalance,
        });

        // Payments = credits
        const history = Array.isArray(inv.paymentHistory)
          ? (inv.paymentHistory as Record<string, unknown>[])
          : [];
        for (const p of history) {
          const amt = (p.amountCents as number) ?? 0;
          runningBalance -= amt;
          lineItems.push({
            date: (p.date as string) ?? new Date(inv.createdAt).toISOString(),
            type: p.method === 'credit_note' ? 'credit' : 'payment',
            reference: (p.reference as string) ?? '',
            description: `Payment via ${((p.method as string) ?? 'unknown').replace(/_/g, ' ')}`,
            debit: 0,
            credit: amt,
            balance: runningBalance,
          });
        }

        // If paid but no history, record a single payment
        if (history.length === 0 && (inv.paidAmountCents ?? 0) > 0) {
          runningBalance -= inv.paidAmountCents ?? 0;
          lineItems.push({
            date: new Date(inv.createdAt).toISOString(),
            type: 'payment',
            reference: inv.invoiceNumber,
            description: 'Payment received',
            debit: 0,
            credit: inv.paidAmountCents ?? 0,
            balance: runningBalance,
          });
        }
      }

      const totalDebits = lineItems.reduce((s, l) => s + l.debit, 0);
      const totalCredits = lineItems.reduce((s, l) => s + l.credit, 0);
      const closingBalance = runningBalance;

      // Pending (uninvoiced) fee events for this clinic within the date range
      const pendingFeeEvents = await prisma.platformFeeEvent.findMany({
        where: {
          clinicId,
          status: 'PENDING',
          createdAt: { gte: startDate, lte: endDate },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          feeType: true,
          amountCents: true,
          createdAt: true,
        },
      });

      const pendingFees = {
        events: pendingFeeEvents,
        totalCents: pendingFeeEvents.reduce((s, e) => s + e.amountCents, 0),
        count: pendingFeeEvents.length,
        prescriptionCount: pendingFeeEvents.filter((e) => e.feeType === 'PRESCRIPTION').length,
        transmissionCount: pendingFeeEvents.filter((e) => e.feeType === 'TRANSMISSION').length,
        adminCount: pendingFeeEvents.filter((e) => e.feeType === 'ADMIN').length,
      };

      return {
        clinic,
        period: { startDate, endDate },
        openingBalance,
        lineItems,
        totalDebits,
        totalCredits,
        closingBalance,
        invoiceCount: invoices.length,
        pendingFees,
      };
    }); // end withoutClinicFilter

    if ('notFound' in result) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error('[SuperAdmin] Statement error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json({ error: 'Failed to generate statement' }, { status: 500 });
  }
});
