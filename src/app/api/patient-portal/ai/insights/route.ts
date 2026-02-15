/**
 * Patient AI Insights API
 * Personalized health insights for the patient dashboard
 *
 * NOTE: Patient data is fetched and processed by the AI service layer.
 * TODO: anonymizeForAI from @/lib/security/anonymize should be applied in
 * patientAssistantService before sending patient context to OpenAI (HIPAA).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import {
  generatePatientInsights,
  generateWeeklySummary,
} from '@/services/ai/patientAssistantService';
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/security/rate-limiter';
import { logger } from '@/lib/logger';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';

/**
 * GET /api/patient-portal/ai/insights
 * Get personalized insights for the patient
 * Rate limited: 10 requests per minute per IP
 */
export const GET = withRateLimit(
  withAuth(async (req: NextRequest, user: AuthUser) => {
    try {
      if (!user.patientId) {
        return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
      }

      const searchParams = req.nextUrl.searchParams;
      const type = searchParams.get('type');

      if (type === 'weekly-summary') {
        const summary = await generateWeeklySummary(user.patientId);

        await logPHIAccess(req, user, 'AIInsights', String(user.patientId), user.patientId, {
          insightType: 'weekly-summary',
        });

        return NextResponse.json({ summary });
      }

      const insights = await generatePatientInsights(user.patientId);

      await logPHIAccess(req, user, 'AIInsights', String(user.patientId), user.patientId, {
        insightType: 'general',
      });

      return NextResponse.json({ insights });
    } catch (error) {
      logger.error('Patient insights error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        patientId: user.patientId,
      });
      return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
    }
  }, { roles: ['patient'] }),
  RATE_LIMIT_CONFIGS.ai
);
