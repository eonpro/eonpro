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

/**
 * POST /api/ai/chat - Process a chat query
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validated = chatQuerySchema.parse(body);
    
    // Process query
    const response = await processAssistantQuery(
      validated.query,
      validated.userEmail,
      validated.sessionId,
      validated.patientId
    );
    
    return NextResponse.json({
      ok: true,
      data: response,
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // @ts-ignore
   
    logger.error('[API] Error processing chat query:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    // Check for rate limiting
    if (errorMessage.includes('Rate limit')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 429 }
      );
    }
    
    // Check for OpenAI errors
    if (errorMessage.includes('OpenAI')) {
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again later.' },
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
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const userEmail = searchParams.get('userEmail');
    const limit = searchParams.get('limit');
    
    if (sessionId) {
      // Get specific conversation history
      const conversation = await getConversationHistory(
        sessionId,
        limit ? parseInt(limit, 10) : 20
      );
      
      return NextResponse.json({
        ok: true,
        data: conversation,
      });
    } else if (userEmail) {
      // Get user's recent conversations
      const conversations = await getUserConversations(
        userEmail,
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
    // @ts-ignore
   
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
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }
    
    await endConversation(sessionId);
    
    return NextResponse.json({
      ok: true,
      message: 'Conversation ended',
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[API] Error ending conversation:', error);
    return NextResponse.json(
      { error: errorMessage || 'Failed to end conversation' },
      { status: 500 }
    );
  }
}
