/**
 * Recent Prescriptions API
 * ========================
 *
 * Returns recent prescription orders for a patient within a configurable window.
 * Used by the patient profile prescription modal and other UI components
 * to warn about potential duplicate prescriptions.
 *
 * GET /api/patients/:id/recent-prescriptions?days=3
 */

import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import { checkRecentPrescriptions } from '@/domains/prescription';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

async function handler(
  req: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const patientId = parseInt(id, 10);
  if (isNaN(patientId)) {
    return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') || '3', 10);
  const windowDays = Math.min(Math.max(days, 1), 30);

  // Verify clinic access
  if (user.role !== 'super_admin' && user.clinicId) {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { clinicId: true },
    });
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }
    if (patient.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
  }

  const result = await checkRecentPrescriptions(patientId, windowDays);

  logger.info('[RECENT-RX] Duplicate check', {
    patientId,
    userId: user.id,
    windowDays,
    hasDuplicate: result.hasDuplicate,
    count: result.recentOrders.length,
  });

  return NextResponse.json(result);
}

export const GET = withClinicalAuth(handler);
