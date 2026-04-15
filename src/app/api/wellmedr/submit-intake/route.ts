import { NextResponse } from 'next/server';

/**
 * POST /api/wellmedr/submit-intake
 *
 * Internal endpoint called when a patient completes the hosted WellMedR
 * intake form and is about to redirect to checkout.
 *
 * Forwards the intake data to the wellmedr-intake webhook with the
 * correct secret so the patient gets created in EONPRO.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const secret = process.env.WELLMEDR_INTAKE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[submit-intake] WELLMEDR_INTAKE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Secret not configured' }, { status: 500 });
    }

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const webhookUrl = `${protocol}://${host}/api/webhooks/wellmedr-intake`;

    console.log('[submit-intake] Forwarding intake to webhook, sessionId:', body['submission-id']);

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': secret,
      },
      body: JSON.stringify(body),
    });

    const responseText = await res.text();
    console.log('[submit-intake] Webhook response status:', res.status);

    if (!res.ok) {
      return NextResponse.json({ error: 'Webhook failed', status: res.status }, { status: 502 });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    return NextResponse.json({
      success: true,
      patientId: data.eonproPatientId || data.patientId || null,
    });
  } catch (err) {
    console.error('[submit-intake] Error:', err);
    return NextResponse.json({ error: 'Failed to submit intake' }, { status: 500 });
  }
}
