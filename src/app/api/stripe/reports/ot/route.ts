/**
 * OT (Overtime) Comprehensive Financial Reports API
 *
 * GET /api/stripe/reports/ot - Generate comprehensive financial reports for OT clinic
 *
 * Report Types:
 * - executive: High-level KPIs and metrics for leadership
 * - revenue: Detailed revenue breakdown with trends
 * - affiliate: Affiliate attribution and commission tracking
 * - patients: Patient acquisition and lifetime value
 * - transactions: Detailed transaction log with filtering
 * - products: Product/treatment performance analysis
 * - reconciliation: Payment reconciliation for accounting
 *
 * PROTECTED: Requires admin authentication + OT clinic access
 * ISOLATED: Only accessible from ot.eonpro.io or with OT clinic context
 */

import { NextRequest, NextResponse } from 'next/server';
import { formatCurrency } from '@/lib/stripe';
import { getStripeForClinic, hasDedicatedAccount } from '@/lib/stripe/connect';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import Stripe from 'stripe';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ReportFilters {
  startDate: Date;
  endDate: Date;
  groupBy: 'day' | 'week' | 'month';
  productCategory?: string;
  affiliateId?: number;
  paymentMethod?: string;
}

interface ExecutiveReport {
  period: { start: string; end: string };
  kpis: {
    totalRevenue: number;
    totalRevenueFormatted: string;
    netRevenue: number;
    netRevenueFormatted: string;
    totalTransactions: number;
    averageOrderValue: number;
    averageOrderValueFormatted: string;
    newPatients: number;
    conversionRate: string;
    refundRate: string;
    disputeRate: string;
  };
  comparison?: {
    revenueChange: number;
    revenueChangePercent: string;
    transactionChange: number;
    patientChange: number;
  };
  topProducts: Array<{
    name: string;
    revenue: number;
    revenueFormatted: string;
    count: number;
    share: string;
  }>;
  revenueByDay: Array<{
    date: string;
    revenue: number;
    revenueFormatted: string;
    transactions: number;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function getOTReportsHandler(request: NextRequest, user: AuthUser) {
  const startTime = Date.now();

  try {
    // Only admins can view financial reports
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }

    // Get OT clinic
    const otClinic = await prisma.clinic.findFirst({
      where: { subdomain: 'ot', status: 'ACTIVE' },
      select: { id: true, name: true, subdomain: true },
    });

    if (!otClinic) {
      return NextResponse.json({ error: 'OT clinic not found' }, { status: 404 });
    }

    // Verify user has access to OT clinic (or is super_admin)
    if (user.role !== 'super_admin' && user.clinicId !== otClinic.id) {
      logger.warn('[OT REPORTS] Unauthorized access attempt', {
        userId: user.id,
        userClinicId: user.clinicId,
        otClinicId: otClinic.id,
      });
      return NextResponse.json(
        { error: 'Access denied - OT clinic access required' },
        { status: 403 }
      );
    }

    // Verify OT has dedicated Stripe account configured
    if (!hasDedicatedAccount('ot')) {
      return NextResponse.json(
        {
          error: 'OT Stripe account not configured',
          code: 'OT_STRIPE_NOT_CONFIGURED',
        },
        { status: 503 }
      );
    }

    // Get OT's Stripe context
    const stripeContext = await getStripeForClinic(otClinic.id);
    if (!stripeContext.isDedicatedAccount) {
      return NextResponse.json({ error: 'Invalid Stripe configuration for OT' }, { status: 500 });
    }

    const { stripe } = stripeContext;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const reportType = searchParams.get('type') || 'executive';
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : getDefaultStartDate();
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : new Date();
    const groupBy = (searchParams.get('groupBy') as 'day' | 'week' | 'month') || 'day';
    const exportFormat = searchParams.get('export'); // 'csv' or 'json'

    const filters: ReportFilters = {
      startDate,
      endDate,
      groupBy,
      productCategory: searchParams.get('category') || undefined,
      affiliateId: searchParams.get('affiliateId')
        ? parseInt(searchParams.get('affiliateId')!)
        : undefined,
      paymentMethod: searchParams.get('paymentMethod') || undefined,
    };

    let reportData: unknown;

    switch (reportType) {
      case 'executive':
        reportData = await generateExecutiveReport(stripe, otClinic.id, filters);
        break;
      case 'revenue':
        reportData = await generateRevenueReport(stripe, otClinic.id, filters);
        break;
      case 'affiliate':
        reportData = await generateAffiliateReport(stripe, otClinic.id, filters);
        break;
      case 'patients':
        reportData = await generatePatientReport(stripe, otClinic.id, filters);
        break;
      case 'transactions':
        reportData = await generateTransactionReport(stripe, otClinic.id, filters, searchParams);
        break;
      case 'products':
        reportData = await generateProductReport(stripe, otClinic.id, filters);
        break;
      case 'reconciliation':
        reportData = await generateReconciliationReport(stripe, otClinic.id, filters);
        break;
      default:
        return NextResponse.json(
          {
            error: 'Invalid report type',
            availableTypes: [
              'executive',
              'revenue',
              'affiliate',
              'patients',
              'transactions',
              'products',
              'reconciliation',
            ],
          },
          { status: 400 }
        );
    }

    const duration = Date.now() - startTime;

    logger.info('[OT REPORTS] Generated report', {
      type: reportType,
      startDate: filters.startDate.toISOString(),
      endDate: filters.endDate.toISOString(),
      duration,
      userId: user.id,
    });

    // Handle export formats
    if (exportFormat === 'csv') {
      const csv = convertToCSV(reportData, reportType);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="ot-${reportType}-report-${filters.startDate.toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      clinic: {
        id: otClinic.id,
        name: otClinic.name,
        subdomain: otClinic.subdomain,
      },
      report: {
        type: reportType,
        period: {
          start: filters.startDate.toISOString(),
          end: filters.endDate.toISOString(),
        },
        generatedAt: new Date().toISOString(),
        generationTimeMs: duration,
        data: reportData,
      },
    });
  } catch (error) {
    logger.error('[OT REPORTS] Error generating report:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate report',
        code: 'REPORT_GENERATION_FAILED',
      },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getOTReportsHandler);

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTIVE REPORT - High-level KPIs
// ═══════════════════════════════════════════════════════════════════════════

async function generateExecutiveReport(
  stripe: Stripe,
  clinicId: number,
  filters: ReportFilters
): Promise<ExecutiveReport> {
  const startTimestamp = Math.floor(filters.startDate.getTime() / 1000);
  const endTimestamp = Math.floor(filters.endDate.getTime() / 1000);

  // Fetch all necessary data in parallel
  const [charges, refunds, disputes, balance, newPatientsCount, previousPeriodCharges] =
    await Promise.all([
      fetchAllCharges(stripe, { created: { gte: startTimestamp, lte: endTimestamp } }),
      fetchAllRefunds(stripe, { created: { gte: startTimestamp, lte: endTimestamp } }),
      stripe.disputes.list({
        created: { gte: startTimestamp, lte: endTimestamp },
        limit: 100,
      }),
      stripe.balance.retrieve(),
      // Count new patients in our database for this period
      prisma.patient.count({
        where: {
          clinicId,
          createdAt: {
            gte: filters.startDate,
            lte: filters.endDate,
          },
        },
      }),
      // Previous period for comparison
      fetchAllCharges(stripe, {
        created: {
          gte: startTimestamp - (endTimestamp - startTimestamp),
          lte: startTimestamp - 1,
        },
      }),
    ]);

  const successfulCharges = charges.filter((c) => c.status === 'succeeded');
  const totalRevenue = successfulCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalRefunds = refunds.reduce((sum, r) => sum + r.amount, 0);
  const netRevenue = totalRevenue - totalRefunds;

  // Previous period metrics
  const prevSuccessfulCharges = previousPeriodCharges.filter((c) => c.status === 'succeeded');
  const prevRevenue = prevSuccessfulCharges.reduce((sum, c) => sum + c.amount, 0);

  // Calculate product breakdown
  const productBreakdown = calculateProductBreakdown(successfulCharges);

  // Calculate daily revenue
  const dailyRevenue = calculateDailyRevenue(successfulCharges, filters);

  return {
    period: {
      start: filters.startDate.toISOString(),
      end: filters.endDate.toISOString(),
    },
    kpis: {
      totalRevenue,
      totalRevenueFormatted: formatCurrency(totalRevenue),
      netRevenue,
      netRevenueFormatted: formatCurrency(netRevenue),
      totalTransactions: successfulCharges.length,
      averageOrderValue:
        successfulCharges.length > 0 ? Math.round(totalRevenue / successfulCharges.length) : 0,
      averageOrderValueFormatted:
        successfulCharges.length > 0
          ? formatCurrency(Math.round(totalRevenue / successfulCharges.length))
          : '$0.00',
      newPatients: newPatientsCount,
      conversionRate: 'N/A', // Would need visitor data
      refundRate:
        successfulCharges.length > 0
          ? ((refunds.length / successfulCharges.length) * 100).toFixed(2) + '%'
          : '0%',
      disputeRate:
        successfulCharges.length > 0
          ? ((disputes.data.length / successfulCharges.length) * 100).toFixed(2) + '%'
          : '0%',
    },
    comparison: {
      revenueChange: totalRevenue - prevRevenue,
      revenueChangePercent:
        prevRevenue > 0
          ? (((totalRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1) + '%'
          : 'N/A',
      transactionChange: successfulCharges.length - prevSuccessfulCharges.length,
      patientChange: 0, // Would need previous period patient count
    },
    topProducts: productBreakdown.slice(0, 5),
    revenueByDay: dailyRevenue,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// REVENUE REPORT - Detailed revenue breakdown
// ═══════════════════════════════════════════════════════════════════════════

async function generateRevenueReport(stripe: Stripe, clinicId: number, filters: ReportFilters) {
  const startTimestamp = Math.floor(filters.startDate.getTime() / 1000);
  const endTimestamp = Math.floor(filters.endDate.getTime() / 1000);

  const [charges, refunds, balanceTransactions] = await Promise.all([
    fetchAllCharges(stripe, { created: { gte: startTimestamp, lte: endTimestamp } }),
    fetchAllRefunds(stripe, { created: { gte: startTimestamp, lte: endTimestamp } }),
    stripe.balanceTransactions.list({
      created: { gte: startTimestamp, lte: endTimestamp },
      limit: 100,
      type: 'charge',
    }),
  ]);

  const successfulCharges = charges.filter((c) => c.status === 'succeeded');
  const totalGross = successfulCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalRefunded = refunds.reduce((sum, r) => sum + r.amount, 0);
  const totalFees = balanceTransactions.data.reduce((sum, tx) => sum + tx.fee, 0);
  const netRevenue = totalGross - totalRefunded - totalFees;

  // Group by time period
  const periodRevenue = groupRevenueByPeriod(successfulCharges, filters.groupBy);

  // Payment method breakdown
  const paymentMethodBreakdown = calculatePaymentMethodBreakdown(successfulCharges);

  // Calculate trends
  const trends = calculateRevenueTrends(periodRevenue);

  return {
    summary: {
      grossRevenue: totalGross,
      grossRevenueFormatted: formatCurrency(totalGross),
      refunds: totalRefunded,
      refundsFormatted: formatCurrency(totalRefunded),
      stripeFees: totalFees,
      stripeFeesFormatted: formatCurrency(totalFees),
      netRevenue,
      netRevenueFormatted: formatCurrency(netRevenue),
      effectiveFeeRate: totalGross > 0 ? ((totalFees / totalGross) * 100).toFixed(2) + '%' : '0%',
      transactionCount: successfulCharges.length,
      averageTransactionValue:
        successfulCharges.length > 0 ? Math.round(totalGross / successfulCharges.length) : 0,
      averageTransactionValueFormatted:
        successfulCharges.length > 0
          ? formatCurrency(Math.round(totalGross / successfulCharges.length))
          : '$0.00',
    },
    byPeriod: periodRevenue,
    byPaymentMethod: paymentMethodBreakdown,
    trends,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AFFILIATE REPORT - Attribution and commission tracking
// ═══════════════════════════════════════════════════════════════════════════

async function generateAffiliateReport(stripe: Stripe, clinicId: number, filters: ReportFilters) {
  const startTimestamp = Math.floor(filters.startDate.getTime() / 1000);
  const endTimestamp = Math.floor(filters.endDate.getTime() / 1000);

  // Get patients with affiliate attribution in this period
  const attributedPatients = await prisma.patient.findMany({
    where: {
      clinicId,
      attributionAffiliateId: { not: null },
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    },
    include: {
      attributionAffiliate: {
        select: {
          id: true,
          displayName: true,
          refCodes: {
            select: { refCode: true },
            take: 1,
          },
        },
      },
    },
  });

  // Get affiliate commission events for this period
  const affiliateEvents = await prisma.affiliateCommissionEvent.findMany({
    where: {
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
      clinicId,
    },
    include: {
      affiliate: {
        select: {
          id: true,
          displayName: true,
          refCodes: {
            select: { refCode: true },
            take: 1,
          },
        },
      },
    },
  });

  // All commission events count as conversions
  const conversions = affiliateEvents;

  // Aggregate by affiliate
  const affiliateBreakdown: Record<
    number,
    {
      id: number;
      name: string;
      referralCode: string;
      signups: number;
      conversions: number;
      revenue: number;
      commissionEarned: number;
    }
  > = {};

  for (const patient of attributedPatients) {
    if (!(patient as any).attributionAffiliate) continue;

    const aff = (patient as any).attributionAffiliate;
    const affId = aff.id;
    if (!affiliateBreakdown[affId]) {
      affiliateBreakdown[affId] = {
        id: affId,
        name: aff.displayName,
        referralCode: aff.refCodes?.[0]?.code || '',
        signups: 0,
        conversions: 0,
        revenue: 0,
        commissionEarned: 0,
      };
    }
    affiliateBreakdown[affId].signups++;
  }

  for (const event of conversions) {
    const aff = (event as any).affiliate;
    if (!aff) continue;

    const affId = aff.id;
    if (!affiliateBreakdown[affId]) {
      affiliateBreakdown[affId] = {
        id: affId,
        name: aff.displayName,
        referralCode: aff.refCodes?.[0]?.refCode || '',
        signups: 0,
        conversions: 0,
        revenue: 0,
        commissionEarned: 0,
      };
    }
    affiliateBreakdown[affId].conversions++;
    affiliateBreakdown[affId].revenue += event.eventAmountCents || 0;
    affiliateBreakdown[affId].commissionEarned += event.commissionAmountCents || 0;
  }

  const affiliates = Object.values(affiliateBreakdown)
    .map((a) => ({
      ...a,
      revenueFormatted: formatCurrency(a.revenue),
      commissionEarnedFormatted: formatCurrency(a.commissionEarned),
      conversionRate: a.signups > 0 ? ((a.conversions / a.signups) * 100).toFixed(1) + '%' : '0%',
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = affiliates.reduce((sum, a) => sum + a.revenue, 0);
  const totalCommissions = affiliates.reduce((sum, a) => sum + a.commissionEarned, 0);

  return {
    summary: {
      totalAffiliates: affiliates.length,
      totalSignups: affiliates.reduce((sum, a) => sum + a.signups, 0),
      totalConversions: affiliates.reduce((sum, a) => sum + a.conversions, 0),
      totalRevenue,
      totalRevenueFormatted: formatCurrency(totalRevenue),
      totalCommissions,
      totalCommissionsFormatted: formatCurrency(totalCommissions),
      averageConversionRate:
        attributedPatients.length > 0
          ? ((conversions.length / attributedPatients.length) * 100).toFixed(1) + '%'
          : '0%',
    },
    byAffiliate: affiliates,
    recentConversions: conversions.slice(0, 20).map((e: any) => ({
      id: e.id,
      affiliateName: e.affiliate?.displayName || 'Unknown',
      patientName: 'N/A', // No patient relation on commission events
      amount: e.eventAmountCents || 0,
      amountFormatted: formatCurrency(e.eventAmountCents || 0),
      commission: e.commissionAmountCents || 0,
      commissionFormatted: formatCurrency(e.commissionAmountCents || 0),
      date: e.createdAt.toISOString(),
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PATIENT REPORT - Acquisition and lifetime value
// ═══════════════════════════════════════════════════════════════════════════

async function generatePatientReport(stripe: Stripe, clinicId: number, filters: ReportFilters) {
  const startTimestamp = Math.floor(filters.startDate.getTime() / 1000);
  const endTimestamp = Math.floor(filters.endDate.getTime() / 1000);

  // Get new patients in period
  const newPatients = await prisma.patient.findMany({
    where: {
      clinicId,
      createdAt: {
        gte: filters.startDate,
        lte: filters.endDate,
      },
    },
    include: {
      attributionAffiliate: {
        select: {
          displayName: true,
          refCodes: {
            select: { refCode: true },
            take: 1,
          },
        },
      },
    },
  });

  // Get all charges to calculate patient spending
  const charges = await fetchAllCharges(stripe, {
    created: { gte: startTimestamp, lte: endTimestamp },
  });

  const successfulCharges = charges.filter((c) => c.status === 'succeeded');

  // Match charges to patients via email
  const patientSpending: Record<
    number,
    { total: number; transactions: number; firstPurchase: Date | null }
  > = {};

  for (const charge of successfulCharges) {
    const email = charge.billing_details?.email || charge.receipt_email;
    if (!email) continue;

    // Find patient by email
    const patient = await prisma.patient.findFirst({
      where: { clinicId, email: email.toLowerCase() },
      select: { id: true },
    });

    if (patient) {
      if (!patientSpending[patient.id]) {
        patientSpending[patient.id] = { total: 0, transactions: 0, firstPurchase: null };
      }
      patientSpending[patient.id].total += charge.amount;
      patientSpending[patient.id].transactions++;

      const chargeDate = new Date(charge.created * 1000);
      const currentFirstPurchase = patientSpending[patient.id].firstPurchase;
      if (!currentFirstPurchase || chargeDate < currentFirstPurchase) {
        patientSpending[patient.id].firstPurchase = chargeDate;
      }
    }
  }

  type PatientSpendingValue = { total: number; transactions: number; firstPurchase: Date | null };
  const spendingValues = Object.values(patientSpending).map((p: PatientSpendingValue) => p.total);
  const totalPatientSpending = spendingValues.reduce((sum: number, s: number) => sum + s, 0);
  const payingPatients = Object.keys(patientSpending).length;

  // Acquisition channels
  type PatientRecord = (typeof newPatients)[number];
  const channelBreakdown = {
    affiliate: newPatients.filter((p: PatientRecord) => p.attributionAffiliateId).length,
    direct: newPatients.filter(
      (p: PatientRecord) => !p.attributionAffiliateId && !p.attributionRefCode
    ).length,
    referralCode: newPatients.filter(
      (p: PatientRecord) => p.attributionRefCode && !p.attributionAffiliateId
    ).length,
  };

  // Calculate LTV buckets
  const ltvBuckets = {
    'No purchases': newPatients.filter((p: PatientRecord) => !patientSpending[p.id]).length,
    'Under $200': spendingValues.filter((s) => s > 0 && s < 20000).length,
    '$200-$500': spendingValues.filter((s) => s >= 20000 && s < 50000).length,
    '$500-$1000': spendingValues.filter((s) => s >= 50000 && s < 100000).length,
    'Over $1000': spendingValues.filter((s) => s >= 100000).length,
  };

  return {
    summary: {
      newPatients: newPatients.length,
      payingPatients,
      conversionRate:
        newPatients.length > 0
          ? ((payingPatients / newPatients.length) * 100).toFixed(1) + '%'
          : '0%',
      totalSpending: totalPatientSpending,
      totalSpendingFormatted: formatCurrency(totalPatientSpending),
      averageLTV: payingPatients > 0 ? Math.round(totalPatientSpending / payingPatients) : 0,
      averageLTVFormatted:
        payingPatients > 0
          ? formatCurrency(Math.round(totalPatientSpending / payingPatients))
          : '$0.00',
      averageTransactionsPerPatient:
        payingPatients > 0
          ? (
              Object.values(patientSpending).reduce((sum, p) => sum + p.transactions, 0) /
              payingPatients
            ).toFixed(1)
          : '0',
    },
    acquisitionChannels: Object.entries(channelBreakdown).map(([channel, count]) => ({
      channel,
      count,
      percentage:
        newPatients.length > 0 ? ((count / newPatients.length) * 100).toFixed(1) + '%' : '0%',
    })),
    ltvDistribution: Object.entries(ltvBuckets).map(([bucket, count]) => ({
      bucket,
      count,
      percentage:
        newPatients.length > 0 ? ((count / newPatients.length) * 100).toFixed(1) + '%' : '0%',
    })),
    topPatients: Object.entries(patientSpending)
      .map(([id, data]) => ({
        patientId: parseInt(id),
        totalSpent: data.total,
        totalSpentFormatted: formatCurrency(data.total),
        transactions: data.transactions,
        firstPurchase: data.firstPurchase?.toISOString() || null,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION REPORT - Detailed transaction log
// ═══════════════════════════════════════════════════════════════════════════

async function generateTransactionReport(
  stripe: Stripe,
  clinicId: number,
  filters: ReportFilters,
  searchParams: URLSearchParams
) {
  const startTimestamp = Math.floor(filters.startDate.getTime() / 1000);
  const endTimestamp = Math.floor(filters.endDate.getTime() / 1000);

  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
  const startingAfter = searchParams.get('cursor') || undefined;
  const status = searchParams.get('status') || 'all';

  // Fetch charges with pagination
  const chargeParams: Stripe.ChargeListParams = {
    created: { gte: startTimestamp, lte: endTimestamp },
    limit,
    expand: ['data.customer', 'data.balance_transaction'],
    ...(startingAfter && { starting_after: startingAfter }),
  };

  const charges = await stripe.charges.list(chargeParams);

  // Filter by status if specified
  let filteredCharges = charges.data;
  if (status !== 'all') {
    filteredCharges = charges.data.filter((c) => c.status === status);
  }

  // Get refunds for refunded charges
  const refunds = await stripe.refunds.list({
    created: { gte: startTimestamp, lte: endTimestamp },
    limit: 100,
  });

  const refundsByCharge: Record<string, Stripe.Refund[]> = {};
  refunds.data.forEach((r) => {
    const chargeId = typeof r.charge === 'string' ? r.charge : r.charge?.id;
    if (chargeId) {
      if (!refundsByCharge[chargeId]) refundsByCharge[chargeId] = [];
      refundsByCharge[chargeId].push(r);
    }
  });

  // Format transactions
  const transactions = filteredCharges.map((charge) => {
    const customer = charge.customer as Stripe.Customer | null;
    const balanceTx = charge.balance_transaction as Stripe.BalanceTransaction | null;
    const chargeRefunds = refundsByCharge[charge.id] || [];

    return {
      id: charge.id,
      created: new Date(charge.created * 1000).toISOString(),
      amount: charge.amount,
      amountFormatted: formatCurrency(charge.amount),
      currency: charge.currency.toUpperCase(),
      status: charge.status,
      description: charge.description,
      customerEmail: customer?.email || charge.billing_details?.email || charge.receipt_email,
      customerName: customer?.name || charge.billing_details?.name,
      customerId: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id,
      paymentMethod: charge.payment_method_details?.type || 'unknown',
      card: charge.payment_method_details?.card
        ? {
            brand: charge.payment_method_details.card.brand,
            last4: charge.payment_method_details.card.last4,
            expMonth: charge.payment_method_details.card.exp_month,
            expYear: charge.payment_method_details.card.exp_year,
          }
        : null,
      fees: balanceTx?.fee || 0,
      feesFormatted: formatCurrency(balanceTx?.fee || 0),
      net: balanceTx?.net || charge.amount,
      netFormatted: formatCurrency(balanceTx?.net || charge.amount),
      refunded: charge.refunded,
      refundedAmount: charge.amount_refunded,
      refundedAmountFormatted: formatCurrency(charge.amount_refunded),
      refunds: chargeRefunds.map((r) => ({
        id: r.id,
        amount: r.amount,
        amountFormatted: formatCurrency(r.amount),
        reason: r.reason,
        created: new Date(r.created * 1000).toISOString(),
      })),
      receiptUrl: charge.receipt_url,
      metadata: charge.metadata,
      disputed: charge.disputed,
      failureCode: charge.failure_code,
      failureMessage: charge.failure_message,
    };
  });

  // Calculate summary
  const successfulTx = transactions.filter((t) => t.status === 'succeeded');
  const totalAmount = successfulTx.reduce((sum, t) => sum + t.amount, 0);
  const totalFees = successfulTx.reduce((sum, t) => sum + t.fees, 0);
  const totalRefunded = transactions.reduce((sum, t) => sum + t.refundedAmount, 0);

  return {
    summary: {
      totalTransactions: transactions.length,
      successfulTransactions: successfulTx.length,
      failedTransactions: transactions.filter((t) => t.status === 'failed').length,
      totalAmount,
      totalAmountFormatted: formatCurrency(totalAmount),
      totalFees,
      totalFeesFormatted: formatCurrency(totalFees),
      totalRefunded,
      totalRefundedFormatted: formatCurrency(totalRefunded),
      netAmount: totalAmount - totalFees - totalRefunded,
      netAmountFormatted: formatCurrency(totalAmount - totalFees - totalRefunded),
    },
    transactions,
    pagination: {
      hasMore: charges.has_more,
      cursor: transactions.length > 0 ? transactions[transactions.length - 1].id : null,
      limit,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT REPORT - Product/treatment performance
// ═══════════════════════════════════════════════════════════════════════════

async function generateProductReport(stripe: Stripe, clinicId: number, filters: ReportFilters) {
  const startTimestamp = Math.floor(filters.startDate.getTime() / 1000);
  const endTimestamp = Math.floor(filters.endDate.getTime() / 1000);

  const charges = await fetchAllCharges(stripe, {
    created: { gte: startTimestamp, lte: endTimestamp },
  });

  const successfulCharges = charges.filter((c) => c.status === 'succeeded');

  // Categorize charges by product type
  const productCategories: Record<
    string,
    {
      name: string;
      revenue: number;
      count: number;
      avgPrice: number;
      refunds: number;
    }
  > = {};

  for (const charge of successfulCharges) {
    const category = categorizeCharge(charge);

    if (!productCategories[category.key]) {
      productCategories[category.key] = {
        name: category.name,
        revenue: 0,
        count: 0,
        avgPrice: 0,
        refunds: 0,
      };
    }

    productCategories[category.key].revenue += charge.amount;
    productCategories[category.key].count++;
    productCategories[category.key].refunds += charge.amount_refunded || 0;
  }

  // Calculate averages
  const products = Object.entries(productCategories)
    .map(([key, data]) => ({
      key,
      name: data.name,
      revenue: data.revenue,
      revenueFormatted: formatCurrency(data.revenue),
      transactions: data.count,
      averagePrice: data.count > 0 ? Math.round(data.revenue / data.count) : 0,
      averagePriceFormatted:
        data.count > 0 ? formatCurrency(Math.round(data.revenue / data.count)) : '$0.00',
      refunds: data.refunds,
      refundsFormatted: formatCurrency(data.refunds),
      refundRate: data.count > 0 ? ((data.refunds / data.revenue) * 100).toFixed(1) + '%' : '0%',
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);

  return {
    summary: {
      totalProducts: products.length,
      totalRevenue,
      totalRevenueFormatted: formatCurrency(totalRevenue),
      totalTransactions: products.reduce((sum, p) => sum + p.transactions, 0),
    },
    products: products.map((p) => ({
      ...p,
      revenueShare: totalRevenue > 0 ? ((p.revenue / totalRevenue) * 100).toFixed(1) + '%' : '0%',
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RECONCILIATION REPORT - For accounting
// ═══════════════════════════════════════════════════════════════════════════

async function generateReconciliationReport(
  stripe: Stripe,
  clinicId: number,
  filters: ReportFilters
) {
  const startTimestamp = Math.floor(filters.startDate.getTime() / 1000);
  const endTimestamp = Math.floor(filters.endDate.getTime() / 1000);

  const [balance, balanceTransactions, payouts, charges, refunds] = await Promise.all([
    stripe.balance.retrieve(),
    stripe.balanceTransactions.list({
      created: { gte: startTimestamp, lte: endTimestamp },
      limit: 100,
    }),
    stripe.payouts.list({
      created: { gte: startTimestamp, lte: endTimestamp },
      limit: 100,
    }),
    fetchAllCharges(stripe, { created: { gte: startTimestamp, lte: endTimestamp } }),
    fetchAllRefunds(stripe, { created: { gte: startTimestamp, lte: endTimestamp } }),
  ]);

  const successfulCharges = charges.filter((c) => c.status === 'succeeded');

  // Calculate totals
  const totalCharges = successfulCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalRefunds = refunds.reduce((sum, r) => sum + r.amount, 0);
  const totalFees = balanceTransactions.data.reduce((sum, tx) => sum + tx.fee, 0);
  const totalPayouts = payouts.data
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  // Balance reconciliation
  const expectedBalance = totalCharges - totalRefunds - totalFees - totalPayouts;
  const actualBalance =
    balance.available.reduce((sum, b) => sum + b.amount, 0) +
    balance.pending.reduce((sum, b) => sum + b.amount, 0);

  // Fee breakdown
  const feeBreakdown: Record<string, number> = {};
  balanceTransactions.data.forEach((tx) => {
    tx.fee_details?.forEach((fee) => {
      feeBreakdown[fee.type] = (feeBreakdown[fee.type] || 0) + fee.amount;
    });
  });

  return {
    period: {
      start: filters.startDate.toISOString(),
      end: filters.endDate.toISOString(),
    },
    summary: {
      totalCharges,
      totalChargesFormatted: formatCurrency(totalCharges),
      chargeCount: successfulCharges.length,
      totalRefunds,
      totalRefundsFormatted: formatCurrency(totalRefunds),
      refundCount: refunds.length,
      totalFees,
      totalFeesFormatted: formatCurrency(totalFees),
      totalPayouts,
      totalPayoutsFormatted: formatCurrency(totalPayouts),
      payoutCount: payouts.data.filter((p) => p.status === 'paid').length,
    },
    balance: {
      available: balance.available.reduce((sum, b) => sum + b.amount, 0),
      availableFormatted: formatCurrency(balance.available.reduce((sum, b) => sum + b.amount, 0)),
      pending: balance.pending.reduce((sum, b) => sum + b.amount, 0),
      pendingFormatted: formatCurrency(balance.pending.reduce((sum, b) => sum + b.amount, 0)),
      total: actualBalance,
      totalFormatted: formatCurrency(actualBalance),
    },
    reconciliation: {
      expectedBalance,
      expectedBalanceFormatted: formatCurrency(expectedBalance),
      actualBalance,
      actualBalanceFormatted: formatCurrency(actualBalance),
      difference: actualBalance - expectedBalance,
      differenceFormatted: formatCurrency(actualBalance - expectedBalance),
      isReconciled: Math.abs(actualBalance - expectedBalance) < 100, // Within $1 tolerance
    },
    feeBreakdown: Object.entries(feeBreakdown).map(([type, amount]) => ({
      type,
      amount,
      amountFormatted: formatCurrency(amount),
    })),
    payouts: payouts.data.map((p) => ({
      id: p.id,
      amount: p.amount,
      amountFormatted: formatCurrency(p.amount),
      status: p.status,
      arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null,
      created: new Date(p.created * 1000).toISOString(),
      method: p.type,
      description: p.description,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function fetchAllCharges(
  stripe: Stripe,
  params: Stripe.ChargeListParams
): Promise<Stripe.Charge[]> {
  const allItems: Stripe.Charge[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const response = await stripe.charges.list({
      ...params,
      limit: 100,
      ...(startingAfter && { starting_after: startingAfter }),
    });
    allItems.push(...response.data);
    hasMore = response.has_more;
    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
    // Safety limit
    if (allItems.length > 2000) break;
  }
  return allItems;
}

async function fetchAllRefunds(
  stripe: Stripe,
  params: Stripe.RefundListParams
): Promise<Stripe.Refund[]> {
  const allItems: Stripe.Refund[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const response = await stripe.refunds.list({
      ...params,
      limit: 100,
      ...(startingAfter && { starting_after: startingAfter }),
    });
    allItems.push(...response.data);
    hasMore = response.has_more;
    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
    if (allItems.length > 1000) break;
  }
  return allItems;
}

function calculateProductBreakdown(charges: Stripe.Charge[]) {
  const products: Record<string, { name: string; revenue: number; count: number }> = {};

  for (const charge of charges) {
    const category = categorizeCharge(charge);

    if (!products[category.key]) {
      products[category.key] = { name: category.name, revenue: 0, count: 0 };
    }
    products[category.key].revenue += charge.amount;
    products[category.key].count++;
  }

  const totalRevenue = Object.values(products).reduce((sum, p) => sum + p.revenue, 0);

  return Object.values(products)
    .map((p) => ({
      name: p.name,
      revenue: p.revenue,
      revenueFormatted: formatCurrency(p.revenue),
      count: p.count,
      share: totalRevenue > 0 ? ((p.revenue / totalRevenue) * 100).toFixed(1) + '%' : '0%',
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function categorizeCharge(charge: Stripe.Charge): { key: string; name: string } {
  const desc = (charge.description || '').toLowerCase();
  const metadata = charge.metadata || {};
  const productName = metadata.product_name || metadata.productName || '';
  const productLower = productName.toLowerCase();

  // Weight loss medications
  if (
    desc.includes('semaglutide') ||
    productLower.includes('semaglutide') ||
    desc.includes('ozempic') ||
    desc.includes('wegovy')
  ) {
    return { key: 'semaglutide', name: 'Semaglutide' };
  }

  if (
    desc.includes('tirzepatide') ||
    productLower.includes('tirzepatide') ||
    desc.includes('mounjaro') ||
    desc.includes('zepbound')
  ) {
    return { key: 'tirzepatide', name: 'Tirzepatide' };
  }

  // Consultation types
  if (desc.includes('initial') || desc.includes('new patient') || desc.includes('intake')) {
    return { key: 'initial_consultation', name: 'Initial Consultation' };
  }

  if (desc.includes('follow') || desc.includes('refill') || desc.includes('renewal')) {
    return { key: 'follow_up', name: 'Follow-up / Refill' };
  }

  if (desc.includes('consult') || desc.includes('visit') || desc.includes('telehealth')) {
    return { key: 'consultation', name: 'Consultation' };
  }

  // Labs
  if (desc.includes('lab') || desc.includes('blood') || desc.includes('test')) {
    return { key: 'lab_work', name: 'Lab Work' };
  }

  // Subscription
  if (desc.includes('subscription') || desc.includes('membership') || desc.includes('monthly')) {
    return { key: 'subscription', name: 'Subscription' };
  }

  return { key: 'other', name: 'Other' };
}

function calculateDailyRevenue(charges: Stripe.Charge[], filters: ReportFilters) {
  const dailyData: Record<string, { revenue: number; transactions: number }> = {};

  for (const charge of charges) {
    const date = new Date(charge.created * 1000).toISOString().split('T')[0];

    if (!dailyData[date]) {
      dailyData[date] = { revenue: 0, transactions: 0 };
    }
    dailyData[date].revenue += charge.amount;
    dailyData[date].transactions++;
  }

  return Object.entries(dailyData)
    .map(([date, data]) => ({
      date,
      revenue: data.revenue,
      revenueFormatted: formatCurrency(data.revenue),
      transactions: data.transactions,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function groupRevenueByPeriod(charges: Stripe.Charge[], groupBy: 'day' | 'week' | 'month') {
  const grouped: Record<string, { revenue: number; count: number; refunds: number }> = {};

  for (const charge of charges) {
    const date = new Date(charge.created * 1000);
    let key: string;

    switch (groupBy) {
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      default:
        key = date.toISOString().split('T')[0];
    }

    if (!grouped[key]) {
      grouped[key] = { revenue: 0, count: 0, refunds: 0 };
    }
    grouped[key].revenue += charge.amount;
    grouped[key].count++;
    grouped[key].refunds += charge.amount_refunded || 0;
  }

  return Object.entries(grouped)
    .map(([period, data]) => ({
      period,
      revenue: data.revenue,
      revenueFormatted: formatCurrency(data.revenue),
      transactions: data.count,
      refunds: data.refunds,
      refundsFormatted: formatCurrency(data.refunds),
      netRevenue: data.revenue - data.refunds,
      netRevenueFormatted: formatCurrency(data.revenue - data.refunds),
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function calculatePaymentMethodBreakdown(charges: Stripe.Charge[]) {
  const methods: Record<string, { count: number; revenue: number }> = {};

  for (const charge of charges) {
    const method = charge.payment_method_details?.type || 'unknown';

    if (!methods[method]) {
      methods[method] = { count: 0, revenue: 0 };
    }
    methods[method].count++;
    methods[method].revenue += charge.amount;
  }

  const totalRevenue = Object.values(methods).reduce((sum, m) => sum + m.revenue, 0);

  return Object.entries(methods)
    .map(([method, data]) => ({
      method,
      count: data.count,
      revenue: data.revenue,
      revenueFormatted: formatCurrency(data.revenue),
      share: totalRevenue > 0 ? ((data.revenue / totalRevenue) * 100).toFixed(1) + '%' : '0%',
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function calculateRevenueTrends(periods: Array<{ period: string; revenue: number }>) {
  if (periods.length < 2) return null;

  const firstPeriod = periods[0];
  const lastPeriod = periods[periods.length - 1];
  const midPoint = Math.floor(periods.length / 2);
  const firstHalf = periods.slice(0, midPoint);
  const secondHalf = periods.slice(midPoint);

  const firstHalfAvg =
    firstHalf.length > 0 ? firstHalf.reduce((sum, p) => sum + p.revenue, 0) / firstHalf.length : 0;
  const secondHalfAvg =
    secondHalf.length > 0
      ? secondHalf.reduce((sum, p) => sum + p.revenue, 0) / secondHalf.length
      : 0;

  return {
    periodOverPeriod: {
      change: lastPeriod.revenue - firstPeriod.revenue,
      changeFormatted: formatCurrency(lastPeriod.revenue - firstPeriod.revenue),
      changePercent:
        firstPeriod.revenue > 0
          ? (((lastPeriod.revenue - firstPeriod.revenue) / firstPeriod.revenue) * 100).toFixed(1) +
            '%'
          : 'N/A',
    },
    trend: {
      direction:
        secondHalfAvg > firstHalfAvg ? 'up' : secondHalfAvg < firstHalfAvg ? 'down' : 'flat',
      averageFirstHalf: firstHalfAvg,
      averageSecondHalf: secondHalfAvg,
      averageFirstHalfFormatted: formatCurrency(firstHalfAvg),
      averageSecondHalfFormatted: formatCurrency(secondHalfAvg),
    },
  };
}

function getDefaultStartDate(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date;
}

function convertToCSV(data: unknown, reportType: string): string {
  // Simple CSV conversion for export
  const rows: string[] = [];

  if (reportType === 'transactions' && typeof data === 'object' && data !== null) {
    const txData = data as { transactions?: Array<Record<string, unknown>> };
    if (txData.transactions && Array.isArray(txData.transactions)) {
      // Header
      rows.push(
        'ID,Date,Amount,Status,Customer Email,Customer Name,Payment Method,Fees,Net,Description'
      );

      // Data rows
      for (const tx of txData.transactions) {
        rows.push(
          [
            tx.id,
            tx.created,
            tx.amountFormatted,
            tx.status,
            `"${tx.customerEmail || ''}"`,
            `"${tx.customerName || ''}"`,
            tx.paymentMethod,
            tx.feesFormatted,
            tx.netFormatted,
            `"${((tx.description as string) || '').replace(/"/g, '""')}"`,
          ].join(',')
        );
      }
    }
  }

  return rows.join('\n');
}
