import { NextRequest } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { getClinicIdFromRequest } from '@/lib/clinic/utils';
import { runStreamingAssistant } from '@/services/ai/streamingAssistant';
import cache from '@/lib/cache/redis';

export const maxDuration = 60;

const bodySchema = z.object({
  query: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
  userEmail: z.string().email(),
  patientId: z.number().optional(),
});

const RATE_LIMIT_WINDOW_S = 60;
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute per user

/**
 * POST /api/ai/chat/stream — Streaming Becca AI v2
 *
 * Returns an SSE stream with events:
 *   text_delta, tool_call_start, tool_call_result, suggestions, done, error
 */
export const POST = withAuth(async (request: NextRequest, user: AuthUser) => {
  // Per-user rate limiting via Redis (fail-open if Redis unavailable)
  const rateLimitKey = `becca:rl:${user.id}`;
  try {
    const current = await cache.increment(rateLimitKey, 1, { ttl: RATE_LIMIT_WINDOW_S });
    if (current && current > RATE_LIMIT_MAX_REQUESTS) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch {
    // Redis unavailable — allow request through (fail-open)
  }

  let clinicId: number | undefined = user.clinicId;
  if (!clinicId) {
    const fromReq = await getClinicIdFromRequest(request);
    clinicId = fromReq ?? undefined;
  }

  if (!clinicId) {
    return new Response(
      JSON.stringify({ error: 'Unable to determine clinic. Please refresh the page.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    body = bodySchema.parse(raw);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid request data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  logger.info('[BeccaV2] Streaming request', {
    userId: user.id,
    clinicId,
    patientId: body.patientId,
    hasSession: !!body.sessionId,
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const writer = {
        write(event: string, data: unknown) {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        },
        close() {
          controller.close();
        },
      };

      try {
        await runStreamingAssistant(
          {
            query: body.query,
            userEmail: body.userEmail,
            clinicId: clinicId!,
            sessionId: body.sessionId,
            patientId: body.patientId,
          },
          writer
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Internal error';
        logger.error('[BeccaV2] Stream error', {
          error: msg,
          userId: user.id,
          clinicId,
        });

        try {
          writer.write('error', { message: 'An error occurred. Please try again.' });
          writer.close();
        } catch {
          // Controller may already be closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});
