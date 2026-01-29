/**
 * Patient AI Chat API
 * Endpoint for patient-facing Becca AI assistant
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { processPatientChat, PatientChatMessage } from '@/services/ai/patientAssistantService';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const chatSchema = z.object({
  message: z.string().min(1).max(1000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
});

/**
 * POST /api/patient-portal/ai/chat
 * Send a message to Becca AI
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
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

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Patient AI chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
});
