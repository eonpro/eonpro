import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { withoutClinicFilter } from '@/lib/db';
import { runReport, getDataSource } from '@/services/reporting/reportEngine';
import { exportToCsv } from '@/services/reporting/exporters/csv';
import { exportToPdf } from '@/services/reporting/exporters/pdf';
import { exportToXlsx } from '@/services/reporting/exporters/xlsx';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';

const schema = z.object({
  dataSource: z.string(),
  columns: z.array(z.string()).optional(),
  filters: z.array(z.object({ field: z.string(), operator: z.string(), value: z.any() })).optional(),
  groupBy: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  dateRange: z.object({ startDate: z.string(), endDate: z.string() }).optional(),
  clinicId: z.number().optional(),
  limit: z.number().max(10000).optional(),
  format: z.enum(['csv', 'pdf', 'xlsx']),
  reportName: z.string().optional(),
});

async function handler(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const { format, reportName, ...reportConfig } = parsed.data;
    const config = {
      ...reportConfig,
      filters: reportConfig.filters as any[] || [],
      columns: reportConfig.columns || [],
      clinicId: user.role === 'super_admin' ? reportConfig.clinicId : user.clinicId || undefined,
    };

    const result = user.role === 'super_admin'
      ? await withoutClinicFilter(() => runReport(config))
      : await runReport(config);

    const ds = getDataSource(config.dataSource);
    const columns = ds?.columns || [];
    const name = reportName || ds?.name || 'Report';
    const dateSuffix = config.dateRange ? `-${config.dateRange.startDate}-to-${config.dateRange.endDate}` : '';

    if (format === 'csv') {
      const csv = exportToCsv(result, columns, name);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${name.replace(/\s/g, '-')}${dateSuffix}.csv"`,
        },
      });
    }

    if (format === 'pdf') {
      const pdf = await exportToPdf(result, columns, name);
      return new Response(pdf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${name.replace(/\s/g, '-')}${dateSuffix}.pdf"`,
        },
      });
    }

    if (format === 'xlsx') {
      const xlsx = exportToXlsx(result, columns, name);
      return new Response(xlsx, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${name.replace(/\s/g, '-')}${dateSuffix}.xlsx"`,
        },
      });
    }

    return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
  } catch (error) {
    return handleApiError(error, { context: { route: 'POST /api/reports/export' } });
  }
}

export const POST = withAuth(handler, { roles: ['super_admin', 'admin', 'provider'] });
