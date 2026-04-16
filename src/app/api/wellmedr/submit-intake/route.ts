import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const MAX_BODY_SIZE = 100 * 1024; // 100 KB

const submitIntakeSchema = z
  .object({
    'submission-id': z.string().min(1).max(500),
  })
  .passthrough();

async function handler(req: NextRequest) {
  try {
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    const rawText = await req.text();
    if (rawText.length > MAX_BODY_SIZE) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = submitIntakeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const secret = process.env.WELLMEDR_INTAKE_WEBHOOK_SECRET;
    if (!secret) {
      logger.error('[submit-intake] WELLMEDR_INTAKE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const webhookUrl = `${protocol}://${host}/api/webhooks/wellmedr-intake`;

    logger.info('[submit-intake] Forwarding intake to webhook', {
      submissionId: parsed.data['submission-id'],
    });

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': secret,
      },
      body: rawText,
    });

    const responseText = await res.text();
    logger.info('[submit-intake] Webhook response', { status: res.status });

    if (!res.ok) {
      logger.error('[submit-intake] Webhook failed', { status: res.status });
      return NextResponse.json({ error: 'Intake submission failed' }, { status: 502 });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = {};
    }

    return NextResponse.json({
      success: true,
      patientId: data.eonproPatientId || data.patientId || null,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'submit-intake' },
    });
    logger.error('[submit-intake] Error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to submit intake' }, { status: 500 });
  }
}

export const POST = rateLimit({ max: 5, windowMs: 60_000 })(handler);
