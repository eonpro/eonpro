/**
 * Admin/Provider: list bloodwork reports for a patient.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { prisma } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

export const GET = withAuthParams(async (_req: NextRequest, user, { params }: Params) => {
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

  const list = reports.map((r) => ({
    id: r.id,
    documentId: r.documentId,
    labName: r.labName,
    specimenId: r.specimenId,
    collectedAt: r.collectedAt?.toISOString() ?? null,
    reportedAt: r.reportedAt?.toISOString() ?? null,
    fasting: r.fasting,
    createdAt: r.createdAt.toISOString(),
    resultCount: r._count.results,
  }));

  return NextResponse.json({ reports: list });
}, { roles: ['admin', 'provider', 'staff', 'super_admin'] });
