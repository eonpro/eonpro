import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const submitIntakeSchema = z
  .object({
    'submission-id': z.string().min(1).max(200),
  })
  .passthrough();

async function handler(req: NextRequest) {
  try {
    const body = await req.json();
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
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const webhookUrl = `${protocol}://${host}/api/webhooks/wellmedr-intake`;

    logger.info('[submit-intake] Forwarding intake to webhook', {
      sessionId: parsed.data['submission-id'],
    });

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': secret,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      logger.error('[submit-intake] Webhook returned error', { status: res.status });
      return NextResponse.json({ error: 'Webhook failed', status: res.status }, { status: 502 });
    }

    let data;
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    return NextResponse.json({
      success: true,
      patientId: data.eonproPatientId || data.patientId || null,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { module: 'wellmedr-checkout', route: 'submit-intake' },
    });
    logger.error('[submit-intake] Error', err instanceof Error ? err : undefined);
    return NextResponse.json({ error: 'Failed to submit intake' }, { status: 500 });
  }
}

export const POST = rateLimit({ max: 5, windowMs: 60_000 })(handler);
