/**
 * INVOICE SUMMARY & REPORTING API
 * ================================
 * Get invoice summaries and reports
 *
 * GET /api/v2/invoices/summary
 *
 * Query params:
 * - patientId: Get summary for specific patient
 * - range: today, this_week, this_month, this_quarter, this_year, custom
 * - startDate, endDate: For custom range
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

type DateRange = 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'this_year' | 'custom';

function getDateRange(
  range: DateRange,
  startDate?: string,
  endDate?: string
): { from: Date; to: Date } {
  const now = new Date();
  const to = endDate ? new Date(endDate) : now;
  let from: Date;

  switch (range) {
    case 'today':
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'this_week':
      const dayOfWeek = now.getDay();
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      break;
    case 'this_month':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'this_quarter':
      const quarter = Math.floor(now.getMonth() / 3);
      from = new Date(now.getFullYear(), quarter * 3, 1);
      break;
    case 'this_year':
      from = new Date(now.getFullYear(), 0, 1);
      break;
    case 'custom':
      from = startDate ? new Date(startDate) : new Date(now.getFullYear(), 0, 1);
      break;
    default:
      from = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { from, to };
}

async function getInvoiceSummaryHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const url = new URL(req.url);
    const patientId = url.searchParams.get('patientId');
    const range = (url.searchParams.get('range') || 'this_month') as DateRange;
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;

    const { from, to } = getDateRange(range, startDate, endDate);

    const whereClause: any = {
      createdAt: { gte: from, lte: to },
      ...(user.clinicId && { clinicId: user.clinicId }),
      ...(patientId && { patientId: parseInt(patientId) }),
    };

    // Get all invoices in range
    const invoices = await prisma.invoice.findMany({
      where: whereClause,
      include: { payments: true },
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });

    // Calculate metrics
    const now = new Date();
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let overdueAmount = 0;
    let draftCount = 0;
    let openCount = 0;
    let paidCount = 0;
    let voidCount = 0;
    let overdueCount = 0;

    const byStatus: Record<string, number> = {};
    const byMonth: Record<string, { invoiced: number; collected: number }> = {};
    const recentInvoices: any[] = [];

    for (const inv of invoices) {
      const invAmount = inv.amount ?? 0;
      totalInvoiced += invAmount;
      totalPaid += inv.amountPaid || 0;

      // Count by status
      byStatus[inv.status] = (byStatus[inv.status] || 0) + 1;

      // Group by month
      const monthKey = `${inv.createdAt.getFullYear()}-${String(inv.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { invoiced: 0, collected: 0 };
      }
      byMonth[monthKey].invoiced += invAmount;
      byMonth[monthKey].collected += inv.amountPaid || 0;

      // Status counts
      switch (inv.status) {
        case 'DRAFT':
          draftCount++;
          break;
        case 'OPEN':
          openCount++;
          totalOutstanding += inv.amountDue ?? invAmount;
          if (inv.dueDate && inv.dueDate < now) {
            overdueCount++;
            overdueAmount += inv.amountDue ?? invAmount;
          }
          break;
        case 'PAID':
          paidCount++;
          break;
        case 'VOID':
          voidCount++;
          break;
      }
    }

    // Get recent invoices
    const recent = await prisma.invoice.findMany({
      where: {
        ...(user.clinicId && { clinicId: user.clinicId }),
        ...(patientId && { patientId: parseInt(patientId) }),
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Get overdue invoices
    const overdue = await prisma.invoice.findMany({
      where: {
        status: 'OPEN',
        dueDate: { lt: now },
        ...(user.clinicId && { clinicId: user.clinicId }),
        ...(patientId && { patientId: parseInt(patientId) }),
      },
      include: {
        patient: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 20,
    });

    // Calculate collection rate
    const collectionRate = totalInvoiced > 0 ? (totalPaid / totalInvoiced) * 100 : 0;

    // Calculate average payment time
    type InvoiceType = (typeof invoices)[number];
    const paidInvoices = invoices.filter((i: InvoiceType) => i.status === 'PAID' && i.paidAt);
    let avgPaymentDays = 0;
    if (paidInvoices.length > 0) {
      const totalDays = paidInvoices.reduce((sum: number, inv: InvoiceType) => {
        const days = Math.floor(
          (inv.paidAt!.getTime() - inv.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        return sum + days;
      }, 0);
      avgPaymentDays = Math.round(totalDays / paidInvoices.length);
    }

    return NextResponse.json({
      period: { from, to, range },
      summary: {
        totalInvoiced,
        totalPaid,
        totalOutstanding,
        overdueAmount,
        collectionRate: Math.round(collectionRate * 100) / 100,
        avgPaymentDays,
      },
      counts: {
        total: invoices.length,
        draft: draftCount,
        open: openCount,
        paid: paidCount,
        void: voidCount,
        overdue: overdueCount,
      },
      byStatus,
      byMonth: Object.entries(byMonth)
        .map(([month, data]) => ({
          month,
          ...data,
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      recentInvoices: recent.map((inv: (typeof recent)[number]) => {
        let patientName = 'Unknown';
        if (inv.patient) {
          try {
            const decrypted = decryptPatientPHI(inv.patient as Record<string, unknown>, [
              'firstName',
              'lastName',
            ]);
            patientName =
              `${decrypted.firstName || ''} ${decrypted.lastName || ''}`.trim() || 'Unknown';
          } catch {
            patientName = 'Unknown';
          }
        }
        return {
          id: inv.id,
          patient: patientName,
          amount: inv.amount,
          status: inv.status,
          dueDate: inv.dueDate,
          createdAt: inv.createdAt,
        };
      }),
      overdueInvoices: overdue.map((inv: (typeof overdue)[number]) => {
        let patientData = { name: 'Unknown', email: inv.patient?.email, phone: inv.patient?.phone };
        if (inv.patient) {
          try {
            const decrypted = decryptPatientPHI(inv.patient as Record<string, unknown>, [
              'firstName',
              'lastName',
              'email',
              'phone',
            ]);
            patientData = {
              name: `${decrypted.firstName || ''} ${decrypted.lastName || ''}`.trim() || 'Unknown',
              email: (decrypted.email as string) || inv.patient?.email || '',
              phone: (decrypted.phone as string) || inv.patient?.phone || '',
            };
          } catch {
            patientData.name = 'Unknown';
          }
        }
        return {
          id: inv.id,
          patient: patientData,
          amount: inv.amount,
          amountDue: inv.amountDue,
          dueDate: inv.dueDate,
          daysPastDue: Math.floor(
            (now.getTime() - (inv.dueDate?.getTime() || 0)) / (1000 * 60 * 60 * 24)
          ),
        };
      }),
    });
  } catch (error: any) {
    logger.error('Failed to get invoice summary', error);
    return NextResponse.json({ error: error.message || 'Failed to get summary' }, { status: 500 });
  }
}

export const GET = standardRateLimit(withProviderAuth(getInvoiceSummaryHandler));
