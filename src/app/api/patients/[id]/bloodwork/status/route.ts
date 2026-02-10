/**
 * Admin/Provider: lightweight check that lab report table is accessible.
 * Returns 200 { ok: true } or 503 with message if table/schema is missing.
 * Same auth as GET /api/patients/[id]/bloodwork.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

type Params = { params: Promise<{ id: string }> };

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
      await prisma.labReport.findFirst({
        where: { patientId },
        select: { id: true },
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      logger.warn('Bloodwork status check failed', {
        patientId,
        error: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof Prisma.PrismaClientKnownRequestError && ['P2021', 'P2022', 'P2010'].includes(err.code)) {
        return NextResponse.json(
          { ok: false, error: 'Lab report table is not available. Run database migrations.' },
          { status: 503 }
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('does not exist') || msg.toLowerCase().includes('unknown')) {
        return NextResponse.json(
          { ok: false, error: 'Lab report table is not available. Run database migrations.' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { ok: false, error: 'Lab reports temporarily unavailable.' },
        { status: 503 }
      );
    }
  },
  { roles: ['admin', 'provider', 'staff', 'super_admin'] }
);
