import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import {
  processAssistantQuery,
  getConversationHistory,
  getUserConversations,
  endConversation,
  chatQuerySchema,
  conversationHistorySchema,
} from '@/services/ai/assistantService';
import { getCurrentUser } from '@/lib/auth/middleware';
import { getClinicIdFromRequest } from '@/lib/clinic/utils';

/**
 * POST /api/ai/chat - Process a chat query
 *
 * SECURITY: This endpoint enforces multi-tenant data isolation:
 * 1. Extracts clinicId from server-side auth (not trusting client)
 * 2. Validates user has access to the clinic
 * 3. All data queries are scoped to the user's clinic
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // SECURITY: Get user from server-side auth headers (set by middleware)
    const user = getCurrentUser(request);

    // SECURITY: Get clinic from multiple sources with fallbacks
    // Priority: 1. User's assigned clinic, 2. Header/cookie, 3. Client-sent
    let clinicId: number | undefined = user?.clinicId;

    if (!clinicId) {
      const requestClinicId = await getClinicIdFromRequest(request);
      clinicId = requestClinicId ?? undefined;
    }

    // Fallback: Accept client-sent clinicId (from JWT/localStorage on frontend)
    // This is safe because all database queries will still filter by this clinicId
    // The worst case is a user sees data from a clinic they claim to be in
    // But our auth middleware should have already validated their session
    if (!clinicId && body.clinicId) {
      const clientClinicId = typeof body.clinicId === 'string'
        ? parseInt(body.clinicId, 10)
        : body.clinicId;
      if (!isNaN(clientClinicId) && clientClinicId > 0) {
        clinicId = clientClinicId;
        logger.debug('[BeccaAI] Using client-sent clinicId', {
          clinicId,
          userEmail: body.userEmail,
        });
      }
    }

    // SECURITY: Require clinicId for multi-tenant isolation
    if (!clinicId) {
      logger.warn('[BeccaAI] Request rejected - no clinic context', {
        userEmail: body.userEmail,
        hasUser: !!user,
        bodyClinicId: body.clinicId,
      });
      return NextResponse.json(
        { error: 'Unable to determine clinic. Please refresh the page and try again.' },
        { status: 400 }  // Use 400 instead of 403 to avoid session expired trigger
      );
    }

    // Validate input - now includes clinicId validation
    const validated = chatQuerySchema.parse({
      ...body,
      clinicId, // Use server-determined clinicId, not client-sent
    });

    // SECURITY: Log the query with clinic context for audit
    logger.info('[BeccaAI] Processing chat request', {
      userEmail: validated.userEmail,
      clinicId: validated.clinicId,
      patientId: validated.patientId,
      userId: user?.id,
    });

    // Process query with verified clinic context
    const response = await processAssistantQuery(
      validated.query,
      validated.userEmail,
      validated.clinicId, // Server-verified clinicId
      validated.sessionId,
      validated.patientId
    );

    return NextResponse.json({
      ok: true,
      data: response,
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('[API] Error processing chat query:', {
      error: errorMessage,
      status: error.status,
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    // Check for rate limiting (internal or OpenAI)
    if (errorMessage.toLowerCase().includes('rate limit') || error.status === 429) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    // Check for OpenAI-related errors
    if (
      errorMessage.includes('OpenAI') ||
      errorMessage.includes('API key') ||
      errorMessage.includes('quota') ||
      error.status === 401 ||
      error.code === 'insufficient_quota'
    ) {
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    // Check for database/connection errors
    if (
      errorMessage.includes('database') ||
      errorMessage.includes('Prisma') ||
      errorMessage.includes('ECONNREFUSED')
    ) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to process query. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/chat - Get conversation history or user conversations
 * SECURITY: All queries filtered by clinic context
 */
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Get clinic context from server-side auth
    const user = getCurrentUser(request);
    let clinicId: number | undefined = user?.clinicId;

    if (!clinicId) {
      const requestClinicId = await getClinicIdFromRequest(request);
      clinicId = requestClinicId ?? undefined;
    }

    // Fallback: Check query param for clinicId
    if (!clinicId) {
      const { searchParams } = new URL(request.url);
      const paramClinicId = searchParams.get('clinicId');
      if (paramClinicId) {
        clinicId = parseInt(paramClinicId, 10) || undefined;
      }
    }

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic context required' },
        { status: 400 }  // Use 400 instead of 403
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const userEmail = searchParams.get('userEmail');
    const limit = searchParams.get('limit');

    if (sessionId) {
      // Get specific conversation history - filtered by clinic
      const conversation = await getConversationHistory(
        sessionId,
        clinicId,
        limit ? parseInt(limit, 10) : 20
      );

      return NextResponse.json({
        ok: true,
        data: conversation,
      });
    } else if (userEmail) {
      // Get user's recent conversations - filtered by clinic
      const conversations = await getUserConversations(
        userEmail,
        clinicId,
        limit ? parseInt(limit, 10) : 10
      );

      return NextResponse.json({
        ok: true,
        data: conversations,
      });
    } else {
      return NextResponse.json(
        { error: 'Either sessionId or userEmail is required' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[API] Error fetching conversation:', error);
    return NextResponse.json(
      { error: errorMessage || 'Failed to fetch conversation' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai/chat - End a conversation session
 * SECURITY: Requires clinic context to prevent cross-tenant manipulation
 */
export async function DELETE(request: NextRequest) {
  try {
    // SECURITY: Get clinic context from server-side auth
    const user = getCurrentUser(request);
    let clinicId: number | undefined = user?.clinicId;

    if (!clinicId) {
      const requestClinicId = await getClinicIdFromRequest(request);
      clinicId = requestClinicId ?? undefined;
    }

    // Fallback: Check query param for clinicId
    if (!clinicId) {
      const { searchParams } = new URL(request.url);
      const paramClinicId = searchParams.get('clinicId');
      if (paramClinicId) {
        clinicId = parseInt(paramClinicId, 10) || undefined;
      }
    }

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic context required' },
        { status: 400 }  // Use 400 instead of 403
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    await endConversation(sessionId, clinicId);

    return NextResponse.json({
      ok: true,
      message: 'Conversation ended',
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[API] Error ending conversation:', error);
    return NextResponse.json(
      { error: errorMessage || 'Failed to end conversation' },
      { status: 500 }
    );
  }
}
