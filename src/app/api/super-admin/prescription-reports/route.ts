import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { prescriptionReportService } from '@/services/reporting/prescriptionReportService';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

const reportQuerySchema = z.object({
  period: z
    .enum(['day', 'week', 'month', 'quarter', 'semester', 'year', 'custom'])
    .default('month'),
  startDate: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  endDate: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  clinicId: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
  providerId: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 200) : 50)),
});

/**
 * GET /api/super-admin/prescription-reports
 * Returns prescription report data: summary (by provider per clinic) + paginated details.
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { searchParams } = new URL(req.url);
    const queryParams = Object.fromEntries(searchParams.entries());

    const parsed = reportQuerySchema.safeParse(queryParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { period, startDate, endDate, clinicId, providerId, page, limit } = parsed.data;

    const report = await prescriptionReportService.getReport({
      period,
      startDate,
      endDate,
      clinicId,
      providerId,
      page,
      limit,
    });

    await auditLog(req, {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      eventType: AuditEventType.PHI_VIEW,
      resourceType: 'PrescriptionReport',
      action: 'prescription_report_view',
      outcome: 'SUCCESS',
    });

    return NextResponse.json(report);
  } catch (error) {
    logger.error('[SuperAdmin] Error fetching prescription report', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to fetch prescription report' },
      { status: 500 }
    );
  }
});
