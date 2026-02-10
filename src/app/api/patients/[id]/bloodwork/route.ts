/**
 * Admin/Provider: list bloodwork reports for a patient.
 * HIPAA: PHI access is audited (list lab reports).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { prisma } from '@/lib/db';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';
import { Prisma } from '@prisma/client';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ id: string }> };

/** Return true if error indicates missing table/column or schema mismatch (should return 503). */
function isSchemaOrTableError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2021' || code === 'P2022' || code === 'P2010') return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return lower.includes('does not exist') || lower.includes('unknown field') || lower.includes('unknown argument');
}

export const GET = withAuthParams(
  async (req: NextRequest, user, { params }: Params) => {
    const { id } = await params;
    const patientId = parseInt(id, 10);
    if (isNaN(patientId)) {
      return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }
    if (user.role !== 'super_admin' && user.clinicId !== patient.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    try {
      const reports = await prisma.labReport.findMany({
        where: { patientId },
        orderBy: { reportedAt: 'desc' },
        select: {
          id: true,
          documentId: true,
          labName: true,
          specimenId: true,
          collectedAt: true,
          reportedAt: true,
          fasting: true,
          createdAt: true,
          _count: { select: { results: true } },
        },
      });

      const list = reports.map((r: (typeof reports)[number]) => {
        const createdAt = r.createdAt;
        const collectedAt = r.collectedAt;
        const reportedAt = r.reportedAt;
        return {
          id: r.id,
          documentId: r.documentId,
          labName: r.labName,
          specimenId: r.specimenId,
          collectedAt: collectedAt instanceof Date ? collectedAt.toISOString() : collectedAt ?? null,
          reportedAt: reportedAt instanceof Date ? reportedAt.toISOString() : reportedAt ?? null,
          fasting: r.fasting,
          createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
          resultCount: r._count.results,
        };
      });

      try {
        await logPHIAccess(req, user, 'LabReportList', String(patientId), patientId, {
          reportCount: list.length,
        });
      } catch (auditErr) {
        // Do not fail the request if audit logging fails (e.g. DB schema)
        logger.warn('Bloodwork list PHI audit log failed', { patientId, error: auditErr instanceof Error ? auditErr.message : 'Unknown' });
      }

      return NextResponse.json({ reports: list });
    } catch (err) {
      logger.error('Bloodwork list failed', {
        route: 'GET /api/patients/[id]/bloodwork',
        userId: user.id,
        patientId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      if (err instanceof Prisma.PrismaClientKnownRequestError && ['P2021', 'P2022', 'P2010'].includes(err.code)) {
        return NextResponse.json(
          { error: 'Lab reports are temporarily unavailable. If this persists, ask your administrator to run database migrations.' },
          { status: 503 }
        );
      }
      if (isSchemaOrTableError(err)) {
        return NextResponse.json(
          { error: 'Lab reports are temporarily unavailable. If this persists, ask your administrator to run database migrations.' },
          { status: 503 }
        );
      }
      return handleApiError(err, {
        route: 'GET /api/patients/[id]/bloodwork',
        context: { userId: user.id, patientId },
      });
    }
  },
  { roles: ['admin', 'provider', 'staff', 'super_admin'] }
);
