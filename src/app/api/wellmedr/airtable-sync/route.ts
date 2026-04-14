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

    console.log(
      '[airtable-sync] POST received, sessionId:',
      sessionId,
      'recordId:',
      recordId,
      'responseKeys:',
      responses ? Object.keys(responses).length : 0
    );

    if (!responses || typeof responses !== 'object') {
      console.warn('[airtable-sync] Missing responses in body');
      return NextResponse.json({ error: 'Missing responses' }, { status: 400 });
    }

    const fields = mapIntakeToAirtable(responses);
    console.log(
      '[airtable-sync] Mapped fields:',
      Object.keys(fields).length,
      '→',
      Object.keys(fields).join(', ')
    );

    if (!fields || Object.keys(fields).length === 0) {
      console.log('[airtable-sync] No mappable fields, skipping');
      return NextResponse.json({ recordId: recordId || null });
    }

    // Primary field: "Submission id" (Airtable primary field name with space + capital S)
    if (sessionId) {
      fields['Submission id'] = sessionId;
    }

    if (recordId) {
      console.log('[airtable-sync] Updating existing record:', recordId);
      const ok = await updateAirtableRecord(recordId, fields);
      if (!ok) {
        console.error('[airtable-sync] Update failed for record:', recordId);
      }
      return NextResponse.json({ recordId });
    }

    console.log('[airtable-sync] Creating new record...');
    const newRecordId = await createAirtableRecord(fields);
    console.log('[airtable-sync] New record ID:', newRecordId);
    return NextResponse.json({ recordId: newRecordId });
  } catch (err) {
    console.error('[airtable-sync] Error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
