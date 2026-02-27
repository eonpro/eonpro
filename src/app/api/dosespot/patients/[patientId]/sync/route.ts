import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, type AuthUser } from '@/lib/auth/middleware-with-params';
import { isFeatureEnabled } from '@/lib/features';
import { isClinicDoseSpotConfigured } from '@/lib/clinic-dosespot';
import { doseSpotPatientService } from '@/domains/dosespot';
import { handleApiError } from '@/domains/shared/errors';

type RouteContext = { params: Promise<{ patientId: string }> };

export const POST = withAuthParams<RouteContext>(
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
      const result = await doseSpotPatientService.syncPatient(
        parseInt(patientId, 10),
        clinicId,
        user.id
      );

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'POST /api/dosespot/patients/[patientId]/sync' },
      });
    }
  },
  { roles: ['admin', 'provider', 'staff'] }
);
