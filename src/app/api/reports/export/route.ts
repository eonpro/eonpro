/**
 * REPORT EXPORT API
 * =================
 * Export reports in various formats (CSV, JSON)
 *
 * GET /api/reports/export?format=csv&report=patients
 * GET /api/reports/export?format=json&report=revenue
 */

import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import {
  ReportingService,
  DateRange,
  DateRangeParams,
  calculateDateRange,
} from '@/services/reporting/ReportingService';
import { prisma } from '@/lib/db';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

type ExportFormat = 'csv' | 'json';
type ReportType = 'patients' | 'payments' | 'subscriptions' | 'revenue' | 'comprehensive';

async function exportReportHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const url = new URL(req.url);
    const format = (url.searchParams.get('format') || 'csv') as ExportFormat;
    const report = (url.searchParams.get('report') || 'comprehensive') as ReportType;
    const rangeParam = (url.searchParams.get('range') || 'this_month') as DateRange;
    const startDateParam = url.searchParams.get('startDate');
    const endDateParam = url.searchParams.get('endDate');

    const dateRangeParams: DateRangeParams = { range: rangeParam };
    if (rangeParam === 'custom' && startDateParam && endDateParam) {
      dateRangeParams.startDate = new Date(startDateParam);
      dateRangeParams.endDate = new Date(endDateParam);
    }

    const { start, end, label } = calculateDateRange(dateRangeParams);
    const reportingService = new ReportingService(user.clinicId);
    const clinicFilter = user.clinicId ? { clinicId: user.clinicId } : {};

    let data: unknown;
    let filename: string;

    switch (report) {
      case 'patients':
        const patients = await prisma.patient.findMany({
          where: {
            ...clinicFilter,
            createdAt: { gte: start, lte: end },
          },
          select: {
            id: true,
            patientId: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            dob: true,
            gender: true,
            city: true,
            state: true,
            source: true,
            createdAt: true,
            subscriptions: {
              where: { status: 'ACTIVE' },
              select: { planName: true, amount: true, startDate: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        type PatientExport = (typeof patients)[number];
        data = patients.map((p: PatientExport) => ({
          ID: p.patientId || p.id,
          'First Name': p.firstName,
          'Last Name': p.lastName,
          Email: p.email,
          Phone: p.phone,
          DOB: p.dob,
          Gender: p.gender,
          City: p.city,
          State: p.state,
          Source: p.source,
          'Created At': p.createdAt.toISOString(),
          'Active Subscription': p.subscriptions[0]?.planName || 'None',
          'Subscription Amount': p.subscriptions[0]
            ? formatCurrency(p.subscriptions[0].amount)
            : 'N/A',
          'Subscription Start': p.subscriptions[0]?.startDate?.toISOString() || 'N/A',
        }));
        filename = `patients_${label.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}`;
        break;

      case 'payments':
        const payments = await prisma.payment.findMany({
          where: {
            ...clinicFilter,
            createdAt: { gte: start, lte: end },
          },
          include: {
            patient: {
              select: { firstName: true, lastName: true, email: true },
            },
            subscription: {
              select: { planName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        type PaymentExport = (typeof payments)[number];
        data = payments.map((p: PaymentExport) => ({
          ID: p.id,
          'Patient Name': `${p.patient.firstName} ${p.patient.lastName}`,
          'Patient Email': p.patient.email,
          Amount: formatCurrency(p.amount),
          'Amount (cents)': p.amount,
          Status: p.status,
          'Payment Method': p.paymentMethod || 'Unknown',
          'Is Recurring': p.subscriptionId ? 'Yes' : 'No',
          'Subscription Plan': p.subscription?.planName || 'N/A',
          'Failure Reason': p.failureReason || '',
          'Created At': p.createdAt.toISOString(),
        }));
        filename = `payments_${label.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}`;
        break;

      case 'subscriptions':
        const subscriptions = await prisma.subscription.findMany({
          where: clinicFilter,
          include: {
            patient: {
              select: { firstName: true, lastName: true, email: true, phone: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        const now = new Date();
        type SubscriptionExport = (typeof subscriptions)[number];
        data = subscriptions.map((s: SubscriptionExport) => {
          const monthsActive =
            Math.floor((now.getTime() - s.startDate.getTime()) / (30 * 24 * 60 * 60 * 1000)) + 1;

          return {
            ID: s.id,
            'Patient Name': `${s.patient.firstName} ${s.patient.lastName}`,
            'Patient Email': s.patient.email,
            'Patient Phone': s.patient.phone,
            'Plan Name': s.planName,
            Amount: formatCurrency(s.amount),
            'Amount (cents)': s.amount,
            Interval: s.interval,
            Status: s.status,
            'Months Active': monthsActive,
            'Start Date': s.startDate.toISOString(),
            'Next Billing': s.nextBillingDate?.toISOString() || 'N/A',
            'Cancelled At': s.canceledAt?.toISOString() || '',
            'Paused At': s.pausedAt?.toISOString() || '',
            'Resume At': s.resumeAt?.toISOString() || '',
          };
        });
        filename = `subscriptions_${new Date().toISOString().split('T')[0]}`;
        break;

      case 'revenue':
        const revenueMetrics = await reportingService.getRevenueMetrics(dateRangeParams);

        data = {
          summary: {
            'Total Revenue': formatCurrency(revenueMetrics.totalRevenue),
            'Recurring Revenue': formatCurrency(revenueMetrics.recurringRevenue),
            'One-Time Revenue': formatCurrency(revenueMetrics.oneTimeRevenue),
            'Average Order Value': formatCurrency(revenueMetrics.averageOrderValue),
            'Projected Annual Revenue': formatCurrency(revenueMetrics.projectedRevenue),
            'Growth Rate': `${revenueMetrics.revenueGrowthRate}%`,
          },
          dailyRevenue: revenueMetrics.revenueByDay.map((d) => ({
            Date: d.date,
            Amount: formatCurrency(d.amount),
            'Amount (cents)': d.amount,
          })),
          byTreatment: Object.entries(revenueMetrics.revenueByTreatment).map(
            ([treatment, amount]) => ({
              Treatment: treatment,
              Revenue: formatCurrency(amount),
              'Revenue (cents)': amount,
            })
          ),
        };
        filename = `revenue_${label.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}`;
        break;

      case 'comprehensive':
        const comprehensiveReport =
          await reportingService.generateComprehensiveReport(dateRangeParams);
        data = comprehensiveReport;
        filename = `comprehensive_report_${label.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}`;
        break;

      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    }

    // Return in requested format
    if (format === 'csv') {
      const csv = convertToCSV(data);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      });
    }

    // JSON format
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}.json"`,
      },
    });
  } catch (error) {
    logger.error('Failed to export report', error as Error);
    return NextResponse.json({ error: 'Failed to export report' }, { status: 500 });
  }
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function convertToCSV(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0] as Record<string, unknown>);
    const rows = data.map((row) =>
      headers
        .map((header) => {
          const value = (row as Record<string, unknown>)[header];
          if (value === null || value === undefined) return '';
          const stringValue = String(value);
          // Escape quotes and wrap in quotes if contains comma or quote
          if (
            stringValue.includes(',') ||
            stringValue.includes('"') ||
            stringValue.includes('\n')
          ) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        })
        .join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  // Handle nested objects (like comprehensive report)
  if (typeof data === 'object' && data !== null) {
    const sections: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        sections.push(`\n=== ${key.toUpperCase()} ===\n`);
        sections.push(convertToCSV(value));
      } else if (typeof value === 'object' && value !== null) {
        sections.push(`\n=== ${key.toUpperCase()} ===\n`);
        const entries = Object.entries(value).map(([k, v]) => `${k},${v}`);
        sections.push(['Metric,Value', ...entries].join('\n'));
      }
    }

    return sections.join('\n');
  }

  return String(data);
}

export const GET = standardRateLimit(withClinicalAuth(exportReportHandler));
