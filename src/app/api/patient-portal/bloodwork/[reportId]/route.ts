/**
 * Patient portal: get a single bloodwork report with all results.
 * HIPAA: PHI access is audited (view lab report).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { prisma } from '@/lib/db';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';

type Params = { params: Promise<{ reportId: string }> };

export const GET = withAuthParams(
  async (req: NextRequest, user, { params }: Params) => {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
    }

    const { reportId } = await params;
    const id = parseInt(reportId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid report ID' }, { status: 400 });
    }

    try {
      const report = await prisma.labReport.findFirst({
        where: { id, patientId: user.patientId },
        include: {
          results: { orderBy: { sortOrder: 'asc' } },
        },
      });

      if (!report) {
        return NextResponse.json({ error: 'Report not found' }, { status: 404 });
      }

      await logPHIAccess(req, user, 'LabReport', String(report.id), user.patientId);

      type ResultRow = (typeof report.results)[number];
      const results = report.results.map((r: ResultRow) => ({
        id: r.id,
        testName: r.testName,
        value: r.value,
        valueNumeric: r.valueNumeric,
        unit: r.unit,
        referenceRange: r.referenceRange,
        flag: r.flag,
        category: r.category,
      }));

      const outOfRange = report.results.filter((r: ResultRow) => r.flag === 'H' || r.flag === 'L').length;
      const optimal = report.results.filter((r: ResultRow) => !r.flag).length;
      const inRange = report.results.length - outOfRange;

      return NextResponse.json({
        id: report.id,
        labName: report.labName,
        specimenId: report.specimenId,
        collectedAt: report.collectedAt?.toISOString() ?? null,
        reportedAt: report.reportedAt?.toISOString() ?? null,
        fasting: report.fasting,
        createdAt: report.createdAt.toISOString(),
        results,
        summary: {
          total: report.results.length,
          optimal,
          inRange,
          outOfRange,
        },
      });
    } catch (err) {
      return handleApiError(err, {
        route: 'GET /api/patient-portal/bloodwork/[reportId]',
        context: { userId: user.id, patientId: user.patientId, reportId: id },
      });
    }
  },
  { roles: ['patient'] }
);
