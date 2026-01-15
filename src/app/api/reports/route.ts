/**
 * COMPREHENSIVE REPORTS API
 * =========================
 * Main endpoint for generating clinic reports
 * 
 * GET /api/reports - Generate comprehensive report
 * 
 * Query Parameters:
 * - range: DateRange preset (today, yesterday, this_week, last_week, this_month, etc.)
 * - startDate: Custom start date (ISO string)
 * - endDate: Custom end date (ISO string)
 * - sections: Comma-separated list of sections to include (patients, revenue, subscriptions, payments, treatments, orders)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import { ReportingService, DateRange, DateRangeParams } from '@/services/reporting/ReportingService';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const VALID_RANGES: DateRange[] = [
  'today', 'yesterday', 'this_week', 'last_week',
  'this_month', 'last_month', 'this_quarter', 'last_quarter',
  'this_semester', 'last_semester', 'this_year', 'last_year', 'custom'
];

const VALID_SECTIONS = ['patients', 'revenue', 'subscriptions', 'payments', 'treatments', 'orders'];

async function getReportsHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const url = new URL(req.url);
    
    // Parse date range
    const rangeParam = url.searchParams.get('range') || 'this_month';
    const startDateParam = url.searchParams.get('startDate');
    const endDateParam = url.searchParams.get('endDate');
    const sectionsParam = url.searchParams.get('sections');

    // Validate range
    if (!VALID_RANGES.includes(rangeParam as DateRange)) {
      return NextResponse.json(
        { error: `Invalid range. Valid options: ${VALID_RANGES.join(', ')}` },
        { status: 400 }
      );
    }

    // Build date range params
    const dateRangeParams: DateRangeParams = {
      range: rangeParam as DateRange
    };

    if (rangeParam === 'custom') {
      if (!startDateParam || !endDateParam) {
        return NextResponse.json(
          { error: 'Custom range requires startDate and endDate parameters' },
          { status: 400 }
        );
      }
      dateRangeParams.startDate = new Date(startDateParam);
      dateRangeParams.endDate = new Date(endDateParam);

      if (isNaN(dateRangeParams.startDate.getTime()) || isNaN(dateRangeParams.endDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)' },
          { status: 400 }
        );
      }
    }

    // Parse sections
    const requestedSections = sectionsParam
      ? sectionsParam.split(',').filter(s => VALID_SECTIONS.includes(s))
      : VALID_SECTIONS;

    // Initialize reporting service with clinic context
    const reportingService = new ReportingService(user.clinicId);

    // Generate report based on requested sections
    const report: Record<string, unknown> = {
      generatedAt: new Date(),
      clinicId: user.clinicId || 'all',
      requestedBy: user.email,
      dateRange: dateRangeParams
    };

    // Fetch requested sections in parallel
    const promises: Promise<void>[] = [];

    if (requestedSections.includes('patients')) {
      promises.push(
        reportingService.getPatientMetrics(dateRangeParams)
          .then(data => { report.patients = data; })
      );
    }

    if (requestedSections.includes('revenue')) {
      promises.push(
        reportingService.getRevenueMetrics(dateRangeParams)
          .then(data => { report.revenue = data; })
      );
    }

    if (requestedSections.includes('subscriptions')) {
      promises.push(
        reportingService.getSubscriptionMetrics(dateRangeParams)
          .then(data => { report.subscriptions = data; })
      );
    }

    if (requestedSections.includes('payments')) {
      promises.push(
        reportingService.getPaymentMetrics(dateRangeParams)
          .then(data => { report.payments = data; })
      );
    }

    if (requestedSections.includes('treatments')) {
      promises.push(
        reportingService.getTreatmentMetrics(dateRangeParams)
          .then(data => { report.treatments = data; })
      );
    }

    if (requestedSections.includes('orders')) {
      promises.push(
        reportingService.getOrderMetrics(dateRangeParams)
          .then(data => { report.orders = data; })
      );
    }

    await Promise.all(promises);

    logger.info('Report generated', {
      clinicId: user.clinicId,
      range: rangeParam,
      sections: requestedSections,
      userId: user.id
    });

    return NextResponse.json(report);
  } catch (error) {
    logger.error('Failed to generate report', error as Error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}

export const GET = standardRateLimit(withClinicalAuth(getReportsHandler));
