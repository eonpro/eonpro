/**
 * SOAP Note Automation Service
 *
 * Ensures SOAP notes exist for patients who have paid and are ready for prescription.
 * This is a critical clinical documentation requirement.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { generateSOAPFromIntake } from '@/services/ai/soapNoteService';
import { generateSOAPNote, type SOAPGenerationInput } from '@/services/ai/openaiService';
import type { SOAPNote, Patient, PatientDocument, Invoice } from '@prisma/client';
import { decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';

export interface EnsureSoapNoteResult {
  success: boolean;
  soapNoteId: number | null;
  soapNoteStatus: string | null;
  action: 'existing' | 'generated' | 'failed' | 'no_data';
  error?: string;
}

/**
 * Check if a patient has a valid SOAP note (not empty/placeholder)
 */
export async function getPatientSoapNote(patientId: number): Promise<SOAPNote | null> {
  const soapNote = await prisma.sOAPNote.findFirst({
    where: {
      patientId,
      // Exclude empty/placeholder notes
      subjective: { not: '' },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Additional validation - ensure content is meaningful
  if (soapNote && soapNote.subjective && soapNote.subjective.length > 20) {
    return soapNote;
  }

  return null;
}

/**
 * Ensure a SOAP note exists for a patient
 *
 * This function:
 * 1. Checks if patient already has a valid SOAP note
 * 2. If not, attempts to generate from intake document
 * 3. If no intake document, attempts to generate from invoice metadata
 * 4. Returns the result with appropriate status
 */
export async function ensureSoapNoteExists(
  patientId: number,
  invoiceId?: number
): Promise<EnsureSoapNoteResult> {
  const logContext = { patientId, invoiceId };

  try {
    // Step 1: Check for existing SOAP note
    const existingSoapNote = await getPatientSoapNote(patientId);

    if (existingSoapNote) {
      logger.debug('[SOAP-AUTOMATION] Patient already has SOAP note', {
        ...logContext,
        soapNoteId: existingSoapNote.id,
        status: existingSoapNote.status,
      });

      return {
        success: true,
        soapNoteId: existingSoapNote.id,
        soapNoteStatus: existingSoapNote.status,
        action: 'existing',
      };
    }

    // Step 2: Get patient info
    const rawPatient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!rawPatient) {
      logger.warn('[SOAP-AUTOMATION] Patient not found', logContext);
      return {
        success: false,
        soapNoteId: null,
        soapNoteStatus: null,
        action: 'failed',
        error: 'Patient not found',
      };
    }

    // CRITICAL: Decrypt patient PHI fields before using them for SOAP note generation
    // Without this, encrypted values like DOB will cause NaN age calculations and
    // encrypted names will appear in the SOAP note text
    const patient = {
      ...rawPatient,
      ...decryptPatientPHI(
        rawPatient as Record<string, unknown>,
        DEFAULT_PHI_FIELDS as unknown as string[]
      ),
    } as Patient;

    logger.debug('[SOAP-AUTOMATION] Decrypted patient PHI', {
      ...logContext,
      hasDecryptedFirstName: !!patient.firstName && !patient.firstName.includes(':'),
      hasDecryptedDob: !!patient.dob && !String(patient.dob).includes(':'),
    });

    // Step 2b: Query documents separately to avoid any filtering issues
    // Use explicit select to avoid referencing columns that may not exist yet (e.g. s3DataKey)
    const documents = await prisma.patientDocument.findMany({
      where: {
        patientId,
        category: 'MEDICAL_INTAKE_FORM',
      },
      select: {
        id: true,
        patientId: true,
        clinicId: true,
        filename: true,
        mimeType: true,
        category: true,
        createdAt: true,
        data: true,
        externalUrl: true,
        source: true,
        sourceSubmissionId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    // CRITICAL: Log document query results for debugging
    logger.info('[SOAP-AUTOMATION] Document query result', {
      ...logContext,
      documentsFound: documents.length,
      patientClinicId: patient.clinicId,
      documentIds: documents.map((d: { id: number }) => d.id),
      documentSources: documents.map((d: { source: string | null }) => d.source),
    });

    // Also check if there are ANY documents for this patient
    const allDocs = await prisma.patientDocument.findMany({
      where: { patientId },
      select: { id: true, category: true, source: true, createdAt: true },
    });
    logger.info('[SOAP-AUTOMATION] All patient documents', {
      ...logContext,
      totalDocs: allDocs.length,
      categories: allDocs.map((d: { category: string }) => d.category),
      sources: allDocs.map((d: { source: string | null }) => d.source),
    });

    // Skip test/demo patients (using decrypted values)
    const isTestPatient =
      patient.firstName?.toLowerCase() === 'unknown' ||
      patient.lastName?.toLowerCase() === 'unknown' ||
      patient.firstName?.toLowerCase().includes('test') ||
      patient.lastName?.toLowerCase().includes('test') ||
      patient.firstName?.toLowerCase().includes('demo') ||
      patient.lastName?.toLowerCase().includes('demo') ||
      patient.email?.toLowerCase().includes('test') ||
      patient.email?.toLowerCase().includes('demo');

    if (isTestPatient) {
      logger.debug('[SOAP-AUTOMATION] Skipping test/demo patient', logContext);
      return {
        success: false,
        soapNoteId: null,
        soapNoteStatus: null,
        action: 'no_data',
        error: 'Test/demo patient - skipped',
      };
    }

    // Step 3: Try to generate from intake document
    if (documents && documents.length > 0) {
      const intakeDoc = documents[0];

      logger.info('[SOAP-AUTOMATION] Step 3: Generating SOAP note from intake document', {
        ...logContext,
        documentId: intakeDoc.id,
        documentSource: intakeDoc.source,
        hasData: !!intakeDoc.data,
        dataSize: intakeDoc.data ? intakeDoc.data.length : 0,
      });

      try {
        const soapNote = await generateSOAPFromIntake(patientId, intakeDoc.id);

        logger.info('[SOAP-AUTOMATION] ✓ SOAP note generated successfully', {
          ...logContext,
          soapNoteId: soapNote.id,
        });

        return {
          success: true,
          soapNoteId: soapNote.id,
          soapNoteStatus: soapNote.status,
          action: 'generated',
        };
      } catch (genError: any) {
        const errorMsg = genError.message || 'Unknown error';
        logger.error('[SOAP-AUTOMATION] Failed to generate from intake', {
          ...logContext,
          error: errorMsg,
          status: genError.status,
          code: genError.code,
          stack: genError.stack?.split('\n').slice(0, 3).join(' | '),
        });

        // Check if this is a data parsing issue (which we can try to recover from)
        // vs an API/config error (which we should fail fast on)
        const isDataParsingIssue =
          errorMsg.includes('No intake document') ||
          errorMsg.includes('parse') ||
          errorMsg.includes('JSON') ||
          errorMsg.includes('undefined') ||
          errorMsg.includes('null');

        // If NOT a data parsing issue, it's likely an API/config problem - fail immediately
        if (!isDataParsingIssue) {
          logger.error(
            '[SOAP-AUTOMATION] API/config error detected, not continuing to other data sources',
            {
              ...logContext,
              error: errorMsg,
            }
          );
          return {
            success: false,
            soapNoteId: null,
            soapNoteStatus: null,
            action: 'failed',
            error: errorMsg,
          };
        }
        // Continue to try invoice metadata only if it was a data parsing issue
        logger.warn('[SOAP-AUTOMATION] Data parsing issue, trying other data sources', {
          ...logContext,
          error: errorMsg,
        });
      }
    }

    // Step 4: Try to generate from invoice metadata (Heyflow patients)
    // Look up invoice by ID or by patient's latest paid invoice
    let invoice = null;
    if (invoiceId) {
      invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
      });
    } else {
      // Try to find latest paid invoice for this patient
      invoice = await prisma.invoice.findFirst({
        where: {
          patientId,
          status: 'PAID',
        },
        orderBy: { paidAt: 'desc' },
      });
    }

    if (invoice?.metadata && typeof invoice.metadata === 'object') {
      const metadata = invoice.metadata as Record<string, unknown>;

      // Check if metadata has sufficient intake data
      const hasIntakeData =
        metadata.weight ||
        metadata.height ||
        metadata.currentMedications ||
        metadata.allergies ||
        metadata.medicalConditions ||
        metadata.goals;

      logger.debug('[SOAP-AUTOMATION] Invoice metadata check', {
        ...logContext,
        invoiceId: invoice.id,
        hasIntakeData,
        metadataKeys: Object.keys(metadata).slice(0, 15).join(', '),
      });

      if (hasIntakeData) {
        logger.info('[SOAP-AUTOMATION] Generating SOAP note from invoice metadata', {
          ...logContext,
          hasFields: Object.keys(metadata).slice(0, 10).join(', '),
        });

        try {
          const soapNote = await generateSoapFromInvoiceMetadata(patient, metadata);

          logger.info('[SOAP-AUTOMATION] ✓ SOAP note generated from invoice metadata', {
            ...logContext,
            soapNoteId: soapNote.id,
          });

          return {
            success: true,
            soapNoteId: soapNote.id,
            soapNoteStatus: soapNote.status,
            action: 'generated',
          };
        } catch (metaError: any) {
          const errorMsg = metaError.message || 'Unknown error';
          logger.error('[SOAP-AUTOMATION] Failed to generate from invoice metadata', {
            ...logContext,
            error: errorMsg,
          });

          // Check if this is a data issue vs API/config error
          const isDataIssue =
            errorMsg.includes('parse') ||
            errorMsg.includes('JSON') ||
            errorMsg.includes('undefined') ||
            errorMsg.includes('null');

          if (!isDataIssue) {
            // API/config error - fail immediately
            return {
              success: false,
              soapNoteId: null,
              soapNoteStatus: null,
              action: 'failed',
              error: errorMsg,
            };
          }
        }
      }
    }

    // Step 5: Try to generate from IntakeFormSubmission (internal intake forms)
    const intakeSubmission = await prisma.intakeFormSubmission.findFirst({
      where: {
        patientId,
        status: 'completed',
      },
      orderBy: { completedAt: 'desc' },
      include: {
        responses: {
          include: {
            question: {
              select: {
                questionText: true,
                section: true,
              },
            },
          },
        },
      },
    });

    if (intakeSubmission && intakeSubmission.responses.length > 0) {
      logger.info('[SOAP-AUTOMATION] Generating SOAP note from intake form submission', {
        ...logContext,
        submissionId: intakeSubmission.id,
        responseCount: intakeSubmission.responses.length,
      });

      try {
        const soapNote = await generateSoapFromIntakeSubmission(patient, intakeSubmission);

        logger.info('[SOAP-AUTOMATION] ✓ SOAP note generated from intake submission', {
          ...logContext,
          soapNoteId: soapNote.id,
        });

        return {
          success: true,
          soapNoteId: soapNote.id,
          soapNoteStatus: soapNote.status,
          action: 'generated',
        };
      } catch (submissionError: any) {
        const errorMsg = submissionError.message || 'Unknown error';
        logger.error('[SOAP-AUTOMATION] Failed to generate from intake submission', {
          ...logContext,
          error: errorMsg,
          status: submissionError.status,
          code: submissionError.code,
        });

        // Always fail on intake submission errors - this is the last data source
        return {
          success: false,
          soapNoteId: null,
          soapNoteStatus: null,
          action: 'failed',
          error: errorMsg,
        };
      }
    }

    // Step 6: No data available - flag for manual review
    logger.warn('[SOAP-AUTOMATION] No intake data available for SOAP generation', {
      ...logContext,
      checkedDocuments: documents.length,
      checkedInvoice: !!invoice,
      checkedIntakeSubmission: !!intakeSubmission,
      intakeSubmissionStatus: intakeSubmission?.status,
      intakeSubmissionResponses: intakeSubmission?.responses?.length,
    });

    return {
      success: false,
      soapNoteId: null,
      soapNoteStatus: null,
      action: 'no_data',
      error: 'No intake data available - requires manual SOAP note creation',
    };
  } catch (error: any) {
    logger.error('[SOAP-AUTOMATION] Unexpected error ensuring SOAP note', {
      ...logContext,
      error: error.message,
    });

    return {
      success: false,
      soapNoteId: null,
      soapNoteStatus: null,
      action: 'failed',
      error: error.message,
    };
  }
}

/**
 * Generate SOAP note from invoice metadata (for Heyflow/external intake patients)
 */
async function generateSoapFromInvoiceMetadata(
  patient: Patient,
  metadata: Record<string, unknown>
): Promise<SOAPNote> {
  // Build intake data from metadata fields
  const intakeData: Record<string, unknown> = {
    // Patient info
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dob,
    gender: patient.gender,

    // From metadata
    weight: metadata.weight,
    height: metadata.height,
    bmi: metadata.bmi,
    goalWeight: metadata.goalWeight || metadata.goal_weight,

    // Medical history
    currentMedications:
      metadata.currentMedications || metadata.current_medications || metadata.medications,
    allergies: metadata.allergies,
    medicalConditions:
      metadata.medicalConditions || metadata.medical_conditions || metadata.conditions,
    healthConditions: metadata.healthConditions || metadata.health_conditions,

    // GLP-1 specific
    glp1History: metadata.glp1_last_30 || metadata.glp1History,
    glp1Medication: metadata.glp1_last_30_medication_type || metadata.glp1Medication,
    glp1Dose: metadata.glp1_last_30_medication_dose_mg || metadata.glp1Dose,

    // Treatment preferences
    preferredMedication:
      metadata.preferred_meds || metadata.preferredMedication || metadata.product,
    medicationType: metadata.medicationType || metadata.medication_type,

    // Goals
    primaryGoal: metadata.primary_fitness_goal || metadata.primaryGoal || metadata.goals,
    motivation: metadata.weight_loss_motivation || metadata.motivation,

    // Lifestyle
    activityLevel: metadata.activity_level || metadata.activityLevel,
    sleepQuality: metadata.sleep_quality || metadata.sleepQuality,
  };

  // Filter out undefined values
  const cleanedIntakeData = Object.fromEntries(
    Object.entries(intakeData).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );

  const soapInput: SOAPGenerationInput = {
    intakeData: cleanedIntakeData,
    patientName: `${patient.firstName} ${patient.lastName}`,
    dateOfBirth: patient.dob || undefined,
    chiefComplaint:
      (metadata.goals as string) ||
      (metadata.primary_fitness_goal as string) ||
      'Weight loss evaluation',
  };

  const generatedSOAP = await generateSOAPNote(soapInput);

  // Store in database
  const soapNote = await prisma.sOAPNote.create({
    data: {
      patientId: patient.id,
      clinicId: patient.clinicId,
      subjective: generatedSOAP.subjective,
      objective: generatedSOAP.objective,
      assessment: generatedSOAP.assessment,
      plan: generatedSOAP.plan,
      medicalNecessity: generatedSOAP.medicalNecessity,
      sourceType: 'INVOICE_METADATA',
      generatedByAI: true,
      aiModelVersion: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      status: 'DRAFT',
      promptTokens: generatedSOAP.metadata.usage?.promptTokens,
      completionTokens: generatedSOAP.metadata.usage?.completionTokens,
      estimatedCost: generatedSOAP.metadata.usage?.estimatedCost,
    },
  });

  return soapNote;
}

/**
 * Generate SOAP note from IntakeFormSubmission (internal intake forms)
 */
interface IntakeSubmissionWithResponses {
  id: number;
  responses: Array<{
    answer: string | null;
    question: {
      questionText: string;
      section: string | null;
    };
  }>;
}

async function generateSoapFromIntakeSubmission(
  patient: Patient,
  submission: IntakeSubmissionWithResponses
): Promise<SOAPNote> {
  // Convert responses to a structured format
  const responsesBySection: Record<string, Record<string, string>> = {};
  const flatResponses: Record<string, string> = {};

  for (const response of submission.responses) {
    if (!response.answer) continue;

    const section = response.question.section || 'General';
    const questionKey = response.question.questionText
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    if (!responsesBySection[section]) {
      responsesBySection[section] = {};
    }
    responsesBySection[section][questionKey] = response.answer;
    flatResponses[questionKey] = response.answer;
  }

  // Extract key medical data from responses
  const intakeData: Record<string, unknown> = {
    // Patient info
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dob,
    gender: patient.gender,

    // Physical measurements - try various question formats
    weight: flatResponses.starting_weight || flatResponses.weight || flatResponses.current_weight,
    height: flatResponses.height,
    idealWeight: flatResponses.ideal_weight || flatResponses.goal_weight,
    bmi: flatResponses.bmi,
    bloodPressure: flatResponses.blood_pressure,
    heartRate: flatResponses.resting_heart_rate || flatResponses.heart_rate,

    // Medical history
    medicalConditions: flatResponses.medical_conditions || flatResponses.health_conditions,
    secondaryConditions: flatResponses.secondary_health_conditions,
    currentMedications: flatResponses.current_medications || flatResponses.medications,
    allergies: flatResponses.allergies,
    familyHistory: flatResponses.family_medical_history,
    surgicalHistory: flatResponses.surgical_history,

    // Weight-related
    weightSymptoms: flatResponses.weight_related_symptoms,
    weightLossHistory: flatResponses.weight_loss_history,

    // GLP-1 specific
    glp1History: flatResponses.glp_1_medication_history || flatResponses.used_glp_1_in_last_30_days,
    glp1Type: flatResponses.recent_glp_1_medication_type,
    medicationPreference: flatResponses.medication_preference,
    injectionPreference: flatResponses.injection_vs_tablet_preference,
    semaglutideDose: flatResponses.semaglutide_dose,
    tirzepatideDose: flatResponses.tirzepatide_dose,
    previousSideEffects: flatResponses.previous_side_effects,

    // Medical flags
    hasDiabetes: flatResponses.has_diabetes,
    hasGastroparesis: flatResponses.has_gastroparesis,
    hasPancreatitis: flatResponses.has_pancreatitis,
    hasThyroidCancer: flatResponses.has_thyroid_cancer,
    men2History: flatResponses.men2_history_glp_1_contraindication,
    bariatricSurgery: flatResponses.prior_bariatric_surgery,
    pregnancyStatus: flatResponses.pregnancy_status,
    opioidUse: flatResponses.opioid_use,

    // Mental health
    mentalHealthHistory: flatResponses.mental_health_history,

    // Lifestyle
    activityLevel: flatResponses.daily_physical_activity,
    sleepQuality: flatResponses.sleep_quality,
    alcoholIntake: flatResponses.alcohol_intake,
    recreationalDrugUse: flatResponses.recreational_drug_use,

    // Goals and preferences
    healthGoals: flatResponses.health_goals,
    motivation: flatResponses.weight_loss_motivation,
    motivationLevel: flatResponses.motivation_level,
    preferredPace: flatResponses.preferred_weight_loss_pace,
    budgetPreference: flatResponses.budget_vs_potency_preference,

    // Visit info
    reasonForVisit: flatResponses.reason_for_visit,
    chiefComplaint: flatResponses.chief_complaint,
    additionalInfo: flatResponses.additional_information,

    // Include all responses grouped by section for comprehensive context
    allResponses: responsesBySection,
  };

  // Filter out undefined/null values
  const cleanedIntakeData = Object.fromEntries(
    Object.entries(intakeData).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );

  // Determine chief complaint
  const chiefComplaint =
    flatResponses.chief_complaint ||
    flatResponses.reason_for_visit ||
    flatResponses.health_goals ||
    'Weight management evaluation';

  const soapInput: SOAPGenerationInput = {
    intakeData: cleanedIntakeData,
    patientName: `${patient.firstName} ${patient.lastName}`,
    dateOfBirth: patient.dob || undefined,
    chiefComplaint,
  };

  logger.debug('[SOAP-AUTOMATION] Generating SOAP from intake submission', {
    patientId: patient.id,
    submissionId: submission.id,
    dataFields: Object.keys(cleanedIntakeData).length,
    chiefComplaint,
  });

  const generatedSOAP = await generateSOAPNote(soapInput);

  // Store in database
  const soapNote = await prisma.sOAPNote.create({
    data: {
      patientId: patient.id,
      clinicId: patient.clinicId,
      subjective: generatedSOAP.subjective,
      objective: generatedSOAP.objective,
      assessment: generatedSOAP.assessment,
      plan: generatedSOAP.plan,
      medicalNecessity: generatedSOAP.medicalNecessity,
      sourceType: 'AI_GENERATED', // Using AI_GENERATED for intake form submissions
      generatedByAI: true,
      aiModelVersion: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      status: 'DRAFT',
      promptTokens: generatedSOAP.metadata.usage?.promptTokens,
      completionTokens: generatedSOAP.metadata.usage?.completionTokens,
      estimatedCost: generatedSOAP.metadata.usage?.estimatedCost,
    },
  });

  logger.info('[SOAP-AUTOMATION] Created SOAP note from intake submission', {
    patientId: patient.id,
    soapNoteId: soapNote.id,
    sourceType: 'AI_GENERATED',
  });

  return soapNote;
}

/**
 * Batch process: Check all paid invoices without SOAP notes
 * Useful for catching up on missed SOAP note generation
 */
export async function processMissingSoapNotes(
  clinicId?: number,
  limit: number = 50
): Promise<{
  processed: number;
  generated: number;
  failed: number;
  noData: number;
  results: EnsureSoapNoteResult[];
}> {
  const whereClause: any = {
    status: 'PAID',
    prescriptionProcessed: false,
    patient: {
      soapNotes: {
        none: {},
      },
    },
  };

  if (clinicId) {
    whereClause.clinicId = clinicId;
  }

  const paidInvoicesWithoutSoap = await prisma.invoice.findMany({
    where: whereClause,
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    take: limit,
    orderBy: { paidAt: 'asc' },
  });

  logger.info(
    `[SOAP-AUTOMATION] Processing ${paidInvoicesWithoutSoap.length} invoices without SOAP notes`
  );

  const results: EnsureSoapNoteResult[] = [];
  let generated = 0;
  let failed = 0;
  let noData = 0;

  for (const invoice of paidInvoicesWithoutSoap) {
    const result = await ensureSoapNoteExists(invoice.patientId, invoice.id);
    results.push(result);

    if (result.action === 'generated') generated++;
    else if (result.action === 'failed') failed++;
    else if (result.action === 'no_data') noData++;

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  logger.info('[SOAP-AUTOMATION] Batch processing complete', {
    processed: results.length,
    generated,
    failed,
    noData,
  });

  return {
    processed: results.length,
    generated,
    failed,
    noData,
    results,
  };
}
