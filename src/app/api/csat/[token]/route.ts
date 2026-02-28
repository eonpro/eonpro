/**
 * Public CSAT Response API Route
 * ==============================
 *
 * GET  /api/csat/[token] - Get survey details (no auth required)
 * POST /api/csat/[token] - Submit rating and feedback (no auth required)
 */

import { NextResponse, NextRequest } from 'next/server';
import { ticketCsatService } from '@/domains/ticket/services/ticket-csat.service';
import { logger } from '@/lib/logger';

interface RouteContext { params: Promise<{ token: string }>; }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;

    const survey = await ticketCsatService.getSurvey(token);
    if (!survey) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
    }

    return NextResponse.json({ survey });
  } catch (error) {
    logger.error('[CSAT API] GET error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to load survey' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const body = await request.json();

    const score = parseInt(body.score, 10);
    if (isNaN(score) || score < 1 || score > 5) {
      return NextResponse.json({ error: 'Score must be between 1 and 5' }, { status: 400 });
    }

    await ticketCsatService.submitResponse(token, score, body.feedback);

    return NextResponse.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit';
    logger.error('[CSAT API] POST error', { error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
