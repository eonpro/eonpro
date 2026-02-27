import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, type AuthUser } from '@/lib/auth/middleware-with-params';
import { isFeatureEnabled } from '@/lib/features';
import { isClinicDoseSpotConfigured } from '@/lib/clinic-dosespot';
import { doseSpotPrescriptionService } from '@/domains/dosespot';
import { handleApiError } from '@/domains/shared/errors';

type RouteContext = { params: Promise<{ patientId: string }> };

export const GET = withAuthParams<RouteContext>(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      if (!isFeatureEnabled('DOSSPOT_EPRESCRIBING')) {
        return NextResponse.json({ error: 'DoseSpot is not enabled' }, { status: 403 });
      }

      const clinicId = user.clinicId;
      if (!clinicId) {
        return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
      }

      const configured = await isClinicDoseSpotConfigured(clinicId);
      if (!configured) {
        return NextResponse.json(
          { error: 'DoseSpot is not configured for this clinic' },
          { status: 403 }
        );
      }

      const { patientId } = await context.params;
      const { searchParams } = new URL(req.url);
      const page = parseInt(searchParams.get('page') || '0', 10);
      const size = parseInt(searchParams.get('size') || '10', 10);

      const result = await doseSpotPrescriptionService.getPatientPrescriptions(
        parseInt(patientId, 10),
        clinicId,
        user.id,
        page,
        size
      );

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'GET /api/dosespot/patients/[patientId]/prescriptions' },
      });
    }
  },
  { roles: ['admin', 'provider', 'staff'] }
);
