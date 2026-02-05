import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { platformFeeService, clinicInvoiceService } from '@/services/billing';
import { logger } from '@/lib/logger';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
) {
  return withAuth(handler, { roles: ['super_admin'] });
}

// Validation schema for report query
const reportQuerySchema = z.object({
  clinicId: z.string().optional().transform((v) => v ? parseInt(v) : undefined),
  periodType: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']).optional(),
  startDate: z.string().optional().transform((v) => v ? new Date(v) : undefined),
  endDate: z.string().optional().transform((v) => v ? new Date(v) : undefined),
  status: z.enum(['PENDING', 'INVOICED', 'PAID', 'WAIVED', 'VOIDED']).optional(),
  feeType: z.enum(['PRESCRIPTION', 'TRANSMISSION', 'ADMIN']).optional(),
  limit: z.string().optional().transform((v) => v ? parseInt(v) : 50),
  offset: z.string().optional().transform((v) => v ? parseInt(v) : 0),
});

/**
 * GET /api/super-admin/clinic-fees/reports
 * Get fee reports with filters
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { searchParams } = new URL(req.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    
    const result = reportQuerySchema.safeParse(queryParams);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { clinicId, periodType, startDate, endDate, status, feeType, limit, offset } = result.data;

    // Default date range: last 30 days
    const effectiveStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const effectiveEndDate = endDate || new Date();

    // Get fee events
    const where: Record<string, unknown> = {
      createdAt: {
        gte: effectiveStartDate,
        lte: effectiveEndDate,
      },
    };

    if (clinicId) where.clinicId = clinicId;
    if (status) where.status = status;
    if (feeType) where.feeType = feeType;

    const [events, total] = await Promise.all([
      prisma.platformFeeEvent.findMany({
        where,
        include: {
          clinic: {
            select: { id: true, name: true },
          },
          order: {
            select: {
              id: true,
              patientId: true,
              patient: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
          provider: {
            select: { id: true, firstName: true, lastName: true, isEonproProvider: true },
          },
          invoice: {
            select: { id: true, invoiceNumber: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.platformFeeEvent.count({ where }),
    ]);

    // Calculate summary
    const summaryAgg = await prisma.platformFeeEvent.groupBy({
      by: ['feeType', 'status'],
      where,
      _sum: { amountCents: true },
      _count: true,
    });

    let totalPrescriptionFees = 0;
    let totalTransmissionFees = 0;
    let totalAdminFees = 0;
    let prescriptionCount = 0;
    let transmissionCount = 0;
    let adminCount = 0;

    for (const agg of summaryAgg) {
      // Skip voided and waived from totals
      if (agg.status === 'VOIDED' || agg.status === 'WAIVED') continue;

      const amount = agg._sum.amountCents || 0;
      switch (agg.feeType) {
        case 'PRESCRIPTION':
          totalPrescriptionFees += amount;
          prescriptionCount += agg._count;
          break;
        case 'TRANSMISSION':
          totalTransmissionFees += amount;
          transmissionCount += agg._count;
          break;
        case 'ADMIN':
          totalAdminFees += amount;
          adminCount += agg._count;
          break;
      }
    }

    return NextResponse.json({
      events,
      total,
      summary: {
        totalPrescriptionFees,
        totalTransmissionFees,
        totalAdminFees,
        totalFees: totalPrescriptionFees + totalTransmissionFees + totalAdminFees,
        prescriptionCount,
        transmissionCount,
        adminCount,
      },
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + events.length < total,
      },
      dateRange: {
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
      },
    });
  } catch (error) {
    logger.error('[SuperAdmin] Error getting fee reports', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to get fee reports' },
      { status: 500 }
    );
  }
});

// Validation schema for report generation
const generateReportSchema = z.object({
  clinicId: z.number().int().positive().optional(),
  periodType: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']),
  startDate: z.string().transform((v) => new Date(v)),
  endDate: z.string().transform((v) => new Date(v)),
  format: z.enum(['json', 'csv']).default('json'),
});

/**
 * POST /api/super-admin/clinic-fees/reports
 * Generate a fee report (optionally export to CSV)
 */
export const POST = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const result = generateReportSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { clinicId, periodType, startDate, endDate, format } = result.data;

    // Generate report
    const report = await clinicInvoiceService.getFeeReport({
      clinicId,
      periodType,
      startDate,
      endDate,
    });

    if (format === 'csv') {
      // Generate CSV
      const csvRows = [
        ['Clinic ID', 'Clinic Name', 'Prescription Fees', 'Transmission Fees', 'Admin Fees', 'Total Fees', 'Prescription Count', 'Transmission Count'],
      ];

      for (const clinic of report.clinics) {
        csvRows.push([
          clinic.clinicId.toString(),
          clinic.clinicName,
          (clinic.prescriptionFees / 100).toFixed(2),
          (clinic.transmissionFees / 100).toFixed(2),
          (clinic.adminFees / 100).toFixed(2),
          (clinic.totalFees / 100).toFixed(2),
          clinic.prescriptionCount.toString(),
          clinic.transmissionCount.toString(),
        ]);
      }

      // Add totals row
      csvRows.push([
        'TOTAL',
        '',
        (report.totals.prescriptionFees / 100).toFixed(2),
        (report.totals.transmissionFees / 100).toFixed(2),
        (report.totals.adminFees / 100).toFixed(2),
        (report.totals.totalFees / 100).toFixed(2),
        '',
        '',
      ]);

      const csv = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="fee-report-${startDate.toISOString().split('T')[0]}-${endDate.toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    logger.info('[SuperAdmin] Generated fee report', {
      clinicId,
      periodType,
      startDate,
      endDate,
      generatedBy: user.id,
    });

    return NextResponse.json({
      report,
      period: { startDate, endDate, periodType },
    });
  } catch (error) {
    logger.error('[SuperAdmin] Error generating fee report', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to generate fee report' },
      { status: 500 }
    );
  }
});
