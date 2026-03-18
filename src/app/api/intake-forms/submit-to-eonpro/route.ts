import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { normalizeMedLinkPayload } from '@/lib/medlink/intakeNormalizer';
import { IntakeProcessor } from '@/lib/webhooks/intake-processor';
import { basePrisma, runWithClinicContext } from '@/lib/db';

/**
 * POST /api/intake-forms/submit-to-eonpro
 *
 * Processes intake form responses directly (no self-calling webhook).
 * Creates patient record + intake document in the EONMEDS clinic.
 *
 * Called from QualifiedStep when the patient qualifies for treatment.
 * This is a critical revenue path — built with retries and comprehensive logging.
 */

const EONMEDS_SUBDOMAIN = 'eonmeds';

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  logger.info(`[submit-to-eonpro ${requestId}] Intake submission received`);

  try {
    const body = await req.json();
    const { responses, submissionType, qualified } = body;

    if (!responses || typeof responses !== 'object') {
      logger.warn(`[submit-to-eonpro ${requestId}] Missing responses in body`);
      return NextResponse.json({ error: 'Missing responses' }, { status: 400 });
    }

    if (!responses.firstName && !responses.email) {
      logger.warn(`[submit-to-eonpro ${requestId}] No patient identifiers (name or email)`);
      return NextResponse.json({ error: 'Missing patient identifiers' }, { status: 400 });
    }

    // Resolve EONMEDS clinic
    const clinic = await basePrisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: EONMEDS_SUBDOMAIN },
          { name: { contains: 'EONMEDS', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true },
    });

    if (!clinic) {
      logger.error(`[submit-to-eonpro ${requestId}] EONMEDS clinic not found in database`);
      return NextResponse.json({ error: 'Clinic not found' }, { status: 500 });
    }

    logger.info(`[submit-to-eonpro ${requestId}] Clinic resolved: ${clinic.id} (${clinic.name})`);

    // Build the payload in the format the normalizer expects
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
        has_mental_health: responses.has_mental_health || '',
        mentalHealthConditions: responses.mental_health_conditions || '',
        has_chronic_conditions: responses.has_chronic_conditions || '',
        chronic_conditions_detail: responses.chronic_conditions_detail || '',
        digestiveConditions: Array.isArray(responses.digestive_conditions)
          ? responses.digestive_conditions.join(', ')
          : responses.digestive_conditions || '',
        has_kidney_conditions: responses.has_kidney_conditions || '',
        had_surgery: responses.had_surgery || '',
        surgicalHistory: Array.isArray(responses.surgery_types)
          ? responses.surgery_types.join(', ')
          : responses.surgery_types || '',
        glp1History: responses.glp1_history || '',
        glp1Type: responses.glp1_type || '',
        semaglutideDosage: responses.semaglutide_dosage || '',
        semaglutide_side_effects: Array.isArray(responses.semaglutide_side_effects)
          ? responses.semaglutide_side_effects.join(', ')
          : responses.semaglutide_side_effects || '',
        semaglutide_success: responses.semaglutide_success || '',
        tirzepatideDosage: responses.tirzepatide_dosage || '',
        tirzepatide_side_effects: Array.isArray(responses.tirzepatide_side_effects)
          ? responses.tirzepatide_side_effects.join(', ')
          : responses.tirzepatide_side_effects || '',
        tirzepatide_success: responses.tirzepatide_success || '',
        dosageSatisfaction: responses.dosage_satisfaction || '',
        recreationalDrugs: Array.isArray(responses.recreational_drugs)
          ? responses.recreational_drugs.join(', ')
          : responses.recreational_drugs || '',
        weightLossHistory: Array.isArray(responses.weight_loss_methods)
          ? responses.weight_loss_methods.join(', ')
          : responses.weight_loss_methods || '',
        weight_loss_support: Array.isArray(responses.weight_loss_support)
          ? responses.weight_loss_support.join(', ')
          : responses.weight_loss_support || '',
        dosage_interest: responses.dosage_interest || '',
        alcoholUse: responses.alcohol_consumption || '',
        common_side_effects: responses.common_side_effects || '',
        medicationPreference: responses.medication_preference || '',
        goals: Array.isArray(responses.goals)
          ? responses.goals.join(', ')
          : responses.goals || '',
        consent_accepted: responses.consent_accepted || '',
        terms_accepted: responses.terms_accepted || '',
        contact_consent: responses.contact_consent || '',
      },
      submissionType: submissionType || 'complete',
      qualified: qualified || 'Yes',
    };

    // Normalize using the same normalizer the webhook uses
    const normalized = normalizeMedLinkPayload(payload);

    logger.info(`[submit-to-eonpro ${requestId}] Normalized: ${normalized.answers?.length || 0} answers, patient: ${normalized.patient.firstName} ${normalized.patient.lastName}`);

    // Process using IntakeProcessor directly (no HTTP round-trip)
    const processor = new IntakeProcessor({
      source: 'eonpro',
      requestId,
    });

    const result = await runWithClinicContext(clinic.id, () =>
      processor.process(normalized, {
        clinicId: clinic.id,
        clinicSubdomain: EONMEDS_SUBDOMAIN,
        isPartialSubmission: submissionType === 'partial',
        generateSoapNote: submissionType !== 'partial',
        tags: ['weightlossintake', 'eonmeds', 'glp1', 'complete-intake', 'native-form'],
      })
    );

    const duration = Date.now() - startTime;

    if (result.success) {
      logger.info(`[submit-to-eonpro ${requestId}] SUCCESS in ${duration}ms — patient ${result.patient.patientId} (DB ID: ${result.patient.id}), isNew: ${result.patient.isNew}`);
    } else {
      logger.warn(`[submit-to-eonpro ${requestId}] Completed with ${result.errors.length} errors in ${duration}ms`, {
        errors: result.errors,
      });
    }

    return NextResponse.json({
      success: result.success,
      patientId: result.patient.patientId,
      eonproDatabaseId: result.patient.id,
      isNew: result.patient.isNew,
      documentId: result.document?.id || null,
      soapNoteId: result.soapNote?.id || null,
      processingTimeMs: duration,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);

    logger.error(`[submit-to-eonpro ${requestId}] FAILED in ${duration}ms`, {
      error: errMsg,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { error: 'Submission failed', message: errMsg, requestId },
      { status: 500 },
    );
  }
}
