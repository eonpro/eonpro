import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import {
  mapIntakeToAirtable,
  createAirtableRecord,
  updateAirtableRecord,
} from '@/lib/wellmedr/airtableSync';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const MAX_RESPONSE_KEYS = 50;

const airtableSyncSchema = z.object({
  sessionId: z.string().min(1).max(200).optional(),
  recordId: z.string().min(1).max(200).startsWith('rec').optional(),
  responses: z
    .record(z.string().max(100), z.unknown())
    .refine((obj) => Object.keys(obj).length <= MAX_RESPONSE_KEYS, {
      message: `responses must have at most ${MAX_RESPONSE_KEYS} keys`,
    }),
});

async function handler(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = airtableSyncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { sessionId, recordId, responses } = parsed.data;

    const fields = mapIntakeToAirtable(responses);

    if (!fields || Object.keys(fields).length === 0) {
      logger.info('[airtable-sync] No mappable fields, skipping');
      return NextResponse.json({ recordId: recordId || null });
    }

    if (sessionId) {
      fields['Submission id'] = sessionId;
    }

    if (recordId) {
      await updateAirtableRecord(recordId, fields);
      return NextResponse.json({ recordId });
    }

    const newRecordId = await createAirtableRecord(fields);
    return NextResponse.json({ recordId: newRecordId });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'airtable-sync' },
    });
    logger.error('[airtable-sync] Error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

export const POST = rateLimit({ max: 30, windowMs: 60_000 })(handler);
