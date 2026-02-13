/**
 * Admin/Provider: get a single bloodwork report with all results for a patient.
 * HIPAA: PHI access is audited (view lab report).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { prisma } from '@/lib/db';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';
import { ensureTenantResource, tenantNotFoundResponse } from '@/lib/tenant-response';
import { handleApiError } from '@/domains/shared/errors';

type Params = { params: Promise<{ id: string; reportId: string }> };

export const GET = withAuthParams(
  async (req: NextRequest, user, { params }: Params) => {
    const { id, reportId } = await params;
    const patientId = parseInt(id, 10);
    const reportIdNum = parseInt(reportId, 10);
    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }
    if (isNaN(reportIdNum)) {
      return NextResponse.json({ error: 'Invalid report ID' }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });
    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId ?? undefined;
    const notFound = ensureTenantResource(patient, clinicId);
    if (notFound) return notFound;

    try {
      const report = await prisma.labReport.findFirst({
        where: { id: reportIdNum, patientId },
        include: {
          results: { orderBy: { sortOrder: 'asc' } },
        },
      });

      if (!report) return tenantNotFoundResponse();

      await logPHIAccess(req, user, 'LabReport', String(report.id), patientId);

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
        documentId: report.documentId,
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
        route: 'GET /api/patients/[id]/bloodwork/[reportId]',
        context: { userId: user.id, patientId, reportId: reportIdNum },
      });
    }
  },
  { roles: ['admin', 'provider', 'staff', 'super_admin'] }
);
