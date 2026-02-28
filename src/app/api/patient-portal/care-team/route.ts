import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';

export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    // Get patient's clinic
    const patient = await prisma.patient.findUnique({
      where: { id: user.patientId },
      select: { clinicId: true },
    });

    if (!patient?.clinicId) {
      return NextResponse.json({ providers: [] });
    }

    // Get providers assigned to this clinic (bounded)
    const providerClinics = await prisma.providerClinic.findMany({
      where: {
        clinicId: patient.clinicId,
        isActive: true,
      },
      include: {
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            titleLine: true,
            status: true,
          },
        },
      },
      take: 100,
    });

    const providers = providerClinics
      .map(pc => ({
        ...pc.provider,
        isActive: pc.provider.status === 'ACTIVE',
      }))
      .filter(p => p.isActive);

    await logPHIAccess(req, user, 'ProviderCareTeam', String(user.patientId), user.patientId);

    return NextResponse.json({ providers });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/patient-portal/care-team' } });
  }
}, { roles: ['patient'] });
