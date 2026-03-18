import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { IntakeProcessor } from '@/lib/webhooks/intake-processor';
import { basePrisma, runWithClinicContext } from '@/lib/db';
import type { NormalizedIntake, NormalizedPatient, IntakeSection, IntakeEntry } from '@/lib/medlink/types';

/**
 * POST /api/intake-forms/submit-to-eonpro
 *
 * Native intake submission — builds NormalizedIntake DIRECTLY from form
 * responses. No normalizer, no re-keying, no data loss.
 *
 * The form engine stores responses with exact storageKeys (firstName,
 * lastName, email, dob, sex, street, etc.). We map them 1:1 to the
 * NormalizedIntake format the IntakeProcessor expects.
 */

const EONMEDS_SUBDOMAIN = 'eonmeds';

const FIELD_LABELS: Record<string, string> = {
  goals: 'Health Goals',
  medication_preference: 'Medication Preference',
  consent_accepted: 'Consent Accepted',
  state: 'State',
  terms_accepted: 'Terms Accepted',
  firstName: 'First Name',
  lastName: 'Last Name',
  dob: 'Date of Birth',
  sex: 'Gender',
  email: 'Email',
  phone: 'Phone Number',
  contact_consent: 'Contact Consent',
  street: 'Street Address',
  apartment: 'Apartment/Suite',
  ideal_weight: 'Ideal Weight',
  current_weight: 'Starting Weight',
  height_feet: 'Height (feet)',
  height_inches: 'Height (inches)',
  pregnancy_status: 'Pregnancy Status',
  activity_level: 'Daily Physical Activity',
  has_mental_health: 'Mental Health Diagnosis',
  mental_health_conditions: 'Mental Health Conditions',
  has_chronic_conditions: 'Chronic Conditions',
  chronic_conditions_detail: 'Chronic Conditions Details',
  digestive_conditions: 'Digestive Conditions',
  has_kidney_conditions: 'Kidney Problems',
  had_surgery: 'Surgery History',
  surgery_types: 'Surgery Types',
  blood_pressure: 'Blood Pressure',
  glp1_history: 'GLP-1 Medication History',
  glp1_type: 'Current GLP-1 Medication',
  semaglutide_dosage: 'Semaglutide Dose',
  semaglutide_side_effects: 'Semaglutide Side Effects',
  semaglutide_success: 'Semaglutide Success',
  tirzepatide_dosage: 'Tirzepatide Dose',
  tirzepatide_side_effects: 'Tirzepatide Side Effects',
  tirzepatide_success: 'Tirzepatide Success',
  dosage_satisfaction: 'Dosage Satisfaction',
  recreational_drugs: 'Recreational Drug Use',
  weight_loss_methods: 'Weight Loss History',
  weight_loss_support: 'Weight Loss Support Preferences',
  dosage_interest: 'Personalized Dosage Interest',
  alcohol_consumption: 'Alcohol Intake',
  common_side_effects: 'Side Effect Concerns',
};

function formatValue(val: unknown): string {
  if (val === undefined || val === null || val === '') return '';
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  logger.info(`[submit-to-eonpro ${requestId}] Native intake submission received`);

  try {
    const body = await req.json();
    const { responses, submissionType, qualified } = body;

    if (!responses || typeof responses !== 'object') {
      logger.warn(`[submit-to-eonpro ${requestId}] Missing responses`);
      return NextResponse.json({ error: 'Missing responses' }, { status: 400 });
    }

    if (!responses.firstName && !responses.email) {
      logger.warn(`[submit-to-eonpro ${requestId}] No patient identifiers`);
      return NextResponse.json({ error: 'Missing patient identifiers' }, { status: 400 });
    }

    // Resolve clinic
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
      logger.error(`[submit-to-eonpro ${requestId}] EONMEDS clinic not found`);
      return NextResponse.json({ error: 'Clinic not found' }, { status: 500 });
    }

    // Build patient directly from storageKeys — zero translation
    const patient: NormalizedPatient = {
      firstName: String(responses.firstName || 'Unknown'),
      lastName: String(responses.lastName || 'Unknown'),
      email: String(responses.email || '').toLowerCase().trim(),
      phone: String(responses.phone || '').replace(/\D/g, ''),
      dob: String(responses.dob || ''),
      gender: responses.sex === 'female' ? 'Female' : responses.sex === 'male' ? 'Male' : String(responses.sex || ''),
      address1: String(responses.street || ''),
      address2: String(responses.apartment || ''),
      city: String(responses.addressCity || ''),
      state: String(responses.state || '').toUpperCase(),
      zip: String(responses.addressZipCode || ''),
    };

    // Build answers from ALL responses — every storageKey becomes an answer
    const answers: IntakeEntry[] = [];
    for (const [key, value] of Object.entries(responses)) {
      const formatted = formatValue(value);
      if (!formatted) continue;
      answers.push({
        id: key,
        label: FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        value: formatted,
        rawValue: value,
      });
    }

    // Build sections for organized display on patient profile
    const sections: IntakeSection[] = [
      {
        title: 'Patient Information',
        entries: answers.filter((a) =>
          ['firstName', 'lastName', 'email', 'phone', 'dob', 'sex', 'state', 'street', 'apartment'].includes(a.id)
        ),
      },
      {
        title: 'Physical Measurements',
        entries: answers.filter((a) =>
          ['current_weight', 'ideal_weight', 'height_feet', 'height_inches', 'blood_pressure'].includes(a.id)
        ),
      },
      {
        title: 'Medical History',
        entries: answers.filter((a) =>
          ['pregnancy_status', 'activity_level', 'has_mental_health', 'mental_health_conditions',
           'has_chronic_conditions', 'chronic_conditions_detail', 'digestive_conditions',
           'has_kidney_conditions', 'had_surgery', 'surgery_types'].includes(a.id)
        ),
      },
      {
        title: 'GLP-1 Medications',
        entries: answers.filter((a) =>
          ['glp1_history', 'glp1_type', 'semaglutide_dosage', 'semaglutide_side_effects',
           'semaglutide_success', 'tirzepatide_dosage', 'tirzepatide_side_effects',
           'tirzepatide_success', 'dosage_satisfaction', 'medication_preference'].includes(a.id)
        ),
      },
      {
        title: 'Lifestyle',
        entries: answers.filter((a) =>
          ['recreational_drugs', 'weight_loss_methods', 'weight_loss_support',
           'dosage_interest', 'alcohol_consumption', 'common_side_effects', 'goals'].includes(a.id)
        ),
      },
    ];

    const normalized: NormalizedIntake = {
      submissionId: `native-${requestId}`,
      submittedAt: new Date(),
      patient,
      sections: sections.filter((s) => s.entries.length > 0),
      answers,
    };

    logger.info(`[submit-to-eonpro ${requestId}] Built NormalizedIntake: ${answers.length} answers, patient: ${patient.firstName} ${patient.lastName} <${patient.email}>`);

    const processor = new IntakeProcessor({ source: 'eonpro', requestId });

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
      logger.info(`[submit-to-eonpro ${requestId}] SUCCESS in ${duration}ms — patient ${result.patient.patientId} (ID: ${result.patient.id}), new: ${result.patient.isNew}, doc: ${result.document?.id}, soap: ${result.soapNote?.id}`);
    } else {
      logger.warn(`[submit-to-eonpro ${requestId}] Partial success with ${result.errors.length} errors in ${duration}ms`, { errors: result.errors });
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

    logger.error(`[submit-to-eonpro ${requestId}] FAILED in ${duration}ms: ${errMsg}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { error: 'Submission failed', message: errMsg, requestId },
      { status: 500 },
    );
  }
}
