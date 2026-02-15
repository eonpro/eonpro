/**
 * Patient AI Chat API
 * Endpoint for patient-facing Becca AI assistant
 *
 * NOTE: Patient data is passed to the AI service which sends it to OpenAI.
 * The patientAssistantService handles context building internally.
 * TODO: anonymizeForAI from @/lib/security/anonymize should be applied in
 * patientAssistantService.getPatientContext() before sending to OpenAI to
 * ensure PHI is not transmitted to third-party AI providers (HIPAA).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { processPatientChat, PatientChatMessage } from '@/services/ai/patientAssistantService';
import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/security/rate-limiter';
import { logger } from '@/lib/logger';
import { logPHIAccess } from '@/lib/audit/hipaa-audit';
import { z } from 'zod';

const chatSchema = z.object({
  message: z.string().min(1).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
});

/**
 * POST /api/patient-portal/ai/chat
 * Send a message to Becca AI
 * Rate limited: 10 requests per minute per IP
 */
export const POST = withRateLimit(
  withAuth(async (req: NextRequest, user: AuthUser) => {
    try {
      if (!user.patientId) {
        return NextResponse.json({ error: 'Patient ID required' }, { status: 400 });
      }

      const body = await req.json();
      const parsed = chatSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { message, history } = parsed.data;

      logger.info('Patient AI chat request', {
        patientId: user.patientId,
        messageLength: message.length,
      });

      const response = await processPatientChat(
        user.patientId,
        message,
        history as PatientChatMessage[]
      );

      // If escalation is needed, log it and potentially notify care team
      if (response.shouldEscalate) {
        logger.warn('Patient AI chat escalation triggered', {
          patientId: user.patientId,
          reason: response.escalationReason,
        });

        // Could trigger notification to care team here
        // await notifyCareTeam(user.patientId, response.escalationReason);
      }

      await logPHIAccess(req, user, 'AIChat', String(user.patientId), user.patientId, {
        shouldEscalate: response.shouldEscalate,
      });

      return NextResponse.json(response);
    } catch (error) {
      logger.error('Patient AI chat error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        patientId: user.patientId,
      });
      return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
    }
  }, { roles: ['patient'] }),
  RATE_LIMIT_CONFIGS.ai
);
