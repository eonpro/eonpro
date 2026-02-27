import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, type AuthUser } from '@/lib/auth/middleware-with-params';
import { isFeatureEnabled } from '@/lib/features';
import { isClinicDoseSpotConfigured } from '@/lib/clinic-dosespot';
import { doseSpotProviderService } from '@/domains/dosespot';
import { handleApiError } from '@/domains/shared/errors';

type RouteContext = { params: Promise<{ providerId: string }> };

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

      const { providerId } = await context.params;
      const result = await doseSpotProviderService.syncProvider(
        parseInt(providerId, 10),
        clinicId,
        user.id
      );

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'POST /api/dosespot/providers/[providerId]/sync' },
      });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
