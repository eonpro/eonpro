/**
 * Patient portal: list bloodwork lab reports for the current patient.
 * HIPAA: PHI access is audited (list lab reports).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';
import { handleApiError } from '@/domains/shared/errors';

export const GET = withAuth(
  async (req: NextRequest, user) => {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
    }

    try {
      const reports = await prisma.labReport.findMany({
        where: { patientId: user.patientId },
        orderBy: { reportedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          labName: true,
          specimenId: true,
          collectedAt: true,
          reportedAt: true,
          fasting: true,
          createdAt: true,
          _count: { select: { results: true } },
        },
      });

      const list = reports.map((r: (typeof reports)[number]) => ({
        id: r.id,
        labName: r.labName,
        specimenId: r.specimenId,
        collectedAt: r.collectedAt?.toISOString() ?? null,
        reportedAt: r.reportedAt?.toISOString() ?? null,
        fasting: r.fasting,
        createdAt: r.createdAt.toISOString(),
        resultCount: r._count.results,
      }));

      await logPHIAccess(req, user, 'LabReportList', String(user.patientId), user.patientId, {
        reportCount: list.length,
      });

      return NextResponse.json({ reports: list });
    } catch (err) {
      return handleApiError(err, {
        route: 'GET /api/patient-portal/bloodwork',
        context: { userId: user.id, patientId: user.patientId },
      });
    }
  },
  { roles: ['patient'] }
);
