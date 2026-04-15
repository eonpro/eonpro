import { NextResponse } from 'next/server';
import {
  mapIntakeToAirtable,
  createAirtableRecord,
  updateAirtableRecord,
} from '@/lib/wellmedr/airtableSync';

/**
 * POST /api/wellmedr/airtable-sync
 *
 * Syncs intake form responses to Airtable in real-time.
 * Called from the client after each step completion.
 *
 * Body: { sessionId: string, recordId?: string, responses: Record<string, unknown> }
 * Returns: { recordId: string } or { error: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, recordId, responses } = body as {
      sessionId?: string;
      recordId?: string;
      responses?: Record<string, unknown>;
    };

    if (!responses || typeof responses !== 'object') {
      return NextResponse.json({ error: 'Missing responses' }, { status: 400 });
    }

    const fields = mapIntakeToAirtable(responses);

    if (!fields || Object.keys(fields).length === 0) {
      console.log('[airtable-sync] No mappable fields, skipping');
      return NextResponse.json({ recordId: recordId || null });
    }

    // Primary field: "Submission id" (Airtable primary field name with space + capital S)
    if (sessionId) {
      fields['Submission id'] = sessionId;
    }

    if (recordId) {
      await updateAirtableRecord(recordId, fields);
      return NextResponse.json({ recordId });
    }

    const newRecordId = await createAirtableRecord(fields);
    return NextResponse.json({ recordId: newRecordId });
  } catch (err) {
    console.error('[airtable-sync] Error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
