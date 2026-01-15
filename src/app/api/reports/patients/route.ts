/**
 * PATIENT REPORTS API
 * ===================
 * Detailed patient reporting endpoints
 * 
 * GET /api/reports/patients - Patient metrics and lists
 * GET /api/reports/patients?type=new - New patients in period
 * GET /api/reports/patients?type=active - Active patients
 * GET /api/reports/patients?type=inactive - Inactive patients
 * GET /api/reports/patients?type=by-source - Patients grouped by source
 * GET /api/reports/patients?type=by-treatment-month - Patients by treatment month
 */

import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import { ReportingService, DateRange, DateRangeParams, calculateDateRange } from '@/services/reporting/ReportingService';
import { prisma, getClinicContext } from '@/lib/db';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

async function getPatientReportsHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'metrics';
    const rangeParam = (url.searchParams.get('range') || 'this_month') as DateRange;
    const startDateParam = url.searchParams.get('startDate');
    const endDateParam = url.searchParams.get('endDate');
    const month = url.searchParams.get('month');

    const dateRangeParams: DateRangeParams = { range: rangeParam };
    if (rangeParam === 'custom' && startDateParam && endDateParam) {
      dateRangeParams.startDate = new Date(startDateParam);
      dateRangeParams.endDate = new Date(endDateParam);
    }

    const { start, end } = calculateDateRange(dateRangeParams);
    const reportingService = new ReportingService(user.clinicId);
    const clinicFilter = user.clinicId ? { clinicId: user.clinicId } : {};

    switch (type) {
      case 'metrics':
        const metrics = await reportingService.getPatientMetrics(dateRangeParams);
        return NextResponse.json({ metrics, dateRange: { start, end } });

      case 'new':
        const newPatients = await prisma.patient.findMany({
          where: {
            ...clinicFilter,
            createdAt: { gte: start, lte: end }
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            source: true,
            createdAt: true,
            subscriptions: {
              where: { status: 'ACTIVE' },
              select: { planName: true, amount: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json({
          patients: newPatients,
          count: newPatients.length,
          dateRange: { start, end }
        });

      case 'active':
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        const activePatients = await prisma.patient.findMany({
          where: {
            ...clinicFilter,
            OR: [
              { orders: { some: { createdAt: { gte: ninetyDaysAgo } } } },
              { payments: { some: { createdAt: { gte: ninetyDaysAgo } } } },
              { subscriptions: { some: { status: 'ACTIVE' } } }
            ]
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            createdAt: true,
            subscriptions: {
              where: { status: 'ACTIVE' },
              select: { planName: true, amount: true, startDate: true }
            },
            _count: {
              select: { orders: true, payments: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json({
          patients: activePatients,
          count: activePatients.length
        });

      case 'inactive':
        const inactiveThreshold = new Date();
        inactiveThreshold.setDate(inactiveThreshold.getDate() - 90);
        
        const inactivePatients = await prisma.patient.findMany({
          where: {
            ...clinicFilter,
            AND: [
              {
                OR: [
                  { orders: { none: {} } },
                  { orders: { every: { createdAt: { lt: inactiveThreshold } } } }
                ]
              },
              {
                OR: [
                  { subscriptions: { none: {} } },
                  { subscriptions: { every: { status: { not: 'ACTIVE' } } } }
                ]
              }
            ]
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            createdAt: true,
            orders: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true, primaryMedName: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json({
          patients: inactivePatients,
          count: inactivePatients.length
        });

      case 'by-source':
        const patientsBySource = await prisma.patient.groupBy({
          by: ['source'],
          where: {
            ...clinicFilter,
            createdAt: { gte: start, lte: end }
          },
          _count: true
        });

        const sourceDetails: Record<string, { count: number; patients: unknown[] }> = {};
        
        for (const group of patientsBySource) {
          const patients = await prisma.patient.findMany({
            where: {
              ...clinicFilter,
              source: group.source,
              createdAt: { gte: start, lte: end }
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              createdAt: true
            },
            take: 50,
            orderBy: { createdAt: 'desc' }
          });
          
          sourceDetails[group.source || 'unknown'] = {
            count: group._count,
            patients
          };
        }

        return NextResponse.json({
          bySource: sourceDetails,
          dateRange: { start, end }
        });

      case 'by-treatment-month':
        const treatmentMonth = month ? parseInt(month) : null;
        
        if (treatmentMonth) {
          const patientsOnMonth = await reportingService.getPatientsByTreatmentMonth(treatmentMonth);
          return NextResponse.json({
            month: treatmentMonth,
            patients: patientsOnMonth,
            count: patientsOnMonth.length
          });
        }

        // Return all months
        const treatmentMetrics = await reportingService.getTreatmentMetrics(dateRangeParams);
        return NextResponse.json({
          byMonth: treatmentMetrics.patientsOnMonth,
          summary: treatmentMetrics.patientsByTreatmentMonth
        });

      default:
        return NextResponse.json(
          { error: 'Invalid report type' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error('Failed to generate patient report', error as Error);
    return NextResponse.json(
      { error: 'Failed to generate patient report' },
      { status: 500 }
    );
  }
}

export const GET = standardRateLimit(withClinicalAuth(getPatientReportsHandler));
