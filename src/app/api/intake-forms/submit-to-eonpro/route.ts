import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * POST /api/intake-forms/submit-to-eonpro
 *
 * Client-side proxy that forwards intake form responses to the internal
 * weightlossintake webhook. Keeps the webhook secret server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { responses, submissionType, qualified } = body;

    if (!responses || typeof responses !== 'object') {
      return NextResponse.json({ error: 'Missing responses' }, { status: 400 });
    }

    const secret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;
    if (!secret) {
      logger.error('[submit-to-eonpro] WEIGHTLOSSINTAKE_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Server config error' }, { status: 500 });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const payload = {
      data: {
        firstName: responses.firstName || '',
        lastName: responses.lastName || '',
        email: responses.email || '',
        phone: responses.phone || '',
        dateOfBirth: responses.dob || '',
        sex: responses.sex || '',
        state: responses.state || '',
        streetAddress: responses.street || '',
        apartment: responses.apartment || '',
        weight: responses.current_weight || '',
        idealWeight: responses.ideal_weight || '',
        height: responses.height_feet && responses.height_inches
          ? `${responses.height_feet}'${responses.height_inches}"`
          : '',
        bloodPressure: responses.blood_pressure || '',
        activityLevel: responses.activity_level || '',
        pregnancyStatus: responses.pregnancy_status || '',
        mentalHealthConditions: responses.mental_health_conditions || '',
        chronicConditions: responses.has_chronic_conditions || '',
        digestiveConditions: Array.isArray(responses.digestive_conditions)
          ? responses.digestive_conditions.join(', ')
          : responses.digestive_conditions || '',
        surgicalHistory: Array.isArray(responses.surgery_types)
          ? responses.surgery_types.join(', ')
          : responses.surgery_types || '',
        glp1History: responses.glp1_history || '',
        glp1Type: responses.glp1_type || '',
        semaglutideDosage: responses.semaglutide_dosage || '',
        tirzepatideDosage: responses.tirzepatide_dosage || '',
        dosageSatisfaction: responses.dosage_satisfaction || '',
        recreationalDrugs: Array.isArray(responses.recreational_drugs)
          ? responses.recreational_drugs.join(', ')
          : responses.recreational_drugs || '',
        weightLossHistory: Array.isArray(responses.weight_loss_methods)
          ? responses.weight_loss_methods.join(', ')
          : responses.weight_loss_methods || '',
        alcoholUse: responses.alcohol_consumption || '',
        medicationPreference: responses.medication_preference || '',
        goals: Array.isArray(responses.goals)
          ? responses.goals.join(', ')
          : responses.goals || '',
      },
      submissionType: submissionType || 'complete',
      qualified: qualified || 'Yes',
    };

    const webhookUrl = `${baseUrl}/api/webhooks/weightlossintake`;

    const webhookRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': secret,
      },
      body: JSON.stringify(payload),
    });

    const result = await webhookRes.json().catch(() => ({}));

    if (!webhookRes.ok) {
      logger.warn('[submit-to-eonpro] Webhook returned non-200', {
        status: webhookRes.status,
        result,
      });
    }

    return NextResponse.json({
      success: webhookRes.ok,
      patientId: result.eonproPatientId || result.patientId || null,
      eonproDatabaseId: result.eonproDatabaseId || null,
    });
  } catch (error) {
    logger.error('[submit-to-eonpro] Error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
  }
}
