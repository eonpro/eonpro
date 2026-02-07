/**
 * Patient portal: list bloodwork lab reports for the current patient.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';

export const GET = withAuth(async (_req: NextRequest, user) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 });
    }

    const reports = await prisma.labReport.findMany({
      where: { patientId: user.patientId },
      orderBy: { reportedAt: 'desc' },
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

    const list = reports.map((r) => ({
      id: r.id,
      labName: r.labName,
      specimenId: r.specimenId,
      collectedAt: r.collectedAt?.toISOString() ?? null,
      reportedAt: r.reportedAt?.toISOString() ?? null,
      fasting: r.fasting,
      createdAt: r.createdAt.toISOString(),
      resultCount: r._count.results,
    }));

    return NextResponse.json({ reports: list });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load lab reports' }, { status: 500 });
  }
}, { roles: ['patient'] });
