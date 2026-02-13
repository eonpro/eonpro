/**
 * GET /api/auth/register/validate-invite?invite=<token>
 * Validates a one-time portal invite token and returns prefill data for the registration form.
 * Does not expose PHI beyond what is needed to prefill the form (email, firstName, lastName, clinicName).
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateInviteToken } from '@/lib/portal-invite/service';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const inviteToken = searchParams.get('invite');

    if (!inviteToken || inviteToken.length < 32) {
      return NextResponse.json(
        { valid: false, error: 'Invalid or missing invite link' },
        { status: 400 }
      );
    }

    const result = await validateInviteToken(inviteToken);

    if (!result) {
      return NextResponse.json({
        valid: false,
        error:
          'This invite link is invalid or has expired. Please request a new one from your care team.',
      });
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: result.clinicId },
      select: { name: true, logoUrl: true },
    });

    return NextResponse.json({
      valid: true,
      email: result.patient.email,
      firstName: result.patient.firstName,
      lastName: result.patient.lastName,
      phone: result.patient.phone ?? '',
      dob: result.patient.dob ?? '',
      clinicName: clinic?.name ?? 'Your Clinic',
      clinicLogoUrl: clinic?.logoUrl ?? null,
    });
  } catch (err) {
    logger.error('[ValidateInvite] Error', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return NextResponse.json({ valid: false, error: 'Unable to validate invite' }, { status: 500 });
  }
}
