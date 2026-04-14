import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { withoutClinicFilter } from '@/lib/db';
import { runReport } from '@/services/reporting/reportEngine';
import type { ReportConfig } from '@/services/reporting/types';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';

const schema = z.object({
  dataSource: z.string(),
  columns: z.array(z.string()).optional(),
  filters: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'between', 'contains']),
        value: z.any(),
      })
    )
    .optional(),
  groupBy: z.string().optional(),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  dateRange: z.object({ startDate: z.string(), endDate: z.string() }).optional(),
  clinicId: z.number().optional(),
  limit: z.number().max(5000).optional(),
});

async function handler(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const config = {
      ...parsed.data,
      filters: parsed.data.filters || [],
      columns: parsed.data.columns || [],
      clinicId: user.role === 'super_admin' ? parsed.data.clinicId : user.clinicId || undefined,
    } as ReportConfig;

    const result =
      user.role === 'super_admin'
        ? await withoutClinicFilter(() => runReport(config))
        : await runReport(config);

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, { context: { route: 'POST /api/reports/run' } });
  }
}

export const POST = withAuth(handler, { roles: ['super_admin', 'admin', 'provider'] });
