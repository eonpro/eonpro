/**
 * Patient Finance Analytics API
 *
 * GET /api/finance/patients
 * Returns patient payment analytics, LTV, cohorts, and at-risk patients
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { PatientAnalyticsService } from '@/services/analytics/patientAnalytics';

export const GET = withAdminAuth(async (request: NextRequest, user) => {
  try {
    const clinicId = user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const [metrics, segments, atRisk, cohorts, paymentBehavior] =
      await Promise.all([
        PatientAnalyticsService.getPatientMetrics(clinicId),
        PatientAnalyticsService.getPatientSegments(clinicId),
        PatientAnalyticsService.getAtRiskPatients(clinicId, 20),
        PatientAnalyticsService.getCohortAnalysis(clinicId, 'signup'),
        PatientAnalyticsService.getPaymentBehavior(clinicId),
      ]);

    // Derive retention matrix from cohort data — no extra DB query needed
    const retentionMatrix = PatientAnalyticsService.buildRetentionMatrix(cohorts);

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
    return NextResponse.json({ error: 'Failed to fetch patient analytics' }, { status: 500 });
  }
});
