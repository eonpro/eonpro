import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, type AuthUser } from '@/lib/auth/middleware';
import { isClinicDoseSpotConfigured } from '@/lib/clinic-dosespot';
import { doseSpotPrescriptionService } from '@/domains/dosespot';
import { handleApiError } from '@/domains/shared/errors';

async function handler(req: NextRequest, user: AuthUser) {
  try {
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
    const searchTerm = searchParams.get('searchTerm');
    const pageNumber = parseInt(searchParams.get('pageNumber') || '1', 10);

    if (!searchTerm) {
      return NextResponse.json({ error: 'searchTerm is required' }, { status: 400 });
    }

    const result = await doseSpotPrescriptionService.searchDiagnosis(
      searchTerm,
      clinicId,
      user.id,
      pageNumber
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error, {
      context: { route: 'GET /api/dosespot/diagnoses/search' },
    });
  }
}

export const GET = withClinicalAuth(handler);
