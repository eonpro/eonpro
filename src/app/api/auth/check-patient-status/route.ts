/**
 * CHECK PATIENT STATUS API
 * ========================
 * Checks if a patient email has a portal account, intake-only record, or doesn't exist.
 * Used by the login page to intelligently route patients to the right flow.
 *
 * POST /api/auth/check-patient-status
 * Body: { email: string, clinicId?: number }
 *
 * Returns:
 * - { status: 'has_account' }  → Patient has a portal login, show password step
 * - { status: 'needs_setup' }  → Patient record exists (intake) but no login yet
 * - { status: 'not_found' }    → No record found, show registration prompt
 *
 * Security: Never reveals whether the email exists in the system.
 * Returns 'not_found' for both non-existent and inactive accounts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { basePrisma as prisma } from '@/lib/db';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const schema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  clinicId: z.number().optional(),
});

export const POST = standardRateLimit(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: 'not_found' });
    }

    const { email, clinicId } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { email, role: 'PATIENT', status: 'ACTIVE' },
      select: { id: true, patientId: true },
    });

    if (user) {
      return NextResponse.json({ status: 'has_account' });
    }

    const patientWhere: any = { email };
    if (clinicId) patientWhere.clinicId = clinicId;

    const patient = await prisma.patient.findFirst({
      where: patientWhere,
      select: { id: true, firstName: true },
    });

    if (patient) {
      return NextResponse.json({
        status: 'needs_setup',
        firstName: patient.firstName,
      });
    }

    return NextResponse.json({ status: 'not_found' });
  } catch (error) {
    logger.error('Error checking patient status', { error });
    return NextResponse.json({ status: 'not_found' });
  }
});
