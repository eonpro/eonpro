/**
 * Patient AI Insights API
 * Personalized health insights for the patient dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import {
  generatePatientInsights,
  generateWeeklySummary,
} from '@/services/ai/patientAssistantService';
import { logger } from '@/lib/logger';

/**
 * GET /api/patient-portal/ai/insights
 * Get personalized insights for the patient
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!user.patientId) {
      return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get('type');

    if (type === 'weekly-summary') {
      const summary = await generateWeeklySummary(user.patientId);
      return NextResponse.json({ summary });
    }

    const insights = await generatePatientInsights(user.patientId);

    return NextResponse.json({ insights });
  } catch (error) {
    logger.error('Patient insights error:', error);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
});
