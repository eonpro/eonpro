import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { updateAirtableRecord } from '@/lib/wellmedr/airtableSync';
import { rateLimit } from '@/lib/rateLimit';
import { extractCustomerIdFromToken } from '@/lib/wellmedr/upsell-auth';
import { logger } from '@/lib/logger';

const glp1DetailsSchema = z.object({
  airtableRecordId: z.string().min(1).max(200).startsWith('rec'),
  details: z.string().min(1, 'Details are required').max(1000),
});

async function handler(req: NextRequest) {
  try {
    const authToken = req.cookies.get('wellmedr_upsell_auth')?.value;
    const customerId = authToken ? extractCustomerIdFromToken(authToken) : null;

    if (!customerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = glp1DetailsSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { airtableRecordId, details } = parsed.data;

    logger.info('[wellmedr/glp1-details] Updating record', {
      customerId,
      airtableRecordId,
    });

    const success = await updateAirtableRecord(airtableRecordId, {
      previous_glp1_details: details,
      stripe_customer_id: customerId,
    });

    if (!success) {
      return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { module: 'wellmedr-checkout', route: 'update-glp1-details' },
    });
    return NextResponse.json({ error: 'Failed to update GLP-1 details' }, { status: 500 });
  }
}

export const POST = rateLimit({ max: 10, windowMs: 60_000 })(handler);
