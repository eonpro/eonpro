/**
 * Patient Finance Analytics API
 * 
 * GET /api/finance/patients
 * Returns patient payment analytics, LTV, cohorts, and at-risk patients
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClinicContext, withClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { PatientAnalyticsService } from '@/services/analytics/patientAnalytics';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clinicId = getClinicContext();
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    // Fetch all patient analytics data in parallel
    const [
      metrics,
      segments,
      atRisk,
      cohorts,
      paymentBehavior,
      retentionMatrix,
    ] = await Promise.all([
      PatientAnalyticsService.getPatientMetrics(clinicId),
      PatientAnalyticsService.getPatientSegments(clinicId),
      PatientAnalyticsService.getAtRiskPatients(clinicId, 20),
      PatientAnalyticsService.getCohortAnalysis(clinicId, 'signup'),
      PatientAnalyticsService.getPaymentBehavior(clinicId),
      PatientAnalyticsService.getRetentionMatrix(clinicId, 12),
    ]);

    return NextResponse.json({
      metrics,
      segments,
      atRisk,
      cohorts,
      paymentBehavior,
      retentionMatrix,
    });
  } catch (error) {
    logger.error('Failed to fetch patient analytics', { error });
    return NextResponse.json(
      { error: 'Failed to fetch patient analytics' },
      { status: 500 }
    );
  }
}
