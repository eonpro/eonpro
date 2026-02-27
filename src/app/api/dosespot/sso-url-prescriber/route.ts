import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, type AuthUser } from '@/lib/auth/middleware';
import { isFeatureEnabled } from '@/lib/features';
import { isClinicDoseSpotConfigured } from '@/lib/clinic-dosespot';
import { doseSpotSSOService } from '@/domains/dosespot';
import { handleApiError } from '@/domains/shared/errors';

async function handler(req: NextRequest, user: AuthUser) {
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

    const { searchParams } = new URL(req.url);
    const prescriberIdParam = searchParams.get('prescriberId') || String(user.providerId || '');

    if (!prescriberIdParam) {
      return NextResponse.json({ error: 'prescriberId is required' }, { status: 400 });
    }

    const result = await doseSpotSSOService.getPrescriberSSOUrl(
      parseInt(prescriberIdParam, 10),
      clinicId,
      user.id
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'GET /api/dosespot/sso-url-prescriber' },
    });
  }
}

export const GET = withClinicalAuth(handler);
